// ═══════════════════════════════════════════════════════════════
// Módulo: reset-senha.js — página pública que finaliza a recuperação de
// senha (reset-senha/). Chegou aqui através do link enviado por
// db.auth.resetPasswordForEmail() (ver enviarLinkRecuperacaoSenha em
// auth.js). O Supabase client já detecta o token na URL sozinho
// (detectSessionInUrl, padrão do createClient) e dispara o evento
// PASSWORD_RECOVERY — não há verificação manual de token aqui.
// ═══════════════════════════════════════════════════════════════
import { db } from './supabaseClient.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function getCard() {
    return document.querySelector('#resetOverlay .login-card');
}

function mostrarFormularioNovaSenha() {
    const card = getCard();
    if (!card || document.getElementById('formNovaSenha')) return; // já está mostrando
    card.innerHTML = `
        <div class="login-icon" aria-hidden="true">CV</div>
        <h2>Crie uma nova senha</h2>
        <p class="subtitle">Escolha uma senha com pelo menos 8 caracteres.</p>
        <form class="login-form" id="formNovaSenha">
            <input type="password" id="novaSenha" placeholder="Nova senha" autocomplete="new-password" minlength="8" required>
            <input type="password" id="confirmarNovaSenha" placeholder="Confirme a nova senha" autocomplete="new-password" minlength="8" required>
            <button type="submit" class="login-btn" id="btnSalvarNovaSenha">
                <span class="spinner"></span>
                <span class="btn-text">Salvar nova senha</span>
            </button>
        </form>
        <div class="login-msg" id="novaSenhaMsg" role="alert"></div>
    `;
    document.getElementById('formNovaSenha').addEventListener('submit', handleSalvarNovaSenha);
}

function mostrarSucesso() {
    const card = getCard();
    if (!card) return;
    card.innerHTML = `
        <div class="login-icon" aria-hidden="true" style="background:linear-gradient(135deg, var(--brand-blue), var(--accent-green));">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h2>Senha alterada!</h2>
        <p class="subtitle">Sua senha foi redefinida com sucesso.</p>
        <a href="../app/" class="login-btn" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
            <span class="btn-text">Ir para o login</span>
        </a>
    `;
}

function mostrarLinkInvalido() {
    const card = getCard();
    if (!card) return;
    card.innerHTML = `
        <div class="login-icon" aria-hidden="true" style="background:linear-gradient(135deg, var(--brand-blue), var(--status-error-text));">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </div>
        <h2>Link inválido ou expirado</h2>
        <p class="subtitle">Esse link de redefinição não é mais válido. Volte pro login e clique em "Esqueci minha senha" pra pedir um novo.</p>
        <a href="../app/" class="login-btn" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
            <span class="btn-text">Voltar pro login</span>
        </a>
    `;
}

async function handleSalvarNovaSenha(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSalvarNovaSenha');
    if (btn.disabled) return;
    const msg = document.getElementById('novaSenhaMsg');
    const senha = document.getElementById('novaSenha').value;
    const confirmar = document.getElementById('confirmarNovaSenha').value;

    msg.textContent = '';
    if (senha.length < 8) {
        msg.innerHTML = `<span class="error-message">A senha precisa ter pelo menos 8 caracteres.</span>`;
        return;
    }
    if (senha !== confirmar) {
        msg.innerHTML = `<span class="error-message">As senhas não coincidem.</span>`;
        return;
    }

    btn.classList.add('loading');
    btn.disabled = true;
    try {
        const { error } = await db.auth.updateUser({ password: senha });
        if (error) throw error;
        mostrarSucesso();
    } catch (err) {
        msg.innerHTML = `<span class="error-message">${escapeHtml(err.message || 'Não foi possível salvar a nova senha.')}</span>`;
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

let jaResolvido = false;

db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session && !jaResolvido) {
        jaResolvido = true;
        mostrarFormularioNovaSenha();
    }
});

// Corrida possível: o evento PASSWORD_RECOVERY já pode ter disparado antes
// deste módulo terminar de carregar. getSession() reflete o estado atual
// independente de quando o listener foi registrado.
(async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session && !jaResolvido) {
        jaResolvido = true;
        mostrarFormularioNovaSenha();
        return;
    }
    if (!session) {
        // Dá um tempo curto pro evento disparar antes de desistir — o
        // Supabase processa o hash da URL de forma assíncrona no boot do client.
        setTimeout(() => {
            if (!jaResolvido) mostrarLinkInvalido();
        }, 3000);
    }
})();
