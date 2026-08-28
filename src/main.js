// ═══════════════════════════════════════════════════════════════
// main.js — ponto de entrada. Faz o bootstrap da aplicação e expõe em
// `window` toda função referenciada via onclick/onchange/... inline no HTML
// gerado dinamicamente (necessário porque módulos ES6 não vazam identificadores
// para o escopo global automaticamente, ao contrário de scripts clássicos).
// ═══════════════════════════════════════════════════════════════
import { renderAgendaDia, setAgendaFiltro } from './agenda.js';
import { alterarStatusVendedor, copiarCodigoLoja, decidirAcesso, filtrarAcessos } from './aprovacoes.js';
import { abrirRecuperarSenha, checkSession, enviarLinkRecuperacaoSenha, handleLogin, logout, voltarParaLogin } from './auth.js';
import { clearSearch, handleSearch, handleSearchProtocolo, handleSearchUnificado, selectFilter } from './carteira.js';
import { abrirModalEditarCliente, abrirModalExcluirCliente, confirmarExcluirCliente, filtrarClientesLista, salvarEdicaoCliente } from './clientes.js';
import { atualizarIndicadorDigitacao, confirmarExclusaoComentario, salvarComentario, salvarObservacaoFixa } from './comentarios.js';
import { alternarVisaoDashboard, selecionarPeriodoKpiVendedor } from './dashboard.js';
import { abrirKardexEstoque, abrirModalImportarEstoque, abrirModalImportarNF, baixarModeloImportacaoEstoque, confirmarImportacaoEstoque, confirmarImportacaoNF, fecharModalImportarEstoque, fecharModalImportarNF, fecharModalKardex, fecharModalNovoProduto, filtrarEstoque, processarArquivoImportacaoEstoque, processarArquivoImportarNF, removerItemPreviewNF, salvarNovoProdutoEstoque } from './estoque.js';
import { changeDay, changeMonth, filtrarPorLoja, filtrarPorVendedor } from './filtros.js';
import { abrirModalMeta, salvarMetaLoja, salvarNovaMeta } from './metas.js';
import { marcarNotificacaoBancoLida, marcarNotificacaoLida, toggleNotifications } from './notificacoes.js';
import { _ajusteAtualizarLixeiras, abrirAjusteProposta, abrirConfirmaFechamento, abrirDetalhesCliente, abrirModalAgendamento, abrirModalAgendarNovoOrcamento, abrirModalGerarOrcamento, abrirMotivoPerda, abrirNovoOrcamento, adicionarProdutoRow, agendarContato, ajusteAdicionarLinha, ajusteRecalcularLinha, ajusteRecalcularTotal, ajusteValidarDesconto, atualizarTextoOrcamentoComDesconto, confirmarPerda, copiarTextoOrcamento, enviarOrcamentoWhatsApp, expandirComentario, fecharProdutoSugestoes, filtrarProdutoSugestoes, marcarTextoOrcamentoEditadoManualmente, prodNomeKeydown, recalcularLinhaNovoOrcamento, removerProdutoRow, salvarAjusteProposta, salvarOrcamento, selecionarModoFechamento, selecionarProdutoSugestao, setQuickDate, validarCPF, voltarDetalhes } from './orcamentos.js';
import { analisarClienteComIA, enviarMensagemChatIA, fecharModalChatIA } from './radar.js';
import { navigateTo } from './router.js';
import { store } from './state.js';
import { closeModal, esconderLoaderGlobalSeExistir, mostrarToastErroGenerico, toggleSidebarCollapse, toggleTheme } from './ui.js';
import { abrirModalExcluirUsuarioAdmin, abrirModalUsuarioAdmin, confirmarExclusaoUsuario, decidirAcessoAdmin, filtrarUsuariosAdmin, salvarUsuarioAdmin, toggleCampoLojasMultiplas, toggleSenhaAdmin } from './usuarios.js';
import { escapeHtml, formatCurrency, validateField } from './utils.js';

