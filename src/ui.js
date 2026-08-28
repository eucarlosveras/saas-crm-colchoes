// ═══════════════════════════════════════════════════════════════
// Módulo: ui.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { renderClientesLista, renderFichaCliente } from './clientes.js';
import { renderInicio } from './dashboard.js';
import { abrirModalNovoProduto } from './estoque.js';
import { abrirNovoOrcamento, renderDetalhesClientePage, renderNovoOrcamentoPage } from './orcamentos.js';
import { podeCriarOrcamento, store } from './state.js';
import { renderAdminInicio, renderAdminUsuarios } from './usuarios.js';

        function atualizarFab(view) {
    const fab = document.getElementById('fabButton');
    if (!fab) return;
    if (view === 'inicio' && podeCriarOrcamento()) {
        fab.style.display = 'flex';
        fab.title = 'Novo orçamento';
        fab.onclick = abrirNovoOrcamento;
    } else if (view === 'estoque') {
        fab.style.display = 'flex';
        fab.title = 'Adicionar produto';
        fab.onclick = abrirModalNovoProduto;
    } else {
        fab.style.display = 'none';
    }
}

                function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            let icon = '';
            if(type === 'success') icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            if(type === 'error') icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
            if(type === 'info') icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
            toast.innerHTML = `${icon} <span>${message}</span>`;
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function showLoader() { document.getElementById('globalLoader').classList.add('loading'); }

        function hideLoader() { document.getElementById('globalLoader').classList.remove('loading'); }

        function esconderLoaderGlobalSeExistir() {
            const loader = document.getElementById('globalLoader');
            if (loader) loader.style.display = 'none';
        }

        function mostrarToastErroGenerico() {
            if (typeof showToast === 'function') {
                showToast('Ocorreu um erro inesperado. Tente novamente.', 'error');
            }
        }

        function openModal(modalId) { const modal = document.getElementById(modalId); if (!modal) return; store.lastFocusedElement = document.activeElement; modal.classList.add('open'); setTimeout(() => { const firstInput = modal.querySelector('input, textarea, select'); if (firstInput) firstInput.focus(); }, 100); }

        function closeModal(modalId) { const modal = document.getElementById(modalId); if (!modal) return; modal.classList.remove('open'); if (store.lastFocusedElement && document.body.contains(store.lastFocusedElement)) { store.lastFocusedElement.focus(); } }

        function toggleTheme() {
            document.body.classList.toggle('dark');
            localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
            if (store.donutChartInstance) { store.donutChartInstance.destroy(); store.donutChartInstance = null; }
            if (store.barChartInstance) { store.barChartInstance.destroy(); store.barChartInstance = null; }
            if (store.currentView === 'inicio') renderInicio();
            else if (store.currentView === 'admin_inicio') renderAdminInicio(document.getElementById('mainContent'));
            else if (store.currentView === 'admin_usuarios') renderAdminUsuarios(document.getElementById('mainContent'));
            else if (store.currentView === 'detalhes_cliente') renderDetalhesClientePage();
            else if (store.currentView === 'novo_orcamento') renderNovoOrcamentoPage();
            else if (store.currentView === 'clientes_lista') renderClientesLista();
            else if (store.currentView === 'ficha_cliente') renderFichaCliente();
        }

        // Recolhe/expande a sidebar pra modo só-ícone (desktop). Puramente visual —
        // não afeta nenhuma tela renderizada, só a largura da sidebar/main-content
        // via classe no body (ver style.css, tudo dentro de @media min-width:769px).
        function toggleSidebarCollapse() {
            document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
        }

export { atualizarFab, closeModal, esconderLoaderGlobalSeExistir, hideLoader, mostrarToastErroGenerico, openModal, showLoader, showToast, toggleSidebarCollapse, toggleTheme };
