// Componente Radar (Meu Radar)

import { db } from '../config/supabase.js';
import { kpisMensais, STATUS } from '../config/state.js';
import { showToast } from './ui.js';

/**
 * Carrega sinais do radar
 */
export async function carregarSinaisRadar() {
  try {
    const { data: alerts, error } = await db
      .from('orcamentos')
      .select(`
        id_orcamento,
        clientes(nome_cliente),
        valor_orcado,
        modelo_colchao,
        data_criacao,
        data_contato,
        status_orcamento(nome),
        usuarios(nome)
      `)
      .in('id_status', [
        // IDs dos status abertos
      ])
      .order('data_criacao', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    return alerts || [];
  } catch (err) {
    console.error('Erro ao carregar radar:', err);
    return [];
  }
}

/**
 * Renderiza sinais do radar
 */
export function renderRadarSignals(sinais) {
  const container = document.getElementById('radarSignalsContainer');
  if (!container) return;
  
  if (!sinais || sinais.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum alerta no momento</div>';
    return;
  }
  
  container.innerHTML = sinais.map(sinal => `
    <div class="radar-card" data-id="${sinal.id_orcamento}">
      <div class="radar-card-header">
        <div class="radar-client">${sinal.clientes?.nome_cliente || 'Cliente'}</div>
        <div class="radar-seller">${sinal.usuarios?.nome || ''}</div>
      </div>
      <div class="radar-card-body">
        <div class="radar-value">R$ ${(sinal.valor_orcado || 0).toFixed(2)}</div>
        <div class="radar-products">${sinal.modelo_colchao || '-'}</div>
        <div class="radar-date">${formatDateForDisplay(sinal.data_criacao)}</div>
      </div>
      <div class="radar-actions">
        <button class="btn-radar-action" onclick="window.handleRadarAction(${sinal.id_orcamento})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          Ação
        </button>
        <button class="btn-radar-check" onclick="window.handleRadarCheck(${sinal.id_orcamento})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Check
        </button>
        <button class="btn-radar-ignore" onclick="window.handleRadarIgnore(${sinal.id_orcamento})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Ignorar
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Inicializa Meu Radar
 */
export async function initMeuRadar() {
  showLoader();
  
  const sinais = await carregarSinaisRadar();
  renderRadarSignals(sinais);
  
  hideLoader();
}

/**
 * Formata data para exibição
 */
export function formatDateForDisplay(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR');
}

/**
 * Handler para ação no radar
 */
export async function handleRadarAction(idOrcamento) {
  const { navigateTo } = await import('../utils/router.js');
  const { contextoVenda } = await import('../config/state.js');
  
  // Busca dados do orçamento
  const { data: orcamento } = await db
    .from('orcamentos')
    .select('*, clientes(*)')
    .eq('id_orcamento', idOrcamento)
    .single();
  
  if (orcamento) {
    contextoVenda.clienteAtual = orcamento;
    navigateTo('detalhes_cliente');
  }
}

/**
 * Handler para check no radar
 */
export async function handleRadarCheck(idOrcamento) {
  try {
    // Marca como contato realizado ou move para próxima etapa
    const { error } = await db
      .from('orcamentos')
      .update({ 
        ligacao_confirmada: true,
        data_contato: new Date().toISOString()
      })
      .eq('id_orcamento', idOrcamento);
    
    if (error) throw error;
    
    showToast('Contato confirmado!', 'success');
    
    // Recarrega radar
    await initMeuRadar();
  } catch (err) {
    console.error('Erro ao confirmar contato:', err);
    showToast('Erro ao confirmar contato', 'error');
  }
}

/**
 * Handler para ignorar no radar
 */
export async function handleRadarIgnore(idOrcamento) {
  // Adiciona aos ignorados (localStorage)
  const ignored = getIgnoredRadarIds();
  ignored.push(idOrcamento);
  localStorage.setItem('radarIgnored', JSON.stringify(ignored));
  
  showToast('Alerta ignorado', 'info');
  
  // Recarrega radar sem o item ignorado
  await initMeuRadar();
}

/**
 * Obtém IDs ignorados do localStorage
 */
export function getIgnoredRadarIds() {
  const stored = localStorage.getItem('radarIgnored');
  return stored ? JSON.parse(stored) : [];
}

/**
 * Adiciona ID aos ignorados
 */
export function addIgnoredRadarId(idOrcamento) {
  const ignored = getIgnoredRadarIds();
  if (!ignored.includes(idOrcamento)) {
    ignored.push(idOrcamento);
    localStorage.setItem('radarIgnored', JSON.stringify(ignored));
  }
}

// Helpers locais
function showLoader() {
  document.getElementById('globalLoader').classList.add('loading');
}

function hideLoader() {
  document.getElementById('globalLoader').classList.remove('loading');
}
