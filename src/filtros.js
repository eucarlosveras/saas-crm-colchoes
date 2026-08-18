// ═══════════════════════════════════════════════════════════════
// Módulo: filtros.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { renderCarteiraPage } from './carteira.js';
import { carregarKpisEDashboard, renderInicio } from './dashboard.js';
import { getLojasPermitidas, store } from './state.js';
import { escapeHtml } from './utils.js';

        function buildLojaOptions() {
            // Para Gerente Multiloja/loja única, o seletor mostra só as lojas permitidas + "Todas" (que agrega essas lojas).
            const lojasPermitidasSel = getLojasPermitidas();
            const lojasParaExibir = lojasPermitidasSel
                ? store.listaLojas.filter(l => lojasPermitidasSel.includes(l.id_loja))
                : store.listaLojas;
            let opts = `<option value="todas">Todas as lojas</option>`;
            lojasParaExibir.slice().sort((a,b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
                opts += `<option value="${l.id_loja}" ${store.selectedLoja === l.id_loja ? 'selected' : ''}>${escapeHtml(l.nome_loja)}</option>`;
            });
            return opts;
        }

        function buildVendedorOptions() {
            let filtrados = store.todosVendedores;
            if (store.currentUser.perfil === 'Gerente') {
                const lojasPermitidasVend = getLojasPermitidas();
                filtrados = lojasPermitidasVend
                    ? store.todosVendedores.filter(v => lojasPermitidasVend.includes(v.id_loja))
                    : store.todosVendedores;
                if (store.selectedLoja !== 'todas') filtrados = filtrados.filter(v => v.id_loja === store.selectedLoja);
            } else if (store.selectedLoja !== 'todas') {
                filtrados = store.todosVendedores.filter(v => v.id_loja === store.selectedLoja);
            }
            let opts = '<option value="todos" ' + (store.selectedVendedor === 'todos' ? 'selected' : '') + '>Todos os vendedores</option>';
            filtrados.forEach(v => { opts += `<option value="${v.id_usuario}" ${store.selectedVendedor == v.id_usuario ? 'selected' : ''}>${escapeHtml(v.nome)}</option>`; });
            return opts;
        }

        function buildMonthOptions() {
            let opts = '';
            for (let i = 0; i < 12; i++) {
                const d = new Date(store.currentYear, i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const sel = (d.getMonth() + 1 === store.currentMonth && d.getFullYear() === store.currentYear && !store.currentDay) ? 'selected' : '';
                opts += `<option value="${val}" ${sel}>${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>`;
            }
            return opts;
        }

        function buildDayOptions() {
            const daysInMonth = new Date(store.currentYear, store.currentMonth, 0).getDate();
            let opts = `<option value="todos" ${!store.currentDay ? 'selected' : ''}>Todos os dias</option>`;
            for (let d = 1; d <= daysInMonth; d++) {
                const sel = store.currentDay === d ? 'selected' : '';
                opts += `<option value="${d}" ${sel}>Dia ${d}</option>`;
            }
            return opts;
        }

        function renderFiltrosData(isGerente) {
            const isAdmin = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
            // Gerente de loja única nunca precisou escolher loja (só tem uma). Gerente Multiloja precisa,
            // então o seletor também aparece pra ele, mostrando só as lojas permitidas (buildLojaOptions já filtra isso).
            const lojasPermitidasFiltro = getLojasPermitidas();
            const mostrarSeletorLoja = isAdmin || (lojasPermitidasFiltro && lojasPermitidasFiltro.length > 1);
            return `<div class="filter-group">
                ${mostrarSeletorLoja ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span><select class="vendedor-select" id="lojaSelect" onchange="filtrarPorLoja(this.value)" aria-label="Filtrar por loja">${buildLojaOptions()}</select></div>` : ''}
                ${isGerente ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><select class="vendedor-select" id="vendedorSelect" onchange="filtrarPorVendedor(this.value)" aria-label="Filtrar por vendedor">${buildVendedorOptions()}</select></div>` : ''}
                <div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></span><select class="month-select" id="monthSelect" onchange="changeMonth(this.value)" aria-label="Selecionar mês">${buildMonthOptions()}</select></div>
                <div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></span><select class="day-select" id="daySelect" onchange="changeDay(this.value)" aria-label="Selecionar dia">${buildDayOptions()}</select></div>
            </div>`;
        }

       async function filtrarPorLoja(val) { 
    store.selectedLoja = val; 
    store.selectedVendedor = 'todos'; 
    store.currentPage = 1; 
    await carregarKpisEDashboard(); 
    
    if (store.currentView === 'carteira') {
        renderCarteiraPage();
    } else if (store.currentView === 'inicio') {
        renderInicio();
    } 
}

async function filtrarPorVendedor(val) { 
    store.selectedVendedor = val; 
    store.currentPage = 1; 
    await carregarKpisEDashboard(); 
    
    if (store.currentView === 'carteira') {
        renderCarteiraPage();
    } else if (store.currentView === 'inicio') {
        renderInicio();
    } 
}

        async function changeMonth(val) { 
    const [year, month] = val.split('-').map(Number); 
    store.currentYear = year; 
    store.currentMonth = month; 
    store.currentDay = null; 
    await carregarKpisEDashboard(); 

    if (store.currentView === 'carteira') {
        renderCarteiraPage();
    } else if (store.currentView === 'inicio') {
        renderInicio();
    } 
}

async function changeDay(val) { 
    store.currentDay = val === 'todos' ? null : parseInt(val); 
    await carregarKpisEDashboard(); 

    if (store.currentView === 'carteira') {
        renderCarteiraPage();
    } else if (store.currentView === 'inicio') {
        renderInicio();
    } 
}

export { buildDayOptions, buildLojaOptions, buildMonthOptions, buildVendedorOptions, changeDay, changeMonth, filtrarPorLoja, filtrarPorVendedor, renderFiltrosData };
