// API de Usuários e Autenticação

import { db } from '../config/supabase.js';
import { 
  currentUser, 
  todosUsuarios, 
  todosVendedores, 
  listaLojas,
  setUsuarioLogado 
} from '../config/state.js';
import { escapeHtml } from '../utils/formatters.js';

/**
 * Verifica sessão ativa e carrega usuário
 */
export async function checkSession() {
  try {
    const { data: { session }, error: sessionError } = await db.auth.getSession();
    if (sessionError) throw sessionError;
    
    if (session && session.user) {
      const { data: userProfile, error: profileError } = await db
        .from('usuarios')
        .select('*')
        .eq('email', session.user.email)
        .single();
      
      if (profileError || !userProfile || userProfile.status?.toLowerCase() !== 'ativo') {
        await logout();
        return;
      }
      
      setUsuarioLogado(userProfile);
      document.getElementById('loginOverlay').classList.add('hidden');
      await initAppAfterLogin();
    } else {
      document.getElementById('loginOverlay').classList.remove('hidden');
    }
  } catch (e) {
    console.error("Erro na verificação de segurança:", e);
    document.getElementById('loginMsg').innerHTML = 'Falha ao verificar o acesso seguro.';
    document.getElementById('loginOverlay').classList.remove('hidden');
  }
}

/**
 * Realiza login com email e senha
 */
export async function handleLogin() {
  const btn = document.getElementById('btnLogin');
  if (btn.disabled) return;
  
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
    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email: email,
      password: senha
    });
    
    if (authError) throw new Error("E-mail ou senha incorretos.");
    
    const { data: userProfile, error: profileError } = await db
      .from('usuarios')
      .select('*')
      .eq('email', authData.user.email)
      .single();
    
    if (profileError || !userProfile) throw new Error("Perfil não encontrado no sistema.");
    if (userProfile.status?.toLowerCase() !== 'ativo') throw new Error("Usuário inativo.");
    
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

/**
 * Realiza logout
 */
export async function logout() {
  await db.auth.signOut();
  location.reload();
}

/**
 * Inicializa app após login
 */
async function initAppAfterLogin() {
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'flex';
  await configurarPermissoes();
  await carregarDadosIniciais();
  iniciarSubscriptionNotificacoes();
}

/**
 * Configura permissões baseado no perfil
 */
async function configurarPermissoes() {
  const isAdministrador = currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
  const isGerente = currentUser.perfil === 'Gerente';
  
  document.getElementById('navAdmin').style.display = isAdministrador ? 'flex' : 'none';
  document.getElementById('navMetas').style.display = (isAdministrador || isGerente) ? 'flex' : 'none';
  document.getElementById('textNavInicio').textContent = (isAdministrador || isGerente) ? 'Dashboard Vendas' : 'Início';
  document.getElementById('fabButton').style.display = (!isAdministrador && !isGerente) ? 'flex' : 'none';
  
  try {
    const { data: all } = await db.from('usuarios').select('*').order('nome');
    todosUsuarios = all || [];
    todosVendedores = todosUsuarios.filter(u => u.perfil === 'Vendedor');
  } catch (e) {
    todosUsuarios = [];
    todosVendedores = [];
  }
  
  const hora = new Date().getHours();
  let saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('sidebarGreeting').textContent = saudacao + ', ' + (currentUser.nome ? currentUser.nome.split(' ')[0] : 'Usuário');
  document.getElementById('sidebarNome').textContent = currentUser.nome || 'Usuário';
  document.getElementById('sidebarAvatar').textContent = currentUser.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U';
  document.getElementById('sidebarPerfil').textContent = currentUser.perfil;
}

/**
 * Carrega dados iniciais do sistema
 */
async function carregarDadosIniciais() {
  showLoader();
  
  const [resStatus, resInteresse, resLojas] = await Promise.all([
    db.from('status_orcamento').select('*'),
    db.from('niveis_interesse').select('*'),
    db.from('lojas').select('*')
  ]);
  
  // Atualizar estado global
  import('../config/state.js').then(({ mapStatusUUID, mapInteresseUUID }) => {
    mapStatusUUID = resStatus.data || [];
    mapInteresseUUID = resInteresse.data || [];
  });
  
  listaLojas = resLojas.data || [];
  
  await carregarProdutos();
  await carregarKpisEDashboard();
  await carregarHistoricoFaturamento();
  
  const isAdmin = currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
  if (isAdmin) {
    navigateTo('admin_inicio');
  } else {
    navigateTo('inicio');
  }
  
  hideLoader();
}

/**
 * Carrega produtos do estoque
 */
export async function carregarProdutos() {
  const { todosProdutos } = await import('../config/state.js');
  const { data } = await db.from('produtos').select('*').order('nome');
  todosProdutos = data || [];
}

/**
 * Carrega KPIs e dashboard
 */
