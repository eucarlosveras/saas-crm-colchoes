// Componentes de UI

import { AVATAR_COLORS, KPI_ICONES } from '../config/constants.js';
import { currentUser } from '../config/state.js';

/**
 * Build de card de KPI
 */
export function buildKpiCard(titulo, valor, variacao, icone, corFundo) {
  const isPositive = variacao >= 0;
  const variacaoClass = isPositive ? 'positive' : 'negative';
  const variacaoIcon = isPositive ? '↑' : '↓';
  
  return `
    <div class="kpi-card" style="background: ${corFundo || 'white'};">
      <div class="kpi-header">
        <span class="kpi-icon">${icone}</span>
        <span class="kpi-title">${titulo}</span>
      </div>
      <div class="kpi-value">${valor}</div>
      ${variacao !== undefined ? `
        <div class="kpi-variation ${variacaoClass}">
          ${variacaoIcon} ${Math.abs(variacao)}%
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Abre modal
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  const lastFocusedElement = document.activeElement;
  modal.classList.add('open');
  
  setTimeout(() => {
    const firstInput = modal.querySelector('input, textarea, select');
    if (firstInput) firstInput.focus();
  }, 100);
  
  // Store reference for closing
  modal._lastFocused = lastFocusedElement;
}

/**
 * Fecha modal
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  modal.classList.remove('open');
  
  // Restaura foco
  if (modal._lastFocused && document.body.contains(modal._lastFocused)) {
    modal._lastFocused.focus();
  }
}

/**
 * Mostra toast notification
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '';
  if (type === 'success') {
    icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (type === 'error') {
    icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  } else {
    icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }
  
  toast.innerHTML = `${icon} <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Mostra loader global
 */
export function showLoader() {
  const loader = document.getElementById('globalLoader');
  if (loader) loader.classList.add('loading');
}

/**
 * Esconde loader global
 */
export function hideLoader() {
  const loader = document.getElementById('globalLoader');
  if (loader) loader.classList.remove('loading');
}

/**
 * Alterna tema claro/escuro
 */
export function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.toggle('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  
  // Re-renderiza gráficos se necessário
  const { renderizarGraficos } = await import('./charts.js');
  renderizarGraficos();
}

/**
 * Toggle accordion
 */
export function toggleAccordion(element) {
  const content = element.nextElementSibling;
  const isOpen = content.style.maxHeight;
  
  content.style.maxHeight = isOpen ? null : content.scrollHeight + 'px';
  element.classList.toggle('active', !isOpen);
}

/**
 * Atualiza FAB button baseado na view
 */
export function atualizarFab(view) {
  const fab = document.getElementById('fabButton');
  if (!fab) return;
  
  const isVendedor = currentUser?.perfil === 'Vendedor' || (currentUser?.perfil || '').toLowerCase() === 'terminal';
  
  if (view === 'inicio' && isVendedor) {
    fab.style.display = 'flex';
    fab.title = 'Novo orçamento';
    fab.onclick = () => window.abrirNovoOrcamento();
  } else if (view === 'estoque') {
    fab.style.display = 'flex';
    fab.title = 'Adicionar produto';
    fab.onclick = () => window.abrirModalNovoProduto();
  } else {
    fab.style.display = 'none';
  }
}

/**
 * Atualiza badge de notificacoes
 */
export function atualizarBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  
  const { notificacoesBanco } = await import('../config/state.js');
  const count = notificacoesBanco.filter(n => !n.lida).length;
  
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Atualiza indicador de digitação
 */
export function atualizarIndicadorDigitacao(element, isTyping) {
  if (!element) return;
  
  const indicator = element.querySelector('.typing-indicator');
  if (indicator) {
    indicator.style.display = isTyping ? 'block' : 'none';
  }
}

/**
 * Build de notificacoes
 */
export function buildNotifications() {
  const { notificacoesBanco, notificacoesLidas } = await import('../config/state.js');
  
  return notificacoesBanco.filter(n => !notificacoesLidas.has(String(n.id)));
}

/**
 * Renderiza badge de notificacoes
 */
export function renderNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * Renderiza dropdown de notificacoes
 */
export function renderNotificationsDropdown() {
  const dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;
  
  const notifications = buildNotifications();
  
  if (notifications.length === 0) {
    dropdown.innerHTML = '<div class="empty-state">Nenhuma notificação</div>';
    return;
  }
  
  dropdown.innerHTML = notifications.map(n => `
    <div class="notification-item" onclick="window.marcarNotificacaoBancoLida(${n.id})">
      <div class="notification-content">${escapeHtml(n.mensagem)}</div>
      <div class="notification-time">${timeAgo(n.data_criacao)}</div>
    </div>
  `).join('');
}

// Helpers locais
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return 'há ' + diff + ' dias';
}
