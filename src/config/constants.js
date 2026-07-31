// Configurações do Supabase
export const SUPABASE_URL = 'https://blumqkxwasdbyozdvrsp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_kvVacObZ3ERPqc9MjOIoWw_aRZeYeIn';

// URL da Edge Function para IA
export const EDGE_FUNCTION_URL = 'https://blumqkxwasdbyozdvrsp.supabase.co/functions/v1/gemini-proxy';

// Constantes de negócio
export const META_PADRAO = 50000;
export const ITEMS_PER_PAGE = 10;

export const STATUS = {
  CONTATO_INICIAL: 'Contato Inicial',
  NEGOCIACAO: 'Negociação',
  EM_FECHAMENTO: 'Em Fechamento',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido'
};

export const PROBABILIDADE_POR_ETAPA = {
  'Contato Inicial': 10,
  'Negociação': 40,
  'Em Fechamento': 75,
  'Fechado': 100,
  'Perdido': 0
};

export const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'
];

export const KPI_ICONES = {
  'orcamentos': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  'taxa_conversao': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  'ticket_medio': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  'valor_total': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'
};
