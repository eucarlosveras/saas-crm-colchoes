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
import { hideLoader, showLoader } from './ui.js';
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
                    // 2.5 A loja está com a assinatura em dia? Administrador nunca é
                    // bloqueado aqui — o bloqueio de verdade (RLS) já não o afeta.
                    if (await estaComAssinaturaBloqueada(userProfile)) return;
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

        // Checa se a loja do usuário está sem assinatura trialing/active. Se
        // estiver bloqueada, já troca a tela pra o aviso e devolve true (quem
        // chamou deve parar o fluxo de login ali). Isso é só UX — o bloqueio
        // que realmente vale está no banco (current_lojas_permitidas(), ver
        // migration 20260822120000_billing_subscriptions.sql); sem isso aqui
        // o app só ficaria vazio/quebrado pro usuário, sem explicação.
        async function estaComAssinaturaBloqueada(userProfile) {
            if (userProfile.perfil === 'Administrador' || userProfile.perfil === 'Admin') return false;
            if (!userProfile.id_loja) return false; // sem loja definida: deixa o resto do app tratar
            try {
                const { data: sub } = await db.from('subscriptions')
                    .select('status')
                    .eq('id_loja', userProfile.id_loja)
                    .maybeSingle();
                if (sub && ['trialing', 'active'].includes(sub.status)) return false;
                mostrarBloqueioAssinatura(sub?.status);
                return true;
            } catch (e) {
                console.error('Erro ao verificar assinatura da loja:', e);
                return false; // falha na checagem não deve travar o login
            }
        }

        function mostrarBloqueioAssinatura(status) {
            const mensagens = {
                past_due: 'O pagamento da assinatura está atrasado. Regularize para continuar usando o sistema.',
                canceled: 'A assinatura desta loja foi cancelada.',
            };
            const mensagem = mensagens[status] || 'Esta loja ainda não tem uma assinatura ativa.';
            const card = document.querySelector('#loginOverlay .login-card');
            if (card) {
                card.innerHTML = `
                    <div class="login-icon" aria-hidden="true" style="background:linear-gradient(135deg, var(--brand-blue), var(--status-error-text));">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    </div>
                    <h2>Assinatura pendente</h2>
                    <p class="subtitle">${escapeHtml(mensagem)}</p>
                    <button class="login-btn" onclick="logout()"><span class="btn-text">Sair</span></button>
                `;
            }
            document.getElementById('loginOverlay').classList.remove('hidden');
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
                // 3. Busca o papel (perfil) do usuário na tabela do banco
                const { data: userProfile, error: profileError } = await db
                    .from('usuarios')
                    .select('*')
                    .eq('email', authData.user.email)
                    .single();
                if (profileError || !userProfile) throw new Error("Perfil não encontrado no sistema.");
                if (userProfile.status?.toLowerCase() !== 'ativo') throw new Error("Usuário inativo.");
                // 3.5 Loja com assinatura em dia? (ver checkSession() para o mesmo fluxo)
                if (await estaComAssinaturaBloqueada(userProfile)) return;
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

export { carregarDadosIniciais, carregarLojasMultiplas, checkSession, configurarPermissoes, estaComAssinaturaBloqueada, handleLogin, initAppAfterLogin, logout, mostrarBloqueioAssinatura };
