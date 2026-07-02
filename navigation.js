// ═══════════════════════════════════════════════════════════════
// MÓDULO DE NAVEGAÇÃO E ROTEAMENTO
// Gerencia navegação entre views e controle de estado da aplicação
// ═══════════════════════════════════════════════════════════════

import { 
    getViewAtualState, 
    getViewAnteriorState, 
    setViewAtualState, 
    setViewAnteriorState,
    getPaginaAtualState,
    setPaginaAtualState,
    getFiltroVendedorState,
    getFiltroLojaState,
    setFiltroVendedorState,
    setFiltroLojaState
} from './state.js';

export function createNavigationModule(dependencies) {
    const {
        db,
        currentUser,
        setCurrentUser,
        dashboardModule,
        agendaModule,
        carregarKpisEDashboard,
        renderNotificationBadge,
        buildNotifications,
        atualizarFab,
        STATUS
    } = dependencies;

    let currentView = 'inicio';
    let previousView = 'inicio';
    let currentPage = 1;
    let searchTerm = '';
    let searchProtocolo = '';
    let currentFilter = 'todos';
    let kanbanAtivo = false;

    // Getters e setters compatíveis com o código legado
    function getCurrentView() { return currentView; }
    function setCurrentView(view) { currentView = view; }
    function getPreviousView() { return previousView; }
    function setPreviousView(view) { previousView = view; }
    function getCurrentPage() { return currentPage; }
    function setCurrentPage(page) { currentPage = page; }
    function getSearchTerm() { return searchTerm; }
    function setSearchTerm(term) { searchTerm = term; }
    function getSearchProtocolo() { return searchProtocolo; }
    function setSearchProtocolo(protocolo) { searchProtocolo = protocolo; }
    function getCurrentFilter() { return currentFilter; }
    function setCurrentFilter(filter) { currentFilter = filter; }
    function isKanbanAtivo() { return kanbanAtivo; }
    function setKanbanAtivo(ativo) { kanbanAtivo = ativo; }

    /**
     * Navega para uma view específica
     * @param {string} view - Nome da view para navegar
     */
    async function navigateTo(view) {
        // Limpa rolagem infinita de clientes ao sair da página
        if (currentView === 'clientes_lista' && view !== 'clientes_lista') {
            if (window._clientes?.observer) { 
                window._clientes.observer.disconnect(); 
                window._clientes.observer = null; 
            }
            window._clientesCache = null;
        }

        // Guarda view anterior (exceto detalhes_cliente e novo_orcamento)
        if (currentView !== 'detalhes_cliente' && currentView !== 'novo_orcamento') {
            previousView = currentView;
        }
        
        currentView = view;
        currentPage = 1;

        // Atualiza navegação lateral
        document.querySelectorAll('.nav-item').forEach(el => { 
            el.classList.remove('active'); 
            el.removeAttribute('aria-current'); 
        });
        
        const target = document.querySelector(`[data-nav="${view}"]`);
        if (target) { 
            target.classList.add('active'); 
            target.setAttribute('aria-current', 'page'); 
        }

        // Limpa filtros de busca
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        searchTerm = '';
        
        searchProtocolo = '';
        const searchProtInput = document.getElementById('searchProtocoloInput');
        if (searchProtInput) searchProtInput.value = '';

        // ROTEAMENTO PRINCIPAL
        if (view === 'inicio') {
            await carregarKpisEDashboard();
            if (dashboardModule) {
                dashboardModule.renderInicioDashboard();
            } else {
                // Fallback para renderização legada se módulo não existir
                console.warn('Dashboard module not loaded');
            }
            atualizarFab('inicio');
        }
        else if (view === 'carteira') {
            await carregarKpisEDashboard();
            if (dashboardModule && dashboardModule.renderCarteiraPage) {
                dashboardModule.renderCarteiraPage();
            }
        }
        else if (view === 'admin_inicio') {
            if (dashboardModule && dashboardModule.renderAdminInicio) {
                dashboardModule.renderAdminInicio(document.getElementById('mainContent'));
            }
        }
        else if (view === 'admin_usuarios') {
            if (dashboardModule && dashboardModule.renderAdminUsuarios) {
                dashboardModule.renderAdminUsuarios(document.getElementById('mainContent'));
            }
        }
        else if (view === 'agenda_dia') {
            if (agendaModule) {
                await agendaModule.renderAgendaDia();
            }
        }
        else if (view === 'clientes') {
            await carregarKpisEDashboard();
            if (dashboardModule && dashboardModule.renderClientes) {
                dashboardModule.renderClientes();
            }
        }
        else if (view === 'metas') {
            if (dashboardModule && dashboardModule.renderMetas) {
                dashboardModule.renderMetas();
            }
        }
        else if (view === 'detalhes_cliente') {
            const fab = document.getElementById('fabButton');
            if (fab) fab.style.display = 'none';
            if (dashboardModule && dashboardModule.renderDetalhesClientePage) {
                dashboardModule.renderDetalhesClientePage();
            }
        }
        else if (view === 'novo_orcamento') {
            if (dashboardModule && dashboardModule.renderNovoOrcamentoPage) {
                dashboardModule.renderNovoOrcamentoPage();
            }
        }
        else if (view === 'clientes_lista') {
            if (dashboardModule && dashboardModule.renderClientesLista) {
                await dashboardModule.renderClientesLista();
            }
        }
        else if (view === 'ficha_cliente') {
            if (dashboardModule && dashboardModule.renderFichaCliente) {
                await dashboardModule.renderFichaCliente();
            }
        }
        else if (view === 'estoque') {
            atualizarFab('estoque');
            if (dashboardModule && dashboardModule.renderEstoque) {
                await dashboardModule.renderEstoque();
            }
        }
        else if (view === 'meu_radar') {
            atualizarFab('meu_radar');
            if (dashboardModule && dashboardModule.renderMeuRadar) {
                dashboardModule.renderMeuRadar();
            }
        }

        // Atualiza badge de notificações após navegação
        if (typeof renderNotificationBadge === 'function') {
            renderNotificationBadge(buildNotifications().length);
        }
    }

    /**
     * Alterna entre visualização de carteira e início
     */
    function switchCarteiraView(view) {
        if (view === 'carteira') {
            currentFilter = 'todos';
            searchTerm = '';
            searchProtocolo = '';
            navigateTo('carteira');
        } else {
            navigateTo('inicio');
        }
    }

    /**
     * Filtra por vendedor no terminal
     */
    function terminalFiltrarVendedor(idVendedor) {
        setFiltroVendedorState(idVendedor);
        if (currentView === 'carteira' || currentView === 'inicio') {
            navigateTo(currentView);
        }
    }

    /**
     * Filtra por loja
     */
    async function filtrarPorLoja(val) {
        setFiltroLojaState(val);
        if (currentView === 'carteira' || currentView === 'inicio') {
            await navigateTo(currentView);
        }
    }

    /**
     * Filtra por vendedor
     */
    async function filtrarPorVendedor(val) {
        setFiltroVendedorState(val);
        if (currentView === 'carteira' || currentView === 'inicio') {
            await navigateTo(currentView);
        }
    }

    /**
     * Muda o mês do filtro
     */
    async function changeMonth(val) {
        const [mes, ano] = val.split('-');
        // Atualiza estado global via state.js
        const { setFiltroMesState } = await import('./state.js');
        setFiltroMesState(parseInt(mes), parseInt(ano));
        
        if (currentView === 'carteira' || currentView === 'inicio') {
            await navigateTo(currentView);
        }
    }

    /**
     * Muda o dia do filtro
     */
    async function changeDay(val) {
        const { setFiltroDiaState } = await import('./state.js');
        setFiltroDiaState(val ? parseInt(val) : null);
        
        if (currentView === 'carteira' || currentView === 'inicio') {
            await navigateTo(currentView);
        }
    }

    /**
     * Lida com busca de protocolo
     */
    function handleSearchProtocolo() {
        const input = document.getElementById('searchProtocoloInput');
        if (!input) return;
        
        searchProtocolo = input.value.trim();
        
        if (currentView === 'kanban' || currentView === 'carteira') {
            if (dashboardModule && dashboardModule.renderKanbanBoard) {
                dashboardModule.renderKanbanBoard();
            }
        } else {
            navigateTo(currentView);
        }
    }

    /**
     * Limpa busca
     */
    function clearSearch() {
        searchTerm = '';
        searchProtocolo = '';
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        
        const searchProtInput = document.getElementById('searchProtocoloInput');
        if (searchProtInput) searchProtInput.value = '';
        
        if (currentView === 'kanban' || currentView === 'carteira') {
            if (dashboardModule && dashboardModule.renderKanbanBoard) {
                dashboardModule.renderKanbanBoard();
            }
        } else {
            navigateTo(currentView);
        }
    }

    /**
     * Seleciona filtro de status
     */
    function selectFilter(filter) {
        currentFilter = filter;
        
        if (currentView === 'kanban' || currentView === 'carteira') {
            if (dashboardModule && dashboardModule.renderKanbanBoard) {
                dashboardModule.renderKanbanBoard();
            }
        } else {
            navigateTo(currentView);
        }
    }

    /**
     * Muda página da tabela paginada
     */
    function changePage(page) {
        currentPage = page;
        if (dashboardModule && dashboardModule.atualizarTabelaPaginadaServer) {
            dashboardModule.atualizarTabelaPaginadaServer();
        }
    }

    // Expõe funções públicas
    return {
        navigateTo,
        switchCarteiraView,
        terminalFiltrarVendedor,
        filtrarPorLoja,
        filtrarPorVendedor,
        changeMonth,
        changeDay,
        handleSearchProtocolo,
        clearSearch,
        selectFilter,
        changePage,
        // Getters/Setters para compatibilidade
        getCurrentView,
        setCurrentView,
        getPreviousView,
        setPreviousView,
        getCurrentPage,
        setCurrentPage,
        getSearchTerm,
        setSearchTerm,
        getSearchProtocolo,
        setSearchProtocolo,
        getCurrentFilter,
        setCurrentFilter,
        isKanbanAtivo,
        setKanbanAtivo
    };
}
