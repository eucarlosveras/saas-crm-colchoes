// ═══════════════════════════════════════════════════════════════
// main.js — ponto de entrada. Faz o bootstrap da aplicação e expõe em
// `window` toda função referenciada via onclick/onchange/... inline no HTML
// gerado dinamicamente (necessário porque módulos ES6 não vazam identificadores
// para o escopo global automaticamente, ao contrário de scripts clássicos).
// ═══════════════════════════════════════════════════════════════
import { renderAgendaDia, setAgendaFiltro } from './agenda.js';
import { checkSession, handleLogin, logout } from './auth.js';
import { clearSearch, handleSearch, handleSearchProtocolo, handleSearchUnificado, selectFilter } from './carteira.js';
import { abrirModalEditarCliente, abrirModalExcluirCliente, confirmarExcluirCliente, filtrarClientesLista, salvarEdicaoCliente } from './clientes.js';
import { atualizarIndicadorDigitacao, confirmarExclusaoComentario, salvarComentario, salvarObservacaoFixa } from './comentarios.js';
import { selecionarPeriodoKpiVendedor } from './dashboard.js';
import { fecharModalNovoProduto, filtrarEstoque, salvarNovoProdutoEstoque } from './estoque.js';
import { changeDay, changeMonth, filtrarPorLoja, filtrarPorVendedor } from './filtros.js';
import { abrirModalMeta, salvarMetaLoja, salvarNovaMeta } from './metas.js';
import { marcarNotificacaoBancoLida, marcarNotificacaoLida, toggleNotifications } from './notificacoes.js';
import { _ajusteAtualizarLixeiras, abrirAjusteProposta, abrirConfirmaFechamento, abrirDetalhesCliente, abrirModalAgendamento, abrirMotivoPerda, abrirNovoOrcamento, adicionarProdutoRow, agendarContato, ajusteAdicionarLinha, ajusteRecalcularLinha, ajusteRecalcularTotal, ajusteValidarDesconto, confirmarPerda, expandirComentario, fecharProdutoSugestoes, filtrarProdutoSugestoes, prodNomeKeydown, recalcularLinhaNovoOrcamento, removerProdutoRow, salvarAjusteProposta, salvarOrcamento, selecionarModoFechamento, setQuickDate, validarCPF, voltarDetalhes } from './orcamentos.js';
import { analisarClienteComIA, enviarMensagemChatIA, fecharModalChatIA } from './radar.js';
import { navigateTo } from './router.js';
import { store } from './state.js';
import { closeModal, esconderLoaderGlobalSeExistir, mostrarToastErroGenerico, toggleTheme } from './ui.js';
import { abrirModalExcluirUsuarioAdmin, abrirModalUsuarioAdmin, confirmarExclusaoUsuario, salvarUsuarioAdmin, toggleCampoLojasMultiplas, toggleSenhaAdmin } from './usuarios.js';
import { escapeHtml, formatCurrency, validateField } from './utils.js';

