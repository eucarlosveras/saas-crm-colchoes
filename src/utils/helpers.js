// Utilitários Gerais (Helpers)

import { ITEMS_PER_PAGE } from '../config/constants.js';
import { todosVendedores, listaLojas, kpisMensais } from '../config/state.js';

/**
 * Gera números de paginação
 */
export function getPaginaNumeros(paginaAtual, totalPaginas) {
  const delta = 2;
  const range = [];
  const rangeWithDots = [];
  
  for (let i = Math.max(1, paginaAtual - delta); i <= Math.min(totalPaginas, paginaAtual + delta); i++) {
    range.push(i);
  }
  
  if (paginaActual - delta > 1) range.unshift('...');
  if (paginaAtual + delta < totalPaginas) range.push('...');
  range.unshift(1);
  if (totalPaginas > 1 && !range.includes(totalPaginas)) range.push(totalPaginas);
  
  // Remove duplicatas
  const unique = [...new Set(range)];
  return unique;
}

/**
 * Build de opções de loja para selects
 */
export function buildLojaOptions() {
  let options = '<option value="todas">Todas as Lojas</option>';
  listaLojas.forEach(loja => {
    options += `<option value="${loja.id_loja}">${escapeHtml(loja.nome_fantasia)}</option>`;
  });
  return options;
}

/**
 * Build de opções de vendedor para selects
 */
export function buildVendedorOptions(incluirTodos = true) {
  let options = incluirTodos ? '<option value="todos">Todos Vendedores</option>' : '';
  todosVendedores.forEach(v => {
    options += `<option value="${v.id_usuario}">${escapeHtml(v.nome)}</option>`;
  });
  return options;
}

/**
 * Build de opções de mês
 */
export function buildMonthOptions(mesAtual) {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  let options = '';
  meses.forEach((m, i) => {
    options += `<option value="${i + 1}" ${i + 1 === mesAtual ? 'selected' : ''}>${m}</option>`;
  });
  return options;
}

/**
 * Build de opções de dia (1-31)
 */
export function buildDayOptions(diaAtual) {
  let options = '<option value="">Mês Completo</option>';
  for (let d = 1; d <= 31; d++) {
    options += `<option value="${d}" ${d === diaAtual ? 'selected' : ''}>Dia ${d}</option>`;
  }
  return options;
}

/**
 * Calcula meta total baseada em vendedores ativos
 */
export function calcularMetaTotal() {
  const vendedoresAtivos = todosVendedores.filter(v => v.status === 'ativo');
  return vendedoresAtivos.length * 50000;
}

/**
 * Obtém cores gamificadas para KPIs
 */
export function getGamifiedColors(valor, meta) {
  if (!meta || meta === 0) return { bg: '#f3f4f6', text: '#6b7280' };
  const percentual = (valor / meta) * 100;
  if (percentual >= 100) return { bg: '#d1fae5', text: '#065f46' };
  if (percentual >= 70) return { bg: '#fef3c7', text: '#92400e' };
  return { bg: '#fee2e2', text: '#991b1b' };
}

/**
 * Retorna template CSS Grid para negociação baseado no status
 */
export function getNegociacoesGridTemplate(status) {
  const map = {
    'Contato Inicial': 'repeat(auto-fit, minmax(280px, 1fr))',
    'Negociação': 'repeat(auto-fit, minmax(300px, 1fr))',
    'Em Fechamento': 'repeat(auto-fit, minmax(320px, 1fr))',
    'Fechado': 'repeat(auto-fit, minmax(250px, 1fr))',
    'Perdido': 'repeat(auto-fit, minmax(250px, 1fr))'
  };
  return map[status] || 'repeat(auto-fit, minmax(280px, 1fr))';
}

// Helper para escape HTML (importar de formatters se existir)
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
