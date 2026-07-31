// Router simples para navegação SPA

const routes = {};

/**
 * Registra uma rota com sua função de renderização
 */
export function registerRoute(name, renderFn) {
  routes[name] = renderFn;
}

/**
 * Navega para uma view específica
 */
export async function navigateTo(view) {
  const { currentView, previousView } = await import('./config/state.js');
  
  // Salva view anterior
  previousView = currentView;
  currentView = view;
  
  // Atualiza classe active na sidebar
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });
  
  // Esconde todas as seções de conteúdo
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    // Limpa conteúdo principal
    mainContent.innerHTML = '<div id="pageContainer" class="page-container"></div>';
  }
  
  // Chama a função de render da view
  if (routes[view]) {
    routes[view]();
  } else {
    console.warn(`Rota não registrada: ${view}`);
  }
  
  // Atualiza FAB button
  const { atualizarFab } = await import('./components/ui.js');
  atualizarFab(view);
}
