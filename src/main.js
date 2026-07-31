// Entry Point da Aplicação
import './style.css';

import { initState, currentUser } from './config/state.js';
import { checkSession, handleLogin, logout } from './api/usuarios.js';
import { navigateTo, registerRoute } from './utils/router.js';

// Importar páginas para registro
import { renderInicio } from './pages/inicio.js';
import { renderCarteiraPage } from './pages/carteira.js';
import { renderAgendaDia } from './pages/agenda.js';
import { renderClientesLista } from './pages/clientes.js';
import { renderNovoOrcamentoPage } from './pages/novoOrcamento.js';
import { renderDetalhesClientePage } from './pages/detalhes.js';
import { renderMetas } from './pages/metas.js';
import { renderEstoque } from './pages/estoque.js';
import { renderAdminInicio, renderAdminUsuarios } from './pages/admin.js';
import { renderMeuRadar } from './pages/meuRadar.js';

// Importar componentes
import { toggleTheme, closeModal, showToast, showLoader, hideLoader } from './components/ui.js';
import { handleRadarAction, handleRadarCheck, handleRadarIgnore } from './components/radar.js';

// Registrar rotas
registerRoute('inicio', renderInicio);
registerRoute('carteira', renderCarteiraPage);
registerRoute('agenda_dia', renderAgendaDia);
registerRoute('clientes_lista', renderClientesLista);
registerRoute('novo_orcamento', renderNovoOrcamentoPage);
registerRoute('detalhes_cliente', renderDetalhesClientePage);
registerRoute('metas', renderMetas);
registerRoute('estoque', renderEstoque);
registerRoute('admin_inicio', renderAdminInicio);
registerRoute('admin_usuarios', renderAdminUsuarios);
registerRoute('meu_radar', renderMeuRadar);

// Expor funções no window para handlers inline do HTML
window.handleLogin = handleLogin;
window.logout = logout;
window.navigateTo = navigateTo;
window.closeModal = closeModal;
window.toggleTheme = toggleTheme;
window.showToast = showToast;

// Handlers do Radar
window.handleRadarAction = handleRadarAction;
window.handleRadarCheck = handleRadarCheck;
window.handleRadarIgnore = handleRadarIgnore;

// Handlers de agenda
let _agendaFiltro = 'pendentes';
window._agendaFiltro = _agendaFiltro;
window.setAgendaFiltro = async (valor) => {
  _agendaFiltro = valor;
  window._agendaFiltro = valor;
  await renderAgendaDia();
};

// Handlers de filtro
window.selectFilter = async (filter) => {
  const { selectFilter } = await import('./pages/carteira.js');
  selectFilter(filter);
};

window.changeDay = async (val) => {
  const { changeDay } = await import('./pages/inicio.js');
  await changeDay(val);
};

window.changeMonth = async (val) => {
  const { changeMonth } = await import('./pages/inicio.js');
  await changeMonth(val);
};

window.filtrarPorLoja = async (val) => {
  const { filtrarPorLoja } = await import('./pages/inicio.js');
  await filtrarPorLoja(val);
};

window.filtrarPorVendedor = async (val) => {
  const { filtrarPorVendedor } = await import('./pages/inicio.js');
  await filtrarPorVendedor(val);
};

window.handleSearch = async () => {
  const { handleSearch } = await import('./pages/clientes.js');
  handleSearch();
};

window.clearSearch = async () => {
  const { clearSearch } = await import('./pages/clientes.js');
  clearSearch();
};

window.handleSearchProtocolo = async () => {
  const { handleSearchProtocolo } = await import('./pages/carteira.js');
  handleSearchProtocolo();
};

// Handlers de orcamento
window.abrirNovoOrcamento = () => {
  const p = (currentUser?.perfil || '').toLowerCase();
  if (p !== 'vendedor' && p !== 'terminal') return;
  navigateTo('novo_orcamento');
};

window.salvarEdicaoCliente = async () => {
  const { salvarEdicaoCliente } = await import('./api/clientes.js');
  await salvarEdicaoCliente();
};

window.confirmarExcluirCliente = async () => {
  const { confirmarExcluirCliente } = await import('./api/clientes.js');
  await confirmarExcluirCliente();
};

// Handlers de proposta
window.ajusteAdicionarLinha = async () => {
  const { ajusteAdicionarLinha } = await import('./pages/detalhes.js');
  ajusteAdicionarLinha();
};

window.salvarAjusteProposta = async () => {
  const { salvarAjusteProposta } = await import('./pages/detalhes.js');
  await salvarAjusteProposta();
};

// Handlers de admin
window.salvarUsuarioAdmin = async () => {
  const { salvarUsuarioAdmin } = await import('./pages/admin.js');
  await salvarUsuarioAdmin();
};

window.confirmarExclusaoUsuario = async () => {
  const { confirmarExclusaoUsuario } = await import('./pages/admin.js');
  await confirmarExclusaoUsuario();
};

window.toggleSenhaAdmin = (id) => {
  const input = document.getElementById(`senha_${id}`);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
};

// Handlers de metas
window.salvarNovaMeta = async () => {
  const { salvarNovaMeta } = await import('./pages/metas.js');
  await salvarNovaMeta();
};

// Handlers de fechamento/perda
window.selecionarModoFechamento = async (modo) => {
  const { selecionarModoFechamento } = await import('./pages/detalhes.js');
  selecionarModoFechamento(modo);
};

window.confirmarPerda = async () => {
  const { confirmarPerda } = await import('./pages/detalhes.js');
  await confirmarPerda();
};

// Handlers de comentarios
window.confirmarExclusaoComentario = async () => {
  const { confirmarExclusaoComentario } = await import('./api/comentarios.js');
  await confirmarExclusaoComentario();
};

// Handlers de IA
window.enviarMensagemChatIA = async () => {
  const { enviarMensagemChatIA } = await import('./components/ia.js');
  await enviarMensagemChatIA();
};

window.fecharModalChatIA = () => {
  closeModal('modalChatIA');
};

// Handlers de estoque
window.fecharModalNovoProduto = () => {
  closeModal('modalNovoProduto');
};

window.abrirModalNovoProduto = async () => {
  const { abrirModalNovoProduto } = await import('./pages/estoque.js');
  abrirModalNovoProduto();
};

// Variaveis globais para compatibilidade
window._terminalVendedorFiltro = 'todos';
window._clienteBusca = '';
window._clientesCache = null;
window._clientePK = null;
window.dadosEstoqueCompleto = null;
window._chatIAHistorico = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa estado
  initState();
  
  // Verifica sessao
  await checkSession();
  
  // Listener de tema
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal.open');
      modals.forEach(modal => {
        modal.classList.remove('open');
      });
    }
  });
  
  // Hamburger menu
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('sidebar');
  
  if (hamburgerBtn && sidebarOverlay && sidebar) {
    hamburgerBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('open');
    });
    
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    });
  }
  
  // Toggle theme
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Focus handler para recarregar notificacoes
  window.addEventListener('focus', async () => {
    const { carregarKpisEDashboard } = await import('./api/usuarios.js');
    await carregarKpisEDashboard();
  });
  
  // Navegacao por botoes da sidebar
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const nav = this.dataset.nav;
      if (nav) {
        navigateTo(nav);
        
        // Atualiza classe active
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // Mobile: fecha sidebar apos navegar
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
          sidebarOverlay.classList.remove('open');
        }
      }
    });
  });
});
