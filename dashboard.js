import { AppState } from './state.js';
import { escapeHtml } from './utils.js';

export function createDashboardModule({
  db,
  getCurrentUser,
  getCurrentMonth,
  getCurrentYear,
  getCurrentDay,
  getSelectedVendedor,
  getSelectedLoja,
  getCurrentFilter,
  getSearchTerm,
  getSearchProtocolo,
  getTodosVendedores,
  getTodosProdutos,
  getHistoricoFaturamento,
  setCurrentView,
  setCurrentMonth,
  setCurrentYear,
  setCurrentDay,
  setCurrentPage,
  setCurrentFilter,
  setSearchTerm,
  setSearchProtocolo,
  renderNotificationBadge,
  buildNotifications,
  toggleNotifications,
  renderizarDropdownNotificacoes,
  marcarNotificacaoLida,
  marcarNotificacaoBancoLida,
  abrirDetalhesCliente,
  renderAdminInicio,
  atualizarTabelaPaginadaServer,
  navigateTo,
  calcularMetaTotal,
  getGamifiedColors,
  renderFiltrosData,
  renderKanbanBoard,
  renderClientesLista,
  renderFichaCliente,
  renderDetalhesClientePage,
  renderNovoOrcamentoPage,
  renderAdminUsuarios,
  renderAgendaDia,
  changeDay,
  changeMonth,
  selectFilter,
  handleSearch,
  handleSearchProtocolo,
  clearSearch,
  renderInicio,
  renderCarteiraPage,
  renderAdminInicioPage,
  renderDashboardContent,
  renderWidget,
  showLoader,
  hideLoader,
  showToast,
  openModal,
  closeModal,
  setAppStateValue,
  getStateValue,
  runAfterRender,
  getStatusByName
}) {
  function renderDashboardHeader(isGerente, labelPeriodo) {
    return `
    <header class="dashboard-header">
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <h1 style="margin: 0;">${isGerente ? 'Dashboard Vendas' : 'Dashboard do Vendedor'}</h1>
            <span style="font-size: 13px; color: var(--text-muted); font-weight: 500; text-transform: capitalize;">${labelPeriodo}</span>
        </div>
        <div class="header-controls">
            ${renderFiltrosData(isGerente)}
            <div class="header-notification-area">
                <button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações">
                    <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    <span class="notification-badge" id="notificationBadgeCount"></span>
                </button>
            </div>
        </div>
    </header>`;
  }

  async function renderInicioDashboard() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    const isGerente = getCurrentUser()?.perfil === 'Gerente' || getCurrentUser()?.perfil === 'Administrador' || getCurrentUser()?.perfil === 'Admin';
    const dados = AppState.kpisMensais.filter(o => {
      if (!o.data_criacao) return false;
      const dataOrc = o.data_criacao.split('T')[0];
      const [ano, mes, dia] = dataOrc.split('-');
      const isMesAnoCorreto = (parseInt(mes) === parseInt(getCurrentMonth())) && (parseInt(ano) === parseInt(getCurrentYear()));
      if (getCurrentDay()) {
        return isMesAnoCorreto && (parseInt(dia) === parseInt(getCurrentDay()));
      }
      return isMesAnoCorreto;
    });

    const resumo = AppState.kpisMensaisResumo || {};
    const total = resumo.total_oportunidades || 0;
    const fechados = resumo.vendas_fechadas_qtd || 0;
    const negociacao = resumo.em_tratativa || 0;
    const valorVendido = resumo.vendas_fechadas_valor || 0;
    const fechadosArr = dados.filter(o => o.status === 'Fechado' || o.status === 'Vendido');
    const conversao = total ? Math.round((fechados / total) * 100) : 0;
    const metaAtual = calcularMetaTotal();
    const percMetaExato = metaAtual ? Math.round((valorVendido / metaAtual) * 100) : 0;
    const gamified = getGamifiedColors(percMetaExato);
    const nomeMesSelecionado = new Date(getCurrentYear(), getCurrentMonth() - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const labelPeriodo = getCurrentDay() ? `Resultados de ${getCurrentDay()} de ${nomeMesSelecionado}` : `Resultados de ${nomeMesSelecionado}`;
    const headerHtml = renderDashboardHeader(isGerente, labelPeriodo);
    const progressHtml = `<div class="gamified-progress-card"><div class="progress-icon" style="background:${gamified.iconBg}; box-shadow:${gamified.shadow};">${gamified.iconSvg}</div><div class="progress-info"><h3>Atingimento de Meta</h3><p class="progress-subtitle">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ ${metaAtual.toLocaleString('pt-BR')}</p></div><div class="progress-bar-outer"><div class="progress-bar-inner-gamified" style="width:${Math.min(100, percMetaExato)}%; background:${gamified.bg}; box-shadow:${gamified.shadow};"><span class="progress-percent">${percMetaExato > 100 ? '100+' : percMetaExato}%</span></div></div><div class="progress-motive-text" style="color:${gamified.motiveColor};">${gamified.motive}</div></div>`;
    const kpiHtml = `<div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Oportunidades Geradas</span></div><div class="kpi-value">${total}</div></div><div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Em Tratativa</span></div><div class="kpi-value">${negociacao}</div></div><div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Taxa de Conversão</span></div><div class="kpi-value">${conversao}%</div></div><div class="kpi-card vendido-highlight"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Vendas Fechadas</span></div><div class="kpi-value">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>`;
    const donutHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Aproveitamento</h3><div class="donut-wrapper"><canvas id="donutCanvas" width="200" height="200"></canvas></div><div class="donut-legend"><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color orcados"></span> Orçados <strong>${total}</strong></div><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color fechados"></span> Fechados <strong>${fechados}</strong></div></div></div>`;

    let barChartHtml = '';
    if (getHistoricoFaturamento().length > 0) {
      barChartHtml = `<div class="chart-card" style="display:flex; flex-direction:column;"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Evolução Mensal</h3><div class="bar-chart-wrapper"><canvas id="barChartCanvas"></canvas></div></div>`;
    }

    let rankingHtml = '';
    if (isGerente) {
      let vendedoresRanking = getTodosVendedores();
      if (getCurrentUser()?.perfil === 'Gerente') {
        vendedoresRanking = getTodosVendedores().filter(v => v.id_loja === getCurrentUser().id_loja);
      } else if (getSelectedLoja() !== 'todas') {
        vendedoresRanking = getTodosVendedores().filter(v => v.id_loja === getSelectedLoja());
      }
      if (vendedoresRanking.length > 0) {
        const ranking = vendedoresRanking.map(v => {
          const vendido = dados.filter(o => o.id_usuario === v.id_usuario && (o.status === 'Fechado' || o.status === 'Vendido')).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
          const meta = parseFloat(v.meta_mensal || 0);
          const pct = meta > 0 ? Math.min((vendido / meta) * 100, 100) : 0;
          return { nome: v.nome, vendido, meta, pct };
        }).sort((a, b) => b.vendido - a.vendido);
        const barColor = pct => {
          if (pct >= 100) return 'linear-gradient(90deg, var(--accent-green-dark), var(--chart-green))';
          if (pct >= 70) return 'linear-gradient(90deg, #2563eb, var(--brand-blue))';
          if (pct >= 40) return 'linear-gradient(90deg, var(--accent-orange), #fbbf24)';
          return 'linear-gradient(90deg, var(--chart-red), #f87171)';
        };
        const posClass = i => i === 0 ? 'pos-1' : i === 1 ? 'pos-2' : i === 2 ? 'pos-3' : '';
        const posLabel = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> Top Vendedores</h3><ul class="ranking-list">${ranking.map((r, i) => `
            <li class="ranking-item">
                <div class="ranking-item-top">
                    <span class="ranking-pos ${posClass(i)}">${posLabel(i)}</span>
                    <span class="ranking-nome">${escapeHtml(r.nome)}</span>
                    <span class="ranking-valor">R$ ${r.vendido.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                    <span class="ranking-pct-label">${r.meta > 0 ? Math.round(r.pct) + '%' : '–'}</span>
                </div>
                <div class="ranking-bar-outer">
                    <div class="ranking-bar-inner" style="width:${r.pct}%; background:${barColor(r.pct)};"></div>
                </div>
            </li>`).join('')}</ul></div>`;
      } else {
        rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Top Vendedores</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Nenhum vendedor encontrado para esta loja.</div></div>`;
      }
    }

    const top5 = {};
    fechadosArr.forEach(o => {
      const modelosStr = (o.modelo_colchao || '').trim();
      if (!modelosStr || modelosStr === 'Sem modelo') return;
      const listaProdutos = modelosStr.split(',').map(p => p.trim()).filter(Boolean);
      listaProdutos.forEach(m => {
        if (!top5[m]) top5[m] = { nome: m, count: 0 };
        top5[m].count++;
      });
    });

    const top5Ordenado = Object.values(top5).sort((a, b) => b.count - a.count).slice(0, 5);
    const top5Html = top5Ordenado.map((p, i) => {
      const nomeLimpo = p.nome.replace(/^[a-zA-Z0-9]+\s*-\s*/, '').toLowerCase();
      return `<li><span class="top5-rank">${i + 1}</span><span style="flex:1; font-size: 13px; font-weight: 500; text-transform: capitalize; padding-right: 8px; line-height: 1.4;" title="${escapeHtml(p.nome)}">${escapeHtml(nomeLimpo)}</span><span class="top5-count-badge">${p.count} unid.</span></li>`;
    }).join('') || '<li style="justify-content:center; color:var(--text-muted);">Nenhuma venda fechada</li>';

    const colVendedor = isGerente ? '<th>Vendedor</th>' : '';
    const searchTagHtml = getSearchTerm() ? `<span class="search-tag">🔍 "${escapeHtml(getSearchTerm())}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';
    const tabelaHtml = `<div class="table-card"><div class="table-card-header"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg> Carteira de Negociações</h3><div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;"><div id="searchTagContainer">${searchTagHtml}</div><input type="text" class="search-input" placeholder="Buscar cliente..." id="searchInput" onchange="handleSearch()" onkeyup="if(event.key === 'Enter') handleSearch()" value="${escapeHtml(getSearchTerm())}" aria-label="Buscar cliente"><input type="text" class="search-input" placeholder="Buscar protocolo..." id="searchProtocoloInput" onchange="handleSearchProtocolo()" onkeyup="if(event.key === 'Enter') handleSearchProtocolo()" value="${escapeHtml(getSearchProtocolo())}" aria-label="Buscar por protocolo" style="width:160px;"><select class="form-input" style="width:auto; padding:8px 16px; border-radius:20px; font-size:var(--font-sm);" id="listFilterSelect" onchange="selectFilter(this.value)" aria-label="Filtrar por status"><option value="todos" ${getCurrentFilter() === 'todos' ? 'selected' : ''}>Todos</option><option value="Contato Inicial" ${getCurrentFilter() === 'Contato Inicial' ? 'selected' : ''}>Contato Inicial</option><option value="Negociação" ${getCurrentFilter() === 'Negociação' ? 'selected' : ''}>Negociação</option><option value="Em Fechamento" ${getCurrentFilter() === 'Em Fechamento' ? 'selected' : ''}>Em Fechamento</option><option value="Fechado" ${getCurrentFilter() === 'Fechado' ? 'selected' : ''}>Fechado</option><option value="Perdido" ${getCurrentFilter() === 'Perdido' ? 'selected' : ''}>Perdido</option></select></div></div><div id="tabelaCarteiraWrapper"><table><thead><tr><th style="width:90px;">Protocolo</th><th>Cliente</th><th>Produto</th>${colVendedor}<th>Status</th><th>Data</th><th>Valor</th></tr></thead><tbody id="tableBody"></tbody></table><div class="pagination" id="paginationContainer"></div></div></div>`;

    let chartsRowHtml = '';
    if (isGerente) {
      chartsRowHtml = `<section class="charts-row">${donutHtml}${rankingHtml}<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Mais Vendidos</h3><ul class="top5-list">${top5Html}</ul></div></section>`;
    } else {
      const barrasOuVazio = barChartHtml || `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Evolução Mensal</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Dados insuficientes para o gráfico.</div></div>`;
      chartsRowHtml = `<section class="charts-row-triplo">${donutHtml}${barrasOuVazio}<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Mais Vendidos</h3><ul class="top5-list">${top5Html}</ul></div></section>`;
    }

    main.innerHTML = `${headerHtml}${progressHtml}<section class="kpi-row">${kpiHtml}</section>${chartsRowHtml}${tabelaHtml}`;
    requestAnimationFrame(() => {
      if (typeof window !== 'undefined' && window.renderizarGraficos) {
        window.renderizarGraficos(total, fechados);
      }
    });
    atualizarTabelaPaginadaServer();
    renderNotificationBadge(buildNotifications().length);
  }

  return {
    renderInicioDashboard
  };
}
