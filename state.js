export const STATUS = {
  CONTATO_INICIAL: 'Contato Inicial',
  NEGOCIACAO: 'Negociação',
  EM_FECHAMENTO: 'Em Fechamento',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido',
  DECLINADO: 'Declinado'
};

export const AppState = {
  usuarioLogado: null,
  kpisMensais: [],
  filtros: {
    vendedor: 'todos',
    loja: 'todas',
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
    dia: null,
    status: 'todos',
    busca: ''
  },
  ui: {
    viewAtual: 'inicio',
    viewAnterior: 'inicio',
    paginaAtual: 1,
    donutChartInstance: null,
    barChartInstance: null,
    salvandoOrcamento: false,
    historicoFaturamento: [],
    isSavingComment: false,
    isConfirmingPerda: false,
    notificacoesLidas: new Set(),
    notificacoesBanco: []
  },
  contextoVenda: {
    clienteAtual: null,
    clienteParaAcao: null,
    orcamentoParaPerder: null,
    clienteSelecionadoParaAcao: null,
    clienteParaOrcamento: null,
    idOrcamentoParaPerder: null,
    idMetaEdicao: null,
    comentarioParaExcluir: null,
    idUsuarioEmEdicao: null,
    usuariosParaLogin: []
  }
};

export let currentUser = null;

export function setUsuarioLogado(usuario) {
  if (usuario && usuario.status?.toLowerCase() !== 'ativo') {
    console.error('Tentativa de logar usuário inativo barrada pelo estado.');
    return false;
  }
  AppState.usuarioLogado = usuario;
  currentUser = usuario;
  if (typeof window !== 'undefined') {
    window.currentUser = usuario;
  }
  return true;
}

export function setFiltroMes(mes, ano) {
  AppState.filtros.mes = mes;
  AppState.filtros.ano = ano;
  AppState.filtros.dia = null;
}

export function getUsuarioLogado() {
  return AppState.usuarioLogado;
}

export function getFiltroMes() {
  return AppState.filtros.mes;
}

export function getFiltroAno() {
  return AppState.filtros.ano;
}

export function getFiltroDia() {
  return AppState.filtros.dia;
}

export function getViewAtual() {
  return AppState.ui.viewAtual;
}

export function getViewAnterior() {
  return AppState.ui.viewAnterior;
}

export function getPaginaAtual() {
  return AppState.ui.paginaAtual;
}

export function getFiltroVendedor() {
  return AppState.filtros.vendedor;
}

export function getFiltroLoja() {
  return AppState.filtros.loja;
}

export function setClienteSelecionadoParaAcao(valor) {
  AppState.contextoVenda.clienteSelecionadoParaAcao = valor;
  return valor;
}

export function getClienteSelecionadoParaAcao() {
  return AppState.contextoVenda.clienteSelecionadoParaAcao;
}

export function setClienteParaOrcamento(valor) {
  AppState.contextoVenda.clienteParaOrcamento = valor;
  return valor;
}

export function getClienteParaOrcamento() {
  return AppState.contextoVenda.clienteParaOrcamento;
}

export function setIdOrcamentoParaPerder(valor) {
  AppState.contextoVenda.idOrcamentoParaPerder = valor;
  return valor;
}

export function getIdOrcamentoParaPerder() {
  return AppState.contextoVenda.idOrcamentoParaPerder;
}

export function setIdMetaEdicao(valor) {
  AppState.contextoVenda.idMetaEdicao = valor;
  return valor;
}

export function getIdMetaEdicao() {
  return AppState.contextoVenda.idMetaEdicao;
}

export function setDonutChartInstance(valor) {
  AppState.ui.donutChartInstance = valor;
  return valor;
}

export function getDonutChartInstance() {
  return AppState.ui.donutChartInstance;
}

export function setBarChartInstance(valor) {
  AppState.ui.barChartInstance = valor;
  return valor;
}

export function getBarChartInstance() {
  return AppState.ui.barChartInstance;
}

export function setSalvandoOrcamento(valor) {
  AppState.ui.salvandoOrcamento = valor;
  return valor;
}

export function getSalvandoOrcamento() {
  return AppState.ui.salvandoOrcamento;
}

export function setHistoricoFaturamento(valor) {
  AppState.ui.historicoFaturamento = Array.isArray(valor) ? valor : [];
  return AppState.ui.historicoFaturamento;
}

export function getHistoricoFaturamento() {
  return AppState.ui.historicoFaturamento;
}

export function setComentarioParaExcluir(valor) {
  AppState.contextoVenda.comentarioParaExcluir = valor;
  return valor;
}

export function getComentarioParaExcluir() {
  return AppState.contextoVenda.comentarioParaExcluir;
}

export function setIdUsuarioEmEdicao(valor) {
  AppState.contextoVenda.idUsuarioEmEdicao = valor;
  return valor;
}

export function getIdUsuarioEmEdicao() {
  return AppState.contextoVenda.idUsuarioEmEdicao;
}

export function setUsuariosParaLogin(valor) {
  AppState.contextoVenda.usuariosParaLogin = Array.isArray(valor) ? valor : [];
  return AppState.contextoVenda.usuariosParaLogin;
}

export function getUsuariosParaLogin() {
  return AppState.contextoVenda.usuariosParaLogin;
}

export function setIsSavingComment(valor) {
  AppState.ui.isSavingComment = valor;
  return valor;
}

export function getIsSavingComment() {
  return AppState.ui.isSavingComment;
}

export function setIsConfirmingPerda(valor) {
  AppState.ui.isConfirmingPerda = valor;
  return valor;
}

export function getIsConfirmingPerda() {
  return AppState.ui.isConfirmingPerda;
}

export function setNotificacoesLidas(valor) {
  AppState.ui.notificacoesLidas = valor instanceof Set ? valor : new Set(valor || []);
  return AppState.ui.notificacoesLidas;
}

export function getNotificacoesLidas() {
  return AppState.ui.notificacoesLidas;
}

export function setNotificacoesBanco(valor) {
  AppState.ui.notificacoesBanco = Array.isArray(valor) ? valor : [];
  return AppState.ui.notificacoesBanco;
}

export function getNotificacoesBanco() {
  return AppState.ui.notificacoesBanco;
}