export async function carregarKpisEDashboard() {
  const { AppState, kpisMensais, notificacoesBanco, currentMonth, currentYear, currentDay, selectedLoja, selectedVendedor } = await import('../config/state.js');
  const { STATUS } = await import('../config/constants.js');
  const { mapStatusUUID } = await import('../config/state.js');
  
  if (!AppState.usuarioLogado) return;
  
  const isAdmin = AppState.usuarioLogado.perfil === 'Administrador' || AppState.usuarioLogado.perfil === 'Admin';
  
  try {
    let filtroIdLoja = AppState.usuarioLogado.id_loja;
    if ((AppState.usuarioLogado.perfil === 'Gerente' || isAdmin) && selectedLoja !== 'todas') {
      filtroIdLoja = selectedLoja;
    }
    
    const perfilParaRPC = (AppState.usuarioLogado.perfil || '').toLowerCase() === 'terminal' ? 'Gerente' : AppState.usuarioLogado.perfil;
    
    const { data: kpisData, error: rpcError } = await db.rpc('calcular_kpis_dashboard', {
      p_mes: currentMonth,
      p_ano: currentYear,
      p_id_usuario: AppState.usuarioLogado.id_usuario,
      p_perfil: perfilParaRPC,
      p_id_loja: filtroIdLoja
    });
    
    if (rpcError) throw rpcError;
    AppState.kpisMensaisResumo = kpisData;
    
    // Busca detalhada para gráficos
    let queryDetalhes = db.from('orcamentos')
      .select('id_orcamento, id_usuario, valor_orcado, modelo_colchao, data_criacao, data_fechamento, data_contato, hora_contato, ligacao_confirmada, clientes(nome_cliente), status_orcamento(nome)');
    
    let startPeriodo, endPeriodo;
    if (currentDay) {
      startPeriodo = new Date(currentYear, currentMonth - 1, currentDay);
      endPeriodo = new Date(currentYear, currentMonth - 1, currentDay + 1);
    } else {
      startPeriodo = new Date(currentYear, currentMonth - 1, 1);
      endPeriodo = new Date(currentYear, currentMonth, 1);
    }
    
    const startPeriodoISO = startPeriodo.toISOString();
    const endPeriodoISO = endPeriodo.toISOString();
    
    const statusAbertosIdsDash = mapStatusUUID
      .filter(s => [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(s.nome))
      .map(s => s.id_status);
    const statusFinalizadosIdsDash = mapStatusUUID
      .filter(s => [STATUS.FECHADO, STATUS.PERDIDO].includes(s.nome))
      .map(s => s.id_status);
    
    const orPartsDash = [];
    if (statusAbertosIdsDash.length) {
      orPartsDash.push(`and(id_status.in.(${statusAbertosIdsDash.join(',')}),data_criacao.gte.${startPeriodoISO},data_criacao.lt.${endPeriodoISO})`);
    }
    if (statusFinalizadosIdsDash.length) {
      orPartsDash.push(`and(id_status.in.(${statusFinalizadosIdsDash.join(',')}),data_fechamento.gte.${startPeriodoISO},data_fechamento.lt.${endPeriodoISO})`);
    }
    if (orPartsDash.length) queryDetalhes = queryDetalhes.or(orPartsDash.join(','));
    
    let filtroLojaParaDetalhes = AppState.usuarioLogado.id_loja;
    if ((AppState.usuarioLogado.perfil === 'Gerente' || AppState.usuarioLogado.perfil === 'Administrador' || AppState.usuarioLogado.perfil === 'Admin') && selectedLoja !== 'todas') {
      filtroLojaParaDetalhes = selectedLoja;
    }
    
    const { todosVendedores } = await import('../config/state.js');
    
    if (AppState.usuarioLogado.perfil === 'Gerente' || AppState.usuarioLogado.perfil === 'Administrador' || AppState.usuarioLogado.perfil === 'Admin' || (AppState.usuarioLogado.perfil || '').toLowerCase() === 'terminal') {
      const ids = todosVendedores.filter(v => v.id_loja === filtroLojaParaDetalhes).map(v => v.id_usuario);
      if (ids.length > 0) queryDetalhes = queryDetalhes.in('id_usuario', ids);
      if (selectedVendedor !== 'todos') queryDetalhes = queryDetalhes.eq('id_usuario', selectedVendedor);
    } else if (AppState.usuarioLogado.perfil === 'Vendedor') {
      queryDetalhes = queryDetalhes.eq('id_usuario', AppState.usuarioLogado.id_usuario);
    } else {
      if (selectedVendedor !== 'todos') {
        queryDetalhes = queryDetalhes.eq('id_usuario', selectedVendedor);
      } else if (selectedLoja !== 'todas') {
        const ids = todosVendedores.filter(v => v.id_loja === selectedLoja).map(v => v.id_usuario);
        if (ids.length > 0) queryDetalhes = queryDetalhes.in('id_usuario', ids);
      }
    }
    
    const { data: detalhesData } = await queryDetalhes;
    kpisMensais = (detalhesData || []).map(o => ({
      ...o,
      status: o.status_orcamento ? o.status_orcamento.nome : 'Contato Inicial'
    }));
    
    // Busca notificações
    const { data: notifs, error: errNotif } = await db
      .from('notificacoes')
      .select('*')
      .eq('id_usuario', AppState.usuarioLogado.id_usuario)
      .eq('lida', false);
    
    if (!errNotif) {
      notificacoesBanco = notifs || [];
    }
  } catch(e) {
    console.error("Erro ao carregar KPIs:", e);
  }
  
  atualizarBadge();
  const { buildNotifications, renderNotificationBadge } = await import('../components/ui.js');
  const notificacoes = buildNotifications();
  renderNotificationBadge(notificacoes.length);
}

/**
 * Carrega histórico de faturamento
 */
export async function carregarHistoricoFaturamento() {
  const { historicoFaturamento } = await import('../config/state.js');
  // Implementação baseada no app.js original
}

// Exportar funções para window
export function initAppAfterLoginExport() {
  return initAppAfterLogin;
}

export function configurarPermissoesExport() {
  return configurarPermissoes;
}

// Helpers de UI (importar de components/ui.js)
function showLoader() {
  document.getElementById('globalLoader').classList.add('loading');
}

function hideLoader() {
  document.getElementById('globalLoader').classList.remove('loading');
}

function atualizarBadge() {
  // Implementação
}

function navigateTo(view) {
  // Será implementado no router
  console.log('Navigate to:', view);
}
