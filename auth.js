import { normalizeErrorMessage, safeCall } from './utils.js';

export function createAuthModule({
  db,
  setUsuarioLogado,
  initAppAfterLogin,
  logout,
  escapeHtml
}) {
  async function checkSession() {
    try {
      const sessionResult = await safeCall(() => db.auth.getSession(), {
        retries: 2,
        fallbackMessage: 'Não foi possível validar sua sessão. Tente novamente.',
        showToast: false
      });

      if (sessionResult.error) {
        throw sessionResult.error;
      }

      const session = sessionResult.data?.session;
      if (session && session.user) {
        const profileResult = await safeCall(() => db
          .from('usuarios')
          .select('*')
          .eq('email', session.user.email)
          .single(), {
            retries: 2,
            fallbackMessage: 'Não foi possível carregar seu perfil no momento.',
            showToast: false
          });

        if (profileResult.error || !profileResult.data || profileResult.data.status?.toLowerCase() !== 'ativo') {
          await logout();
          return;
        }

        setUsuarioLogado(profileResult.data);
        document.getElementById('loginOverlay').classList.add('hidden');
        initAppAfterLogin();
      } else {
        document.getElementById('loginOverlay').classList.remove('hidden');
      }
    } catch (e) {
      console.error('Erro na verificação de segurança:', e);
      const msg = document.getElementById('loginMsg');
      if (msg) {
        msg.innerHTML = `<span class="error-message">${escapeHtml(normalizeErrorMessage(e, 'Falha ao verificar o acesso seguro.'))}</span>`;
      }
      const overlay = document.getElementById('loginOverlay');
      if (overlay) {
        overlay.classList.remove('hidden');
      }
    }
  }

  async function handleLogin() {
    const btn = document.getElementById('btnLogin');
    if (btn && btn.disabled) return;

    const email = document.getElementById('loginEmail')?.value?.trim() || '';
    const senha = document.getElementById('loginSenha')?.value || '';
    const msg = document.getElementById('loginMsg');

    if (!email || !senha) {
      if (msg) msg.textContent = 'Preencha seu e-mail e senha.';
      return;
    }

    if (btn) {
      btn.classList.add('loading');
      btn.disabled = true;
    }

    if (msg) msg.innerHTML = '';

    try {
      const authResult = await safeCall(() => db.auth.signInWithPassword({
        email,
        password: senha
      }), {
        retries: 2,
        fallbackMessage: 'Não foi possível entrar no sistema. Verifique sua conexão e tente novamente.',
        showToast: false
      });

      if (authResult.error) {
        throw new Error(normalizeErrorMessage(authResult.error, 'E-mail ou senha incorretos.'));
      }

      const profileResult = await safeCall(() => db
        .from('usuarios')
        .select('*')
        .eq('email', authResult.data?.user?.email)
        .single(), {
          retries: 2,
          fallbackMessage: 'Não foi possível carregar o perfil do usuário.',
          showToast: false
        });

      if (profileResult.error || !profileResult.data) {
        throw new Error(normalizeErrorMessage(profileResult.error, 'Perfil não encontrado no sistema.'));
      }

      if (profileResult.data.status?.toLowerCase() !== 'ativo') {
        throw new Error('Usuário inativo.');
      }

      setUsuarioLogado(profileResult.data);
      document.getElementById('loginOverlay').classList.add('hidden');
      initAppAfterLogin();
    } catch (err) {
      if (msg) {
        msg.innerHTML = `<span class="error-message">${escapeHtml(err.message || 'Não foi possível entrar no sistema.')}</span>`;
      }
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    }
  }

  return {
    checkSession,
    handleLogin
  };
}
