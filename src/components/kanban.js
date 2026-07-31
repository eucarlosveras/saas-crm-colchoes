// Componente Kanban (Drag & Drop)

import { db } from '../config/supabase.js';
import { kpisMensais, STATUS, mapStatusUUID } from '../config/state.js';
import { showToast } from './ui.js';

/**
 * Inicia drag de um card
 */
export function dragStart(event, idOrcamento) {
  event.dataTransfer.setData('text/plain', idOrcamento);
  event.dataTransfer.effectAllowed = 'move';
}

/**
 * Permite drop na zona
 */
export function allowDrop(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

/**
 * Entra na zona de drop
 */
export function dragEnter(event) {
  event.preventDefault();
  const column = event.target.closest('.kanban-column');
  if (column) {
    column.classList.add('drag-over');
  }
}

/**
 * Sai da zona de drop
 */
export function dragLeave(event) {
  const column = event.target.closest('.kanban-column');
  if (column) {
    column.classList.remove('drag-over');
  }
}

/**
 * Realiza drop em coluna de status normal
 */
export async function dropCard(event, statusNomeDestino) {
  event.preventDefault();
  
  const column = event.target.closest('.kanban-column');
  if (column) {
    column.classList.remove('drag-over');
  }
  
  const idOrcamento = event.dataTransfer.getData('text/plain');
  if (!idOrcamento) return;
  
  try {
    // Busca ID do status
    const statusData = mapStatusUUID.find(s => s.nome === statusNomeDestino);
    if (!statusData) {
      showToast('Status não encontrado', 'error');
      return;
    }
    
    // Atualiza no banco
    const { error } = await db
      .from('orcamentos')
      .update({ 
        id_status: statusData.id_status,
        data_fechamento: statusNomeDestino === 'Fechado' ? new Date().toISOString() : null
      })
      .eq('id_orcamento', idOrcamento);
    
    if (error) throw error;
    
    showToast(`Movido para ${statusNomeDestino}`, 'success');
    
    // Recarrega dados
    const { carregarKpisEDashboard } = await import('../api/usuarios.js');
    await carregarKpisEDashboard();
    
    // Re-renderiza kanban
    const { renderKanbanBoard } = await import('./kanban.js');
    renderKanbanBoard();
    
  } catch (err) {
    console.error('Erro ao mover card:', err);
    showToast('Erro ao mover card', 'error');
  }
}

/**
 * Realiza drop na coluna de Perdidos
 */
export async function dropCardPerdido(event) {
  event.preventDefault();
  
  const column = event.target.closest('.kanban-column');
  if (column) {
    column.classList.remove('drag-over');
  }
  
  const idOrcamento = event.dataTransfer.getData('text/plain');
  if (!idOrcamento) return;
  
  // Abre modal de motivo de perda
  const { abrirMotivoPerda } = await import('../pages/detalhes.js');
  abrirMotivoPerda(idOrcamento);
}

/**
 * Realiza drop na coluna de Fechados
 */
export async function dropCardFechado(event) {
  event.preventDefault();
  
  const column = event.target.closest('.kanban-column');
  if (column) {
    column.classList.remove('drag-over');
  }
  
  const idOrcamento = event.dataTransfer.getData('text/plain');
  if (!idOrcamento) return;
  
  // Confirma fechamento
  const { abrirConfirmaFechamento } = await import('../pages/detalhes.js');
  abrirConfirmaFechamento(idOrcamento);
}

/**
 * Renderiza board Kanban
 */
export async function renderKanbanBoard() {
  const container = document.getElementById('kanbanBoard');
  if (!container) return;
  
  const { kpisMensais, STATUS } = await import('../config/state.js');
  
  // Agrupa por status
  const columns = {
    'Contato Inicial': [],
    'Negociação': [],
    'Em Fechamento': [],
    'Fechado': [],
    'Perdido': []
  };
  
  kpisMensais.forEach(o => {
    const status = o.status || 'Contato Inicial';
    if (columns[status]) {
      columns[status].push(o);
    }
  });
  
  // Renderiza colunas
  container.innerHTML = Object.entries(columns).map(([statusName, items]) => `
    <div class="kanban-column" 
         ondragover="allowDrop(event)" 
         ondragenter="dragEnter(event)" 
         ondragleave="dragLeave(event)" 
         ondrop="${statusName === 'Perdido' ? 'dropCardPerdido(event)' : statusName === 'Fechado' ? 'dropCardFechado(event)' : `dropCard(event, '${statusName}')`}">
      <div class="kanban-header">
        <span class="kanban-title">${statusName}</span>
        <span class="kanban-count">${items.length}</span>
      </div>
      <div class="kanban-cards">
        ${items.map(card => renderKanbanCard(card)).join('')}
      </div>
    </div>
  `).join('');
}

/**
 * Renderiza card individual do Kanban
 */
function renderKanbanCard(card) {
  const { formatCurrency, getAvatarColor, getIniciais } = arguments.length > 1 
    ? arguments[1] 
    : { 
        formatCurrency: (v) => 'R$ ' + (v || 0).toFixed(2),
        getAvatarColor: (n) => '#6366f1',
        getIniciais: (n) => '?'
      };
  
  return `
    <div class="kanban-card" draggable="true" ondragstart="dragStart(event, ${card.id_orcamento})">
      <div class="kanban-card-header">
        <div class="kanban-avatar" style="background: ${getAvatarColor(card.clientes?.nome_cliente)}">
          ${getIniciais(card.clientes?.nome_cliente)}
        </div>
        <div class="kanban-card-title">${card.clientes?.nome_cliente || 'Cliente'}</div>
      </div>
      <div class="kanban-card-value">${formatCurrency(card.valor_orcado)}</div>
      <div class="kanban-card-products">${card.modelo_colchao || '-'}</div>
      <div class="kanban-card-date">${card.data_criacao ? new Date(card.data_criacao).toLocaleDateString('pt-BR') : ''}</div>
    </div>
  `;
}

/**
 * Atualiza métricas da carteira
 */
export function atualizarMetricasCarteira() {
  const { kpisMensais } = arguments.length > 0 ? arguments[0] : { kpisMensais: [] };
  
  const total = kpisMensais.length;
  const fechados = kpisMensais.filter(o => o.status === 'Fechado').length;
  const perdidos = kpisMensais.filter(o => o.status === 'Perdido').length;
  const valorTotal = kpisMensais.reduce((sum, o) => sum + (o.valor_orcado || 0), 0);
  
  const metricsEl = document.getElementById('carteiraMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="metric-item">
        <span class="metric-label">Total</span>
        <span class="metric-value">${total}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Fechados</span>
        <span class="metric-value success">${fechados}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Perdidos</span>
        <span class="metric-value danger">${perdidos}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Valor Total</span>
        <span class="metric-value">${formatCurrency(valorTotal)}</span>
      </div>
    `;
  }
}

/**
 * Alterna view da carteira (lista/kanban)
 */
export function switchCarteiraView(view) {
  const { kanbanAtivo } = arguments.length > 1 ? arguments[1] : { kanbanAtivo: false };
  
  kanbanAtivo = view === 'kanban';
  
  const listView = document.getElementById('carteiraListView');
  const kanbanView = document.getElementById('kanbanBoard');
  
  if (listView) listView.style.display = view === 'lista' ? 'block' : 'none';
  if (kanbanView) kanbanView.style.display = view === 'kanban' ? 'grid' : 'none';
  
  // Atualiza botões
  document.querySelectorAll('.carteira-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  
  if (view === 'kanban') {
    renderKanbanBoard();
  }
}

// Helper local
function formatCurrency(value) {
  return 'R$ ' + (value || 0).toFixed(2);
}