// ─── Expõe em window as funções referenciadas via atributos inline no HTML ───
window._ajusteAtualizarLixeiras = _ajusteAtualizarLixeiras;
window.alterarStatusVendedor = alterarStatusVendedor;
window.copiarCodigoLoja = copiarCodigoLoja;
window.decidirAcesso = decidirAcesso;
window.filtrarAcessos = filtrarAcessos;
window.abrirAjusteProposta = abrirAjusteProposta;
window.abrirConfirmaFechamento = abrirConfirmaFechamento;
window.abrirDetalhesCliente = abrirDetalhesCliente;
window.abrirModalAgendamento = abrirModalAgendamento;
window.abrirModalAgendarNovoOrcamento = abrirModalAgendarNovoOrcamento;
window.abrirModalEditarCliente = abrirModalEditarCliente;
window.abrirModalExcluirCliente = abrirModalExcluirCliente;
window.abrirModalExcluirUsuarioAdmin = abrirModalExcluirUsuarioAdmin;
window.abrirModalGerarOrcamento = abrirModalGerarOrcamento;
window.abrirModalMeta = abrirModalMeta;
window.abrirModalUsuarioAdmin = abrirModalUsuarioAdmin;
window.alternarVisaoDashboard = alternarVisaoDashboard;
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
window.atualizarTextoOrcamentoComDesconto = atualizarTextoOrcamentoComDesconto;
window.changeDay = changeDay;
window.changeMonth = changeMonth;
window.clearSearch = clearSearch;
window.closeModal = closeModal;
window.confirmarExcluirCliente = confirmarExcluirCliente;
window.confirmarExclusaoComentario = confirmarExclusaoComentario;
window.confirmarExclusaoUsuario = confirmarExclusaoUsuario;
window.decidirAcessoAdmin = decidirAcessoAdmin;
window.filtrarUsuariosAdmin = filtrarUsuariosAdmin;
window.confirmarPerda = confirmarPerda;
window.copiarTextoOrcamento = copiarTextoOrcamento;
window.enviarMensagemChatIA = enviarMensagemChatIA;
window.enviarOrcamentoWhatsApp = enviarOrcamentoWhatsApp;
window.escapeHtml = escapeHtml;
window.expandirComentario = expandirComentario;
window.fecharModalChatIA = fecharModalChatIA;
window.abrirKardexEstoque = abrirKardexEstoque;
window.fecharModalKardex = fecharModalKardex;
window.abrirModalImportarEstoque = abrirModalImportarEstoque;
window.abrirModalImportarNF = abrirModalImportarNF;
window.confirmarImportacaoNF = confirmarImportacaoNF;
window.fecharModalImportarNF = fecharModalImportarNF;
window.processarArquivoImportarNF = processarArquivoImportarNF;
window.removerItemPreviewNF = removerItemPreviewNF;
window.baixarModeloImportacaoEstoque = baixarModeloImportacaoEstoque;
window.confirmarImportacaoEstoque = confirmarImportacaoEstoque;
window.fecharModalImportarEstoque = fecharModalImportarEstoque;
window.processarArquivoImportacaoEstoque = processarArquivoImportacaoEstoque;
window.fecharModalNovoProduto = fecharModalNovoProduto;
window.fecharProdutoSugestoes = fecharProdutoSugestoes;
window.filtrarClientesLista = filtrarClientesLista;
window.filtrarEstoque = filtrarEstoque;
window.filtrarPorLoja = filtrarPorLoja;
window.filtrarPorVendedor = filtrarPorVendedor;
window.filtrarProdutoSugestoes = filtrarProdutoSugestoes;
window.selecionarProdutoSugestao = selecionarProdutoSugestao;
window.formatCurrency = formatCurrency;
window.abrirRecuperarSenha = abrirRecuperarSenha;
window.enviarLinkRecuperacaoSenha = enviarLinkRecuperacaoSenha;
window.handleLogin = handleLogin;
window.voltarParaLogin = voltarParaLogin;
window.handleSearch = handleSearch;
window.handleSearchProtocolo = handleSearchProtocolo;
window.handleSearchUnificado = handleSearchUnificado;
window.logout = logout;
window.marcarNotificacaoBancoLida = marcarNotificacaoBancoLida;
window.marcarTextoOrcamentoEditadoManualmente = marcarTextoOrcamentoEditadoManualmente;
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
window.toggleSidebarCollapse = toggleSidebarCollapse;
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
            if (localStorage.getItem('sidebarCollapsed') === '1') document.body.classList.add('sidebar-collapsed');
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
