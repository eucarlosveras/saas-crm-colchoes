// ═══════════════════════════════════════════════════════════════
// Módulo: router.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { renderAgendaDia } from './agenda.js';
import { renderCarteiraPage } from './carteira.js';
import { _clientes, renderClientes, renderClientesLista, renderFichaCliente } from './clientes.js';
import { carregarKpisDiariosVendedor, carregarKpisEDashboard, renderInicio } from './dashboard.js';
import { renderEstoque } from './estoque.js';
import { renderMetas } from './metas.js';
import { renderDetalhesClientePage, renderNovoOrcamentoPage } from './orcamentos.js';
import { store } from './state.js';
import { atualizarFab } from './ui.js';
import { renderAdminInicio, renderAdminUsuarios } from './usuarios.js';

        async function navigateTo(view) {
   	 // Limpa rolagem infinita de clientes ao sair da página
  	  if (store.currentView === 'clientes_lista' && view !== 'clientes_lista') {
        if (_clientes.observer) { _clientes.observer.disconnect(); _clientes.observer = null; }
    	    window._clientesCache = null;
  	  }
    
 	   store.previousView = store.currentView !== 'detalhes_cliente' && store.currentView !== 'novo_orcamento' ? store.currentView : store.previousView;
  	  store.currentView = view;
    
	    document.querySelectorAll('.nav-item').forEach(el => { el.classList.remove('active'); el.removeAttribute('aria-current'); });
 	   const target = document.querySelector(`[data-nav="${view}"]`);
 	   if (target) { target.classList.add('active'); target.setAttribute('aria-current', 'page'); }
    
  	  store.currentPage = 1;
	    const searchInput = document.getElementById('searchInput');
	    if (searchInput) searchInput.value = '';
  	  store.searchTerm = '';
	    store.searchProtocolo = '';
	    const searchProtInput = document.getElementById('searchProtocoloInput');
  	  if (searchProtInput) searchProtInput.value = '';

	    // --- ROTEAMENTO ---
 	   if (view === 'inicio') {
 	       // "Visão Vendedor" é a padrão — carrega sempre. "Visão Gerencial" (Gerente/Admin)
 	       // só é buscada sob demanda quando o botão de alternar é clicado (ver dashboard.js).
 	       await Promise.all([carregarKpisEDashboard(), carregarKpisDiariosVendedor()]);
  	      renderInicio();
               atualizarFab('inicio');
 	   }
 	   else if (view === 'carteira') {
        	atualizarFab('carteira');         // Oculta o FAB (só aparece em 'inicio' e 'estoque')
  	      await carregarKpisEDashboard(); // Garante que os dados mais novos venham do banco
        	renderCarteiraPage();           // Chama a nova página do Kanban que criamos
    	}
    	else if (view === 'admin_inicio') renderAdminInicio(document.getElementById('mainContent'));
    	else if (view === 'admin_usuarios') renderAdminUsuarios(document.getElementById('mainContent'));
    	else if (view === 'agenda_dia') {
        	await renderAgendaDia();
    	}
    	else if (view === 'clientes') {
        	await carregarKpisEDashboard();
        	renderClientes();
    	}
    	else if (view === 'metas') renderMetas();
    	else if (view === 'detalhes_cliente') {
        	const fab = document.getElementById('fabButton');
        	if (fab) fab.style.display = 'none';
        	renderDetalhesClientePage();
    	}
    	else if (view === 'novo_orcamento') renderNovoOrcamentoPage();
    	else if (view === 'clientes_lista') await renderClientesLista();
    	else if (view === 'ficha_cliente') await renderFichaCliente();
    else if (view === 'estoque') {
        atualizarFab('estoque');
        await renderEstoque();
    }
}

export { navigateTo };
