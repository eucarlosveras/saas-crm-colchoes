// ═══════════════════════════════════════════════════════════════
// Módulo: auth.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { carregarHistoricoFaturamento, carregarKpisEDashboard } from './dashboard.js';
import { verificarAlertasEstoque } from './estoque.js';
import { carregarNotificacoesLidas, iniciarSubscriptionNotificacoes } from './notificacoes.js';
import { carregarProdutos } from './orcamentos.js';
import { navigateTo } from './router.js';
import { AppState, getLojasPermitidas, setUsuarioLogado, store } from './state.js';
import { db } from './supabaseClient.js';
import { hideLoader, showLoader, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

        async function carregarLojasMultiplas(usuarioId) {
            try {
                const { data, error } = await db
                    .from('usuario_lojas')
                    .select('id_loja')
                    .eq('id_usuario', usuarioId);
                if (error) throw error;
                if (data && data.length > 0) {
                    AppState.usuarioLogado.lojasMultiplas = data.map(item => item.id_loja);
                } else {
                    AppState.usuarioLogado.lojasMultiplas = []; // Vazio = usar fallback (id_loja único)
                }
            } catch (e) {
                console.warn("Erro ao carregar lojas múltiplas, usando fallback:", e);
                AppState.usuarioLogado.lojasMultiplas = [];
            }
        }

        async function checkSession() {
            carregarNotificacoesLidas();
            try {
                // 1. Verifica se já existe um passe (token) seguro no navegador
                const { data: { session }, error: sessionError } = await db.auth.getSession();
                if (sessionError) throw sessionError;
                if (session && session.user) {
                    // 1.5 Mesma trava do handleLogin(): sessão restaurada de
                    // e-mail não confirmado nunca entra.
                    if (!session.user.email_confirmed_at) {
                        await logout();
                        return;
                    }
                    // 2. Se o passe for válido, vamos buscar o perfil correspondente
                    const { data: userProfile, error: profileError } = await db
                        .from('usuarios')
                        .select('*')
                        .eq('email', session.user.email)
                        .single();
                    if (profileError || !userProfile || userProfile.status?.toLowerCase() !== 'ativo') {
                        // Se a conta foi desativada ou não existe mais na tabela, forçamos a saída
                        await logout();
                        return;
                    }
                    // 3. Tudo em ordem: esconde o ecrã de login e arranca com a dashboard
                    setUsuarioLogado(userProfile);
                    document.getElementById('loginOverlay').classList.add('hidden');
                    await initAppAfterLogin();
                } else {
                    // Se não houver sessão, garante que o ecrã de login fica visível
                    document.getElementById('loginOverlay').classList.remove('hidden');
                }
            } catch (e) {
                console.error("Erro na verificação de segurança:", e);
                document.getElementById('loginMsg').innerHTML = 'Falha ao verificar o acesso seguro.';
                document.getElementById('loginOverlay').classList.remove('hidden');
            }
        }

        // ── Recuperação de senha ──────────────────────────────────────
        // Troca de bloco dentro do mesmo #loginOverlay (não é overlay nem
        // página separada — o usuário já está na tela de login). O e-mail
        // com o link de redefinição é o próprio Supabase Auth que envia;
        // o link volta pra /reset-senha/ (ver src/reset-senha.js), que é
        // quem de fato troca a senha.

        function abrirRecuperarSenha() {
            document.getElementById('loginMsg').textContent = '';
            document.getElementById('recuperarSenhaMsg').textContent = '';
            document.getElementById('recuperarSenhaEmail').value = document.getElementById('loginEmail').value;
            document.getElementById('loginBloco').style.display = 'none';
            document.getElementById('recuperarSenhaBloco').style.display = 'block';
        }

        function voltarParaLogin() {
            document.getElementById('recuperarSenhaMsg').textContent = '';
            document.getElementById('recuperarSenhaBloco').style.display = 'none';
            document.getElementById('loginBloco').style.display = 'block';
        }

        async function enviarLinkRecuperacaoSenha() {
            const btn = document.getElementById('btnRecuperarSenha');
            if (btn.disabled) return;
            const email = document.getElementById('recuperarSenhaEmail').value.trim();
            const msg = document.getElementById('recuperarSenhaMsg');
            if (!email) { msg.textContent = 'Informe seu e-mail.'; return; }

            btn.classList.add('loading');
            btn.disabled = true;
            msg.textContent = '';
            try {
                // URL absoluta calculada por resolução relativa (não
                // location.origin sozinho) — o site é publicado num subcaminho
                // do domínio (GitHub Pages: /saas-crm-colchoes/), então
                // origin puro perderia esse prefixo.
                const redirectTo = new URL('../reset-senha/', location.href).href;
                const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
                if (error) throw error;
                // Não revela se o e-mail existe ou não na base (evita
                // enumeração de contas) — mensagem é sempre a mesma.
                msg.innerHTML = '<span style="color:var(--status-success-text);">Se esse e-mail estiver cadastrado, você vai receber o link em instantes.</span>';
            } catch (err) {
                msg.innerHTML = `<span class="error-message">Não foi possível enviar o link agora. Tente novamente.</span>`;
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }

        async function handleLogin() {
            const btn = document.getElementById('btnLogin');
            if (btn.disabled) return;
            // 1. Captura os valores dos novos campos
            const email = document.getElementById('loginEmail').value.trim();
            const senha = document.getElementById('loginSenha').value;
            const msg = document.getElementById('loginMsg');
            if (!email || !senha) {
                msg.textContent = 'Preencha seu e-mail e senha.';
                return;
            }
            btn.classList.add('loading');
            btn.disabled = true;
            msg.innerHTML = '';
            try {
                // 2. Validação real de identidade com o Supabase
                const { data: authData, error: authError } = await db.auth.signInWithPassword({
                    email: email,
                    password: senha
                });
                if (authError) throw new Error("E-mail ou senha incorretos.");
                // 2.5 Trava extra no nosso próprio código, não só na config do
                // Supabase (que não temos como auditar por aqui): e-mail não
                // confirmado nunca entra, mesmo que o Supabase por algum
                // motivo tenha devolvido uma sessão válida.
                if (!authData.user.email_confirmed_at) {
                    await db.auth.signOut();
                    throw new Error("Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.");
                }
                // 3. Busca o papel (perfil) do usuário na tabela do banco
                const { data: userProfile, error: profileError } = await db
                    .from('usuarios')
                    .select('*')
                    .eq('email', authData.user.email)
                    .single();
                if (profileError || !userProfile) throw new Error("Perfil não encontrado no sistema.");
                if (userProfile.status?.toLowerCase() !== 'ativo') throw new Error("Usuário inativo.");
                // 4. Libera o acesso e inicia a dashboard
                setUsuarioLogado(userProfile);
                document.getElementById('loginOverlay').classList.add('hidden');
                await initAppAfterLogin();
            } catch (err) {
                msg.innerHTML = `<span class="error-message">${escapeHtml(err.message)}</span>`;
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }

        async function initAppAfterLogin() {
            document.getElementById('sidebar').style.display = 'flex';
            document.getElementById('mainContent').style.display = 'flex';
            // Carrega as lojas do Gerente Multiloja (se houver) ANTES de configurar permissões e KPIs,
            // pois getLojasPermitidas() depende desse dado já estar em AppState.usuarioLogado.
            await carregarLojasMultiplas(store.currentUser.id_usuario);
            configurarPermissoes();
            carregarDadosIniciais();
            iniciarSubscriptionNotificacoes();
            avisarPrimeiroAcesso();
        }

        // Primeiro acesso vindo do cadastro self-service (cadastro.js grava
        // esse flag no localStorage antes de mandar confirmar o e-mail — ver
        // comentário lá pra saber por que não é um parâmetro de URL). Só um
        // toast de boas-vindas por enquanto — não é o wizard guiado do plano
        // original (item separado, fora do escopo desta leva).
        function avisarPrimeiroAcesso() {
            try {
                if (localStorage.getItem('cvcrm_onboarding_pendente') !== '1') return;
                localStorage.removeItem('cvcrm_onboarding_pendente');
            } catch (_) { return; }
            showToast('Bem-vindo! Comece cadastrando seus produtos e convidando sua equipe.', 'success');
        }

        async function configurarPermissoes() {
            const isAdministrador = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
            const isGerente = store.currentUser.perfil === 'Gerente';

            document.getElementById('navAdmin').style.display = isAdministrador ? 'flex' : 'none';
            document.getElementById('navMetas').style.display = (isAdministrador || isGerente) ? 'flex' : 'none';
            document.getElementById('textNavInicio').textContent = (isAdministrador || isGerente) ? 'Dashboard Vendas' : 'Início';
            document.getElementById('fabButton').style.display = (!isAdministrador && !isGerente) ? 'flex' : 'none';

            try {
                const { data: all } = await db.from('usuarios').select('*').order('nome');
                store.todosUsuarios = all || []; store.todosVendedores = store.todosUsuarios.filter(u => u.perfil === 'Vendedor');
            } catch (e) { store.todosUsuarios = []; store.todosVendedores = []; }

            const hora = new Date().getHours();
            let saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
            document.getElementById('sidebarGreeting').textContent = saudacao + ', ' + (store.currentUser.nome ? store.currentUser.nome.split(' ')[0] : 'Usuário');
            document.getElementById('sidebarNome').textContent = store.currentUser.nome || 'Usuário';
            document.getElementById('sidebarAvatar').textContent = store.currentUser.nome ? store.currentUser.nome.charAt(0).toUpperCase() : 'U';
            document.getElementById('sidebarPerfil').textContent = store.currentUser.perfil;
        }

        async function carregarDadosIniciais() {
            showLoader();
            
            // ═══════════════════════════════════════════════════════
            // NOVO: Carregar dados básicos com soft delete
            // ═══════════════════════════════════════════════════════
            const [resStatus, resInteresse, resLojas, resProdutos] = await Promise.all([
                db.from('status_orcamento').select('*'),
                db.from('niveis_interesse').select('*'),
                db.from('lojas').select('*'),
                db.from('produtos').select('*').is('deleted_at', null)  // ← NOVO
            ]);
            
            store.mapStatusUUID = resStatus.data || [];
            store.mapInteresseUUID = resInteresse.data || [];
            store.listaLojas = resLojas.data || [];
            store.listaProdutos = resProdutos.data || [];  // ← NOVO: Cache de produtos

            await carregarProdutos();
            await carregarKpisEDashboard();
            await carregarHistoricoFaturamento();
            
            // ═══════════════════════════════════════════════════════
            // NOVO: Verificar alertas de estoque pendentes
            // ═══════════════════════════════════════════════════════
            await verificarAlertasEstoque();
            
            if (store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin') navigateTo('admin_inicio');
            else navigateTo('inicio');
            hideLoader();
        }

        async function logout() {
            // Encerra a subscription de notificações antes de sair
            if (store._notifChannel) { db.removeChannel(store._notifChannel); store._notifChannel = null; }
            // Destrói a sessão real no Supabase antes de limpar a tela
            await db.auth.signOut();
            AppState.usuarioLogado = null;
            location.reload();
        }

export { abrirRecuperarSenha, carregarDadosIniciais, carregarLojasMultiplas, checkSession, configurarPermissoes, enviarLinkRecuperacaoSenha, handleLogin, initAppAfterLogin, logout, voltarParaLogin };
