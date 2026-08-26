// ═══════════════════════════════════════════════════════════════
// Módulo: cadastro.js — página pública de cadastro self-service (cadastro/).
// Chama a Edge Function `criar-loja` (a única do projeto sem authGuard —
// ver comentário no início dela) e mostra o estado de "confirme seu e-mail".
// ═══════════════════════════════════════════════════════════════
import { db } from './supabaseClient.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function mostrarErro(msg) {
    const el = document.getElementById('cadastroMsg');
    if (el) el.innerHTML = `<span class="error-message">${escapeHtml(msg)}</span>`;
}

// Troca o conteúdo do card pra tela de "confirme seu e-mail" — mesma
// técnica usada em auth.js pra tela de assinatura bloqueada: reaproveita o
// próprio .login-card em vez de duplicar overlay/markup.
function mostrarTelaConfirmacao(email) {
    const card = document.querySelector('#cadastroOverlay .login-card');
    if (!card) return;
    card.innerHTML = `
        <div class="login-icon" aria-hidden="true" style="background:linear-gradient(135deg, var(--brand-blue), var(--accent-green));">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
        </div>
        <h2>Confirme seu e-mail</h2>
        <p class="subtitle">Enviamos um link de confirmação pra <strong>${escapeHtml(email)}</strong>. Clique nele pra ativar sua conta.</p>
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

async function handleCadastro(e) {
    e.preventDefault();
    const btn = document.getElementById('btnCadastrar');
    if (btn.disabled) return;

    const nomeLoja = document.getElementById('campoNomeLoja').value.trim();
    const nomeResponsavel = document.getElementById('campoNomeResponsavel').value.trim();
    const email = document.getElementById('campoEmail').value.trim();
    const senha = document.getElementById('campoSenha').value;
    const confirmarSenha = document.getElementById('campoConfirmarSenha').value;
    const aceiteTermos = document.getElementById('campoAceite').checked;
    const website = document.getElementById('campoWebsite').value; // honeypot

    mostrarErro('');

    if (!nomeLoja || !nomeResponsavel || !email || !senha) {
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

    btn.classList.add('loading');
    btn.disabled = true;
    try {
        const { data, error } = await db.functions.invoke('criar-loja', {
            body: { nomeLoja, nomeResponsavel, email, senha, aceiteTermos, website },
        });
        // supabase-js só popula `error` pra falha de rede/HTTP — erro de
        // negócio (ex: e-mail duplicado) vem no corpo com `data.error`.
        if (error || data?.error) {
            mostrarErro(data?.error || 'Não foi possível criar a conta. Tente novamente.');
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
        mostrarTelaConfirmacao(email);
    } catch (err) {
        mostrarErro('Não foi possível criar a conta: ' + err.message);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

document.getElementById('formCadastro')?.addEventListener('submit', handleCadastro);
