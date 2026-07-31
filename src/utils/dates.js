// Utilitários de Data e Hora

/**
 * Obtém a data de hoje no fuso horário de Brasília
 */
export function getHojeBrasilia() {
  const hoje = new Date();
  const offset = -3 * 60; // UTC-3 para Brasília
  const utc = hoje.getTime() + (hoje.getTimezoneOffset() * 60000);
  return new Date(utc + (offset * 60000));
}

/**
 * Adiciona dias a uma data considerando o fuso de Brasília
 */
export function addDiasBrasilia(dias) {
  const hoje = getHojeBrasilia();
  hoje.setDate(hoje.getDate() + dias);
  return hoje;
}

/**
 * Adiciona dias a uma data string (formato YYYY-MM-DD)
 */
export function addDiasADataStr(dataStr, dias) {
  const data = new Date(dataStr);
  data.setDate(data.getDate() + dias);
  return data.toISOString().split('T')[0];
}

/**
 * Obtém o início da semana (segunda-feira) no fuso de Brasília
 */
export function getInicioSemanaBrasilia() {
  const hoje = getHojeBrasilia();
  const diaSemana = hoje.getDay();
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() + diffSegunda);
  segunda.setHours(0, 0, 0, 0);
  return segunda;
}

/**
 * Obtém o primeiro dia do mês atual
 */
export function getPrimeiroDiaMes() {
  const hoje = getHojeBrasilia();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
}

/**
 * Desloca uma data em meses
 */
export function deslocarDataEmMeses(data, meses) {
  const novaData = new Date(data);
  novaData.setMonth(novaData.getMonth() + meses);
  return novaData;
}

/**
 * Obtém timestamp ISO agora no fuso de Brasília
 */
export function getAgoraBrasiliaISO() {
  const agora = getHojeBrasilia();
  return agora.toISOString();
}

/**
 * Obtém a semana atual (segunda a domingo)
 */
export function obterSemanaAtual() {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() + diffSegunda);
  segunda.setHours(0, 0, 0, 0);
  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);
  return { inicio: segunda, fim: domingo };
}

/**
 * Formata tempo decorrido (ex: "Hoje", "Ontem", "há X dias")
 */
export function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return 'há ' + diff + ' dias';
}

/**
 * Obtém label de data (Hoje, Ontem ou DD/MM/YYYY)
 */
export function getDateLabel(dateStr) {
  const d = new Date(dateStr);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Verifica se comentário é novo baseado na última visita
 */
export function isCommentNew(commentDateStr, clienteId) {
  const commentTime = new Date(commentDateStr).getTime();
  const lastVisit = getUltimaVisita(clienteId);
  if (lastVisit === 0) return false;
  return commentTime > lastVisit;
}

/**
 * Define timestamp da última visita para um cliente
 */
export function setUltimaVisita(id) {
  localStorage.setItem('ultima_visita_' + id, Date.now().toString());
}

/**
 * Obtém timestamp da última visita de um cliente
 */
export function getUltimaVisita(id) {
  const ts = localStorage.getItem('ultima_visita_' + id);
  return ts ? parseInt(ts) : 0;
}
