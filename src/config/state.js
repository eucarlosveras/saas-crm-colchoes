// Estado Global da Aplicação (Cofre)

// Variáveis de sessão do usuário
export let currentUser = null;
export let currentView = 'inicio';
export let previousView = 'inicio';
export let currentMonth = new Date().getMonth() + 1;
export let currentYear = new Date().getFullYear();
export let currentDay = null;
export let currentPage = 1;
export let selectedVendedor = 'todos';
export let selectedLoja = 'todas';

// Dados carregados do banco
export let mapStatusUUID = [];
export let mapInteresseUUID = [];
export let listaLojas = [];
export let kpisMensais = [];
export let todosVendedores = [];
export let todosUsuarios = [];
export let todosProdutos = [];
export let historicoFaturamento = [];
export let notificacoesBanco = [];

// Instâncias de gráficos
export let donutChartInstance = null;
export let barChartInstance = null;

// Estado de UI e controle
export let notificacoesLidas = new Set();
export let kanbanAtivo = false;
export let searchTerm = '';
export let searchProtocolo = '';
export let clienteSelecionadoParaAcao = null;
export let clienteParaOrcamento = null;
export let idOrcamentoParaPerder = null;
export let idMetaEdicao = null;
export let salvandoOrcamento = false;
export let comentarioParaExcluir = null;
export let idUsuarioEmEdicao = null;
export let usuariosParaLogin = [];
export let isSavingComment = false;
export let isConfirmingPerda = false;

// Contexto de venda
export const contextoVenda = {
  clienteAtual: null,
  clienteParaAcao: null,
  orcamentoParaPerder: null
};

// Filtros atuais
export const filtros = {
  vendedor: 'todos',
  loja: 'todas',
  mes: new Date().getMonth() + 1,
  ano: new Date().getFullYear(),
  dia: null,
  status: 'todos',
  busca: ''
};

// AppState original (para compatibilidade)
export const AppState = {
  usuarioLogado: null,
  kpisMensais: [],
  filtros: { ...filtros },
  ui: {
    viewAtual: 'inicio',
    viewAnterior: 'inicio',
    paginaAtual: 1
  },
  contextoVenda: { ...contextoVenda }
};

// Setters para o AppState
export function setUsuarioLogado(usuario) {
  if (usuario && usuario.status?.toLowerCase() !== 'ativo') {
    console.error('Tentativa de logar usuário inativo barrada pelo estado.');
    return false;
  }
  AppState.usuarioLogado = usuario;
  currentUser = usuario;
  return true;
}

export function setClienteAtual(clienteData) {
  AppState.contextoVenda.clienteAtual = clienteData;
  contextoVenda.clienteAtual = clienteData;
}

export function setFiltroMes(mes, ano) {
  AppState.filtros.mes = mes;
  AppState.filtros.ano = ano;
  AppState.filtros.dia = null;
  filtros.mes = mes;
  filtros.ano = ano;
  filtros.dia = null;
}

// Getters para o AppState
export function getUsuarioLogado() { return AppState.usuarioLogado; }
export function getFiltroMes() { return AppState.filtros.mes; }
export function getFiltroAno() { return AppState.filtros.ano; }
export function getFiltroDia() { return AppState.filtros.dia; }
export function getViewAtual() { return AppState.ui.viewAtual; }
export function getViewAnterior() { return AppState.ui.viewAnterior; }
export function getPaginaAtual() { return AppState.ui.paginaAtual; }
export function getFiltroVendedor() { return AppState.filtros.vendedor; }
export function getFiltroLoja() { return AppState.filtros.loja; }

// Função de inicialização do estado
export function initState() {
  carregarNotificacoesLidas();
}

// Notificações lidas
export function carregarNotificacoesLidas() {
  const stored = localStorage.getItem('notificacoesLidas');
  if (stored) {
    try {
      notificacoesLidas = new Set(JSON.parse(stored));
    } catch (e) {
      // Ignora erro de parse
    }
  }
}

export function salvarNotificacoesLidas() {
  localStorage.setItem('notificacoesLidas', JSON.stringify(Array.from(notificacoesLidas)));
}

export function marcarTodasNotificacoesLidas(ids) {
  let altered = false;
  ids.forEach(id => {
    if (id && !notificacoesLidas.has(id)) {
      notificacoesLidas.add(id);
      altered = true;
    }
  });
  if (altered) salvarNotificacoesLidas();
}
