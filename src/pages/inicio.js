// Página Início (Dashboard)

import { 
  currentMonth, 
  currentYear, 
  currentDay, 
  selectedVendedor, 
  kpisMensais,
  AppState 
} from '../config/state.js';
import { STATUS } from '../config/constants.js';
import { navigateTo } from '../utils/router.js';
import { buildKpiCard } from '../components/ui.js';
import { tentarRenderizarGraficos } from '../components/charts.js';

/**
 * Renderiza página inicial
 */
export function renderInicio() {
  const container = document.getElementById('pageContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="dashboard-header">
      <h1 id="textNavInicio">Dashboard Vendas</h1>
      <div class="dashboard-filters">
        <select id="monthFilter" onchange="window.changeMonth(this.value)">
          ${buildMonthOptions(currentMonth)}
        </select>
        <select id="dayFilter" onchange="window.changeDay(this.value)">
          ${buildDayOptions(currentDay)}
        </select>
        <select id="vendedorFilter" onchange="window.filtrarPorVendedor(this.value)">
          <option value="todos">Todos Vendedores</option>
        </select>
      </div>
    </div>
    
    <div class="kpi-grid" id="kpiGrid">
      <!-- KPIs serão inseridos aqui -->
    </div>
    
    <div class="charts-container">
      <div class="chart-card">
        <h3>Distribuição por Status</h3>
        <canvas id="donutChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>Performance por Vendedor</h3>
        <canvas id="barChart"></canvas>
      </div>
    </div>
    
    <div class="table-container">
      <h3>Últimos Orçamentos</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <!-- Dados serão inseridos aqui -->
        </tbody>
      </table>
      <div id="paginationContainer"></div>
    </div>
  `;
  
  // Carrega vendedores no filtro
  carregarVendedoresNoFiltro();
  
  // Atualiza KPIs e tabela
  atualizarKpisEDashboard();
}

/**
 * Seleciona período para KPI vendedor
 */
export async function selecionarPeriodoKpiVendedor(periodo) {
  const { setFiltroMes } = await import('../config/state.js');
  
  if (periodo === 'mes') {
    const mes = new Date().getMonth() + 1;
    const ano = new Date().getFullYear();
    setFiltroMes(mes, ano);
  }
  
  await atualizarKpisEDashboard();
}

/**
 * Atualiza tabela paginada do servidor
 */
export async function atualizarTabelaPaginadaServer() {
  const tbody = document.getElementById('tableBody');
  const pagination = document.getElementById('paginationContainer');
  
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px;">Carregando...</td></tr>';
  
  try {
    const { db } = await import('../config/supabase.js');
    const { currentUser } = await import('../config/state.js');
    
    let query = db.from('orcamentos')
      .select('*, clientes(nome_cliente), usuarios(nome), status_orcamento(nome)', { count: 'exact' });
    
    // Filtros baseados no perfil
    if (currentUser.perfil === 'Vendedor') {
      query = query.eq('id_usuario', currentUser.id_usuario);
    } else if (currentUser.perfil === 'Gerente') {
      query = query.eq('usuarios.id_loja', currentUser.id_loja);
    }
    
    // Filtro de mês/dia
    if (currentDay) {
      const start = new Date(currentYear, currentMonth - 1, currentDay).toISOString();
      const end = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59).toISOString();
      query = query.gte('data_criacao', start).lte('data_criacao', end);
    } else {
      const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString();
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();
      query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
    }
    
    const { data, error } = await query.order('data_criacao', { ascending: false }).limit(10);
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px;">Nenhum orçamento encontrado</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(o => `
      <tr onclick="abrirDetalhesCliente(${o.id_orcamento})" style="cursor:pointer;">
        <td>${o.clientes?.nome_cliente || '-'}</td>
        <td>${o.usuarios?.nome || '-'}</td>
        <td>R$ ${(o.valor_orcado || 0).toFixed(2)}</td>
        <td><span class="status-badge ${classToFormatStatus(o.status_orcamento?.nome)}">${o.status_orcamento?.nome || '-'}</span></td>
        <td>${new Date(o.data_criacao).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('');
    
  } catch (err) {
    console.error('Erro ao carregar tabela:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:red;">Erro ao carregar dados</td></tr>';
  }
}

/**
 * Atualiza mudança de dia
 */
export async function changeDay(val) {
  const { currentDay, currentView } = await import('../config/state.js');
  
  currentDay = val ? parseInt(val) : null;
  
  if (currentView === 'agenda_dia') {
    const { renderAgendaDia } = await import('../pages/agenda.js');
    await renderAgendaDia();
  } else {
    await atualizarKpisEDashboard();
  }
}

/**
 * Atualiza mudança de mês
 */
export async function changeMonth(val) {
  const { currentMonth, currentYear, setFiltroMes } = await import('../config/state.js');
  
  const mes = parseInt(val);
  setFiltroMes(mes, currentYear);
  
  await atualizarKpisEDashboard();
}

/**
 * Filtra por loja
 */
export async function filtrarPorLoja(val) {
  const { selectedLoja } = await import('../config/state.js');
  
  selectedLoja = val;
  await atualizarKpisEDashboard();
}

/**
 * Filtra por vendedor
 */
export async function filtrarPorVendedor(val) {
  const { selectedVendedor } = await import('../config/state.js');
  
  selectedVendedor = val;
  await atualizarKpisEDashboard();
}

/**
 * Atualiza KPIs e dashboard
 */
async function atualizarKpisEDashboard() {
  const { carregarKpisEDashboard } = await import('../api/usuarios.js');
  await carregarKpisEDashboard();
  
  // Renderiza KPIs
  renderizarKpis();
  
  // Renderiza gráficos
  tentarRenderizarGraficos();
  
  // Atualiza tabela
  atualizarTabelaPaginadaServer();
}

/**
 * Renderiza cards de KPI
 */
function renderizarKpis() {
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;
  
  const { AppState } = arguments.length > 0 ? arguments[0] : { AppState: { kpisMensaisResumo: {} } };
  
  const resumo = AppState.kpisMensaisResumo || {};
  
  grid.innerHTML = `
    ${buildKpiCard('Orçamentos', resumo.total_orcamentos || 0, resumo.variacao_orcamentos || 0, KPI_ICONES.orcamentos)}
    ${buildKpiCard('Taxa de Conversão', (resumo.taxa_conversao || 0) + '%', resumo.variacao_taxa || 0, KPI_ICONES.taxa_conversao)}
    ${buildKpiCard('Ticket Médio', formatCurrency(resumo.ticket_medio || 0), resumo.variacao_ticket || 0, KPI_ICONES.ticket_medio)}
    ${buildKpiCard('Valor Total', formatCurrency(resumo.valor_total || 0), resumo.variacao_valor || 0, KPI_ICONES.valor_total)}
  `;
}

/**
 * Carrega vendedores no filtro
 */
async function carregarVendedoresNoFiltro() {
  const select = document.getElementById('vendedorFilter');
  if (!select) return;
  
  const { todosVendedores } = await import('../config/state.js');
  
  select.innerHTML = '<option value="todos">Todos Vendedores</option>' +
    todosVendedores.map(v => `<option value="${v.id_usuario}">${v.nome}</option>`).join('');
}

// Helpers locais
function buildMonthOptions(mesAtual) {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return meses.map((m, i) => `<option value="${i + 1}" ${i + 1 === mesAtual ? 'selected' : ''}>${m}</option>`).join('');
}

function buildDayOptions(diaAtual) {
  let options = '<option value="">Mês Completo</option>';
  for (let d = 1; d <= 31; d++) {
    options += `<option value="${d}" ${d === diaAtual ? 'selected' : ''}>Dia ${d}</option>`;
  }
  return options;
}

function formatCurrency(value) {
  return 'R$ ' + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function classToFormatStatus(status) {
  const map = {
    'Contato Inicial': 'contato-inicial',
    'Negociação': 'negociacao-valores',
    'Em Fechamento': 'aguardando-decisao',
    'Fechado': 'fechado',
    'Perdido': 'perdido'
  };
  return map[status] || 'em-atendimento';
}

function abrirDetalhesCliente(id) {
  const { contextoVenda } = arguments.length > 0 ? arguments[0] : { contextoVenda: {} };
  const { navigateTo } = arguments.length > 1 ? arguments[1] : { navigateTo: () => {} };
  
  // Implementação será feita via window handler
  window._clienteParaDetalhes = id;
  // Navegação será tratada pelo handler global
}
