// ═══════════════════════════════════════════════════════════════
// Módulo: cadastro.js — página pública de cadastro self-service (cadastro/).
// Dois fluxos, duas Edge Functions (nenhuma com authGuard — ver comentário
// no início de cada uma pra saber por quê):
//   - Gerente → criar-loja: cria a loja + o Gerente, status 'Pendente' até
//     o Administrador aprovar.
//   - Vendedor → cadastrar-vendedor: entra numa loja JÁ EXISTENTE via
//     código, status 'Pendente' até o Gerente daquela loja aprovar.
// ═══════════════════════════════════════════════════════════════
import { db } from './supabaseClient.js';

let perfilAtual = 'Gerente';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function mostrarErro(msg) {
    const el = document.getElementById('cadastroMsg');
    if (el) el.innerHTML = msg ? `<span class="error-message">${escapeHtml(msg)}</span>` : '';
}

// Troca os campos visíveis do form conforme o perfil escolhido — Gerente
// pede nome da loja (vai criar uma), Vendedor pede o código de uma loja
// já existente (vai se vincular a ela, nunca cria nada).
function alternarPerfilCadastro(perfil) {
    perfilAtual = perfil;
    document.querySelectorAll('#segmentoPerfil .segment-btn').forEach(el => {
        el.classList.toggle('active', el.dataset.perfil === perfil);
    });
    const ehGerente = perfil === 'Gerente';
    document.getElementById('campoNomeLoja').style.display = ehGerente ? 'block' : 'none';
    document.getElementById('campoCodigoLoja').style.display = ehGerente ? 'none' : 'block';
    document.getElementById('cadastroSubtitle').textContent = ehGerente
        ? 'Cadastre sua loja e comece a montar sua equipe.'
        : 'Peça o código da loja pro seu gerente pra se cadastrar.';
    mostrarErro('');
}

// Troca o conteúdo do card pra tela de "confirme seu e-mail" — mesma
// técnica usada em auth.js pra tela de status bloqueado: reaproveita o
// próprio .login-card em vez de duplicar overlay/markup.
function mostrarTelaConfirmacao(email, perfil) {
    const card = document.querySelector('#cadastroOverlay .login-card');
    if (!card) return;
    const avisoAprovacao = perfil === 'Gerente'
        ? 'Depois de confirmar, sua conta ainda passa por uma aprovação do administrador antes de liberar o acesso.'
        : 'Depois de confirmar, sua conta ainda passa por uma aprovação do gerente da loja antes de liberar o acesso.';
    card.innerHTML = `
        <div class="login-icon" aria-hidden="true" style="background:linear-gradient(135deg, var(--brand-blue), var(--accent-green));">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
        </div>
        <h2>Confirme seu e-mail</h2>
        <p class="subtitle">Enviamos um link de confirmação pra <strong>${escapeHtml(email)}</strong>. Clique nele pra ativar sua conta.</p>
        <p class="subtitle" style="font-size:12.5px;">${avisoAprovacao}</p>
        <button class="login-btn" id="btnReenviar" type="button"><span class="btn-text">Reenviar e-mail</span></button>
        <div class="login-msg" id="reenviarMsg" role="alert"></div>
    `;
    document.getElementById('btnReenviar')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const { error } = await db.auth.resend({ type: 'signup', email });
            const msg = document.getElementById('reenviarMsg');
            if (error) {
                if (msg) msg.innerHTML = `<span class="error-message">Não foi possível reenviar agora. Tente de novo em instantes.</span>`;
            } else if (msg) {
                msg.innerHTML = `<span style="color:var(--status-success-text);">E-mail reenviado!</span>`;
            }
        } finally {
            btn.disabled = false;
        }
    });
}

// Lê a mensagem de erro específica que a Edge Function devolveu, mesmo
// quando ela responde com status de erro (400 etc) — nesse caso o
// supabase-js joga um FunctionsHttpError em `error` com o Response cru em
// `error.context`, e NÃO popula `data`. Sem isso, todo erro de negócio
// (e-mail duplicado, código de loja inválido...) virava a mensagem
// genérica de "tente novamente".
async function extrairMensagemErro(data, error) {
    if (data?.error) return data.error;
    if (error?.context?.json) {
        try {
            const corpo = await error.context.json();
            return corpo?.error;
        } catch (_) { /* corpo não era JSON */ }
    }
    return null;
}

async function handleCadastro(e) {
    e.preventDefault();
    const btn = document.getElementById('btnCadastrar');
    if (btn.disabled) return;

    const nomeResponsavel = document.getElementById('campoNomeResponsavel').value.trim();
    const telefone = document.getElementById('campoTelefone').value.trim();
    const email = document.getElementById('campoEmail').value.trim();
    const senha = document.getElementById('campoSenha').value;
    const confirmarSenha = document.getElementById('campoConfirmarSenha').value;
    const aceiteTermos = document.getElementById('campoAceite').checked;
    const website = document.getElementById('campoWebsite').value; // honeypot

    mostrarErro('');

    if (!nomeResponsavel || !email || !senha) {
        mostrarErro('Preencha todos os campos.');
        return;
    }
    if (senha.length < 8) {
        mostrarErro('A senha precisa ter pelo menos 8 caracteres.');
        return;
    }
    if (senha !== confirmarSenha) {
        mostrarErro('As senhas não coincidem.');
        return;
    }
    if (!aceiteTermos) {
        mostrarErro('É preciso aceitar os Termos de Uso e a Política de Privacidade.');
        return;
    }

    let nomeFunction, payload;
    if (perfilAtual === 'Gerente') {
        const nomeLoja = document.getElementById('campoNomeLoja').value.trim();
        if (!nomeLoja) { mostrarErro('Informe o nome da loja.'); return; }
        nomeFunction = 'criar-loja';
        payload = { nomeLoja, nomeResponsavel, telefone, email, senha, aceiteTermos, website };
    } else {
        const codigoLoja = document.getElementById('campoCodigoLoja').value.trim();
        if (!codigoLoja) { mostrarErro('Informe o código da loja (peça ao seu gerente).'); return; }
        nomeFunction = 'cadastrar-vendedor';
        payload = { codigoLoja, nome: nomeResponsavel, telefone, email, senha, aceiteTermos, website };
    }

    btn.classList.add('loading');
    btn.disabled = true;
    try {
        const { data, error } = await db.functions.invoke(nomeFunction, { body: payload });
        if (error || data?.error) {
            const mensagem = await extrairMensagemErro(data, error);
            mostrarErro(mensagem || 'Não foi possível criar a conta. Tente novamente.');
            return;
        }
        // Sinaliza pro app mostrar o aviso de boas-vindas no primeiro login
        // (ver avisarPrimeiroAcesso() em auth.js). Usa localStorage em vez de
        // depender do link de confirmação do Supabase carregar um parâmetro
        // específico na URL de redirect — isso é configuração do painel
        // (Authentication > URL Configuration), fora do nosso controle por
        // código; localStorage sobrevive ao redirect contanto que caia no
        // mesmo domínio, o que já é o comportamento padrão.
        try { localStorage.setItem('cvcrm_onboarding_pendente', '1'); } catch (_) { /* Safari privado etc — sem essa, só não mostra o toast */ }
        mostrarTelaConfirmacao(email, perfilAtual);
    } catch (err) {
        mostrarErro('Não foi possível criar a conta: ' + err.message);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

document.getElementById('formCadastro')?.addEventListener('submit', handleCadastro);
window.alternarPerfilCadastro = alternarPerfilCadastro;
