// Utilitários de Formatação

import { AVATAR_COLORS } from '../config/constants.js';

/**
 * Escapa HTML para prevenir XSS
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Formata valor para moeda brasileira (R$)
 */
export function formatCurrency(value) {
  let num = value.replace(/\D/g, '');
  num = (parseInt(num) || 0).toString();
  return 'R$ ' + parseInt(num.slice(0, -2) || '0').toLocaleString('pt-BR') + ',' + num.slice(-2).padStart(2, '0');
}

/**
 * Parse de valor monetário para número
 */
export function parseCurrency(value) {
  return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

/**
 * Obtém iniciais de um nome
 */
export function getIniciais(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Obtém cor de avatar baseada no nome
 */
export function getAvatarColor(nome) {
  if (!nome) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Formata lista de produtos com tag de quantidade adicional
 */
export function formatarProdutos(modelo_colchao) {
  if (!modelo_colchao) return '-';

  const produtos = modelo_colchao.split(',').map(p => p.trim()).filter(Boolean);
  if (produtos.length === 0) return '-';

  const primeiroProduto = escapeHtml(produtos[0]);

  if (produtos.length === 1) {
    return primeiroProduto;
  }

  const qtdExtra = produtos.length - 1;
  const tagPlural = qtdExtra > 1 ? 'itens' : 'item';

  return `${primeiroProduto} <br><span style="display:inline-block; margin-top:4px; font-size:10px; font-weight:700; color:var(--brand-blue-dark); background:#eff6ff; border: 1px solid #bfdbfe; padding:2px 8px; border-radius:12px;">+ ${qtdExtra} ${tagPlural}</span>`;
}

/**
 * Converte status para classe CSS
 */
export function classToFormatStatus(status) {
  const map = {
    'Contato Inicial': 'contato-inicial',
    'Negociação': 'negociacao-valores',
    'Em Fechamento': 'aguardando-decisao',
    'Fechado': 'fechado',
    'Perdido': 'perdido'
  };
  return map[status] || 'em-atendimento';
}

/**
 * Calcula variação percentual entre dois valores
 */
export function calcularVariacaoPercentual(atual, anterior) {
  if (!anterior || anterior === 0) return atual > 0 ? 100 : 0;
  return Math.round(((atual - anterior) / anterior) * 100);
}
