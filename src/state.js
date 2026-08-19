// ═══════════════════════════════════════════════════════════════
// Módulo: state.js — o "Cofre" (estado global da aplicação).
//
// Consolida tanto o AppState original quanto as ~47 variáveis soltas
// (let) que existiam no app.js monolítico. Módulos ES6 não permitem que
// outro módulo reatribua diretamente uma variável `let` importada — só o
// módulo que a declara pode reatribuí-la. Por isso, toda variável que
// precisava ser lida/alterada por mais de uma função (e, portanto, por
// mais de um módulo) virou uma propriedade do objeto `store`, que é
// importado por referência (mutação de propriedade funciona normalmente
// entre módulos).
// ═══════════════════════════════════════════════════════════════

// O nosso Cofre (Estado Global da Aplicação)
const AppState = {
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
        paginaAtual: 1
    },
    contextoVenda: {
        clienteAtual: null,          // Substitui AppState.contextoVenda.clienteAtual
        clienteParaAcao: null,       // Substitui clienteSelecionadoParaAcao
        orcamentoParaPerder: null    // Substitui idOrcamentoParaPerder
    }
};

// Variáveis legadas que antes eram `let` soltos no topo do app.js.
// Viraram propriedades de `store` para poderem ser compartilhadas entre módulos.
const store = {
    mapStatusUUID: [],
    mapInteresseUUID: [],
    listaLojas: [],
    kpisMensais: [],
    todosVendedores: [],
    todosUsuarios: [],
    todosProdutos: [],
    listaProdutos: [],
    currentFilter: 'todos',
    kanbanAtivo: false,
    searchTerm: '',
    kpiPeriodoVendedor: 'hoje', // 'hoje' | 'semana' | 'mes'
    dashboardView: 'vendedor', // 'vendedor' | 'gerencial' — sempre reinicia em 'vendedor' a cada login
    searchProtocolo: '',
    clienteSelecionadoParaAcao: null,
    clienteParaOrcamento: null,
    idOrcamentoParaPerder: null,
    idMetaEdicao: null,
    donutChartInstance: null,
    barChartInstance: null,
    salvandoOrcamento: false,
    historicoFaturamento: [],
    comentarioParaExcluir: null,
    idUsuarioEmEdicao: null,
    usuariosParaLogin: [],
    isSavingComment: false,
    isConfirmingPerda: false,
    notificacoesLidas: new Set(),
    notificacoesBanco: [],
    currentUser: null,
    currentView: 'inicio',
    previousView: 'inicio',
    currentMonth: new Date().getMonth() + 1,
    currentYear: new Date().getFullYear(),
    currentDay: null,
    currentPage: 1,
    selectedVendedor: 'todos',
    selectedLoja: 'todas',
    lastFocusedElement: null,
    _notifChannel: null,
    modoFechamentoSelecionado: null,
    estoqueData: [],
    filtroEstoqueBusca: '',
    filtroEstoqueCategoria: 'todas',
    filtroEstoqueQualidade: 'todas',
    radarSignalsData: [],
    chatIAMessages: [],
    currentOrcamentoId: null
};

// --- GUARDIÕES DO ESTADO ---

function setUsuarioLogado(usuario) {
    if (usuario && usuario.status?.toLowerCase() !== 'ativo') {
        console.error("Tentativa de logar usuário inativo barrada pelo estado.");
        return false;
    }
    AppState.usuarioLogado = usuario;
    store.currentUser = usuario;
    return true;
}

function setClienteAtual(clienteData) {
    AppState.contextoVenda.clienteAtual = clienteData;
}

function setFiltroMes(mes, ano) {
    AppState.filtros.mes = mes;
    AppState.filtros.ano = ano;
    AppState.filtros.dia = null; // Resetar o dia ao mudar o mês
}

// Helper central: retorna as lojas que o usuário logado pode enxergar.
// null = sem restrição (vê todas). Array = lista de id_loja permitidos (pode ter 1 ou N).
function getLojasPermitidas() {
    const user = AppState.usuarioLogado;
    if (!user) return [];
    if (user.perfil === 'Administrador' || user.perfil === 'Admin') {
        return null; // Admin não tem restrição de loja
    }
    if (user.lojasMultiplas && user.lojasMultiplas.length > 0) {
        return user.lojasMultiplas; // Gerente multiloja
    }
    if (user.id_loja) {
        return [user.id_loja]; // Fallback: comportamento atual (loja única)
    }
    return [];
}

// Helpers para acessar o AppState de forma concisa
function getUsuarioLogado() { return AppState.usuarioLogado; }
function getFiltroMes() { return AppState.filtros.mes; }
function getFiltroAno() { return AppState.filtros.ano; }
function getFiltroDia() { return AppState.filtros.dia; }
function getViewAtual() { return AppState.ui.viewAtual; }
function getViewAnterior() { return AppState.ui.viewAnterior; }
function getPaginaAtual() { return AppState.ui.paginaAtual; }
function getFiltroVendedor() { return AppState.filtros.vendedor; }
function getFiltroLoja() { return AppState.filtros.loja; }

export {
    AppState, store,
    setUsuarioLogado, setClienteAtual, setFiltroMes, getLojasPermitidas,
    getUsuarioLogado, getFiltroMes, getFiltroAno, getFiltroDia,
    getViewAtual, getViewAnterior, getPaginaAtual, getFiltroVendedor, getFiltroLoja
};