// ─── Expõe em window as funções referenciadas via atributos inline no HTML ───
window._ajusteAtualizarLixeiras = _ajusteAtualizarLixeiras;
window.abrirAjusteProposta = abrirAjusteProposta;
window.abrirConfirmaFechamento = abrirConfirmaFechamento;
window.abrirDetalhesCliente = abrirDetalhesCliente;
window.abrirModalAgendamento = abrirModalAgendamento;
window.abrirModalEditarCliente = abrirModalEditarCliente;
window.abrirModalExcluirCliente = abrirModalExcluirCliente;
window.abrirModalExcluirUsuarioAdmin = abrirModalExcluirUsuarioAdmin;
window.abrirModalMeta = abrirModalMeta;
window.abrirModalUsuarioAdmin = abrirModalUsuarioAdmin;
window.abrirMotivoPerda = abrirMotivoPerda;
window.abrirNovoOrcamento = abrirNovoOrcamento;
window.adicionarProdutoRow = adicionarProdutoRow;
window.agendarContato = agendarContato;
window.ajusteAdicionarLinha = ajusteAdicionarLinha;
window.ajusteRecalcularLinha = ajusteRecalcularLinha;
window.ajusteRecalcularTotal = ajusteRecalcularTotal;
window.ajusteValidarDesconto = ajusteValidarDesconto;
window.analisarClienteComIA = analisarClienteComIA;
window.atualizarIndicadorDigitacao = atualizarIndicadorDigitacao;
window.changeDay = changeDay;
window.changeMonth = changeMonth;
window.clearSearch = clearSearch;
window.closeModal = closeModal;
window.confirmarExcluirCliente = confirmarExcluirCliente;
window.confirmarExclusaoComentario = confirmarExclusaoComentario;
window.confirmarExclusaoUsuario = confirmarExclusaoUsuario;
window.confirmarPerda = confirmarPerda;
window.enviarMensagemChatIA = enviarMensagemChatIA;
window.escapeHtml = escapeHtml;
window.expandirComentario = expandirComentario;
window.fecharModalChatIA = fecharModalChatIA;
window.fecharModalNovoProduto = fecharModalNovoProduto;
window.fecharProdutoSugestoes = fecharProdutoSugestoes;
window.filtrarClientesLista = filtrarClientesLista;
window.filtrarEstoque = filtrarEstoque;
window.filtrarPorLoja = filtrarPorLoja;
window.filtrarPorVendedor = filtrarPorVendedor;
window.filtrarProdutoSugestoes = filtrarProdutoSugestoes;
window.formatCurrency = formatCurrency;
window.handleLogin = handleLogin;
window.handleSearch = handleSearch;
window.handleSearchProtocolo = handleSearchProtocolo;
window.handleSearchUnificado = handleSearchUnificado;
window.logout = logout;
window.marcarNotificacaoBancoLida = marcarNotificacaoBancoLida;
window.marcarNotificacaoLida = marcarNotificacaoLida;
window.navigateTo = navigateTo;
window.prodNomeKeydown = prodNomeKeydown;
window.recalcularLinhaNovoOrcamento = recalcularLinhaNovoOrcamento;
window.removerProdutoRow = removerProdutoRow;
window.salvarAjusteProposta = salvarAjusteProposta;
window.salvarComentario = salvarComentario;
window.salvarEdicaoCliente = salvarEdicaoCliente;
window.salvarMetaLoja = salvarMetaLoja;
window.salvarNovaMeta = salvarNovaMeta;
window.salvarNovoProdutoEstoque = salvarNovoProdutoEstoque;
window.salvarObservacaoFixa = salvarObservacaoFixa;
window.salvarOrcamento = salvarOrcamento;
window.salvarUsuarioAdmin = salvarUsuarioAdmin;
window.selecionarModoFechamento = selecionarModoFechamento;
window.selecionarPeriodoKpiVendedor = selecionarPeriodoKpiVendedor;
window.selectFilter = selectFilter;
window.setAgendaFiltro = setAgendaFiltro;
window.setQuickDate = setQuickDate;
window.toggleCampoLojasMultiplas = toggleCampoLojasMultiplas;
window.toggleNotifications = toggleNotifications;
window.toggleSenhaAdmin = toggleSenhaAdmin;
window.toggleTheme = toggleTheme;
window.validarCPF = validarCPF;
window.validateField = validateField;
window.voltarDetalhes = voltarDetalhes;

// ─── Bootstrap ───
        window.addEventListener('error', function (event) {
            console.error('Erro global capturado:', event.error || event.message);
            esconderLoaderGlobalSeExistir();
            mostrarToastErroGenerico();
        });

        window.addEventListener('unhandledrejection', function (event) {
            console.error('Promise rejeitada sem tratamento:', event.reason);
            esconderLoaderGlobalSeExistir();
            mostrarToastErroGenerico();
        });

        window.addEventListener('focus', async () => {
            if (store.currentView === 'agenda_dia') await renderAgendaDia();
        });

        (function() {
            if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
        })();

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modais = ['modalMotivoPerda', 'modalConfirmaFechamento', 'modalEditarMeta', 'modalExcluirComentario', 'modalUsuarioAdmin', 'modalExcluirUsuarioAdmin', 'modalEditarCliente', 'modalExcluirCliente', 'modalCriarNegocio', 'modalAjusteProposta', 'modalAgendarContato'];
                for (const id of modais) {
                    if (document.getElementById(id) && document.getElementById(id).classList.contains('open')) {
                        closeModal(id);
                        break;
                    }
                }
                document.getElementById('notificationDropdown').classList.remove('open');
            }
        });

        document.getElementById('hamburgerBtn').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
            if (sidebar.classList.contains('open')) sidebar.querySelector('.nav-item.active')?.focus();
        });

        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('open');
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('open');
                    document.getElementById('sidebarOverlay').classList.remove('open');
                }
            });
        });

        checkSession();
