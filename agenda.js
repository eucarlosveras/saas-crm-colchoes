import { AppState, STATUS } from './state.js';
import { escapeHtml } from './utils.js';

export function createAgendaModule({
  db,
  getCurrentUser,
  getCurrentMonth,
  getCurrentYear,
  getCurrentDay,
  getSelectedVendedor,
  getSelectedLoja,
  buildVendedorOptions,
  buildMonthOptions,
  buildDayOptions,
  abrirDetalhesCliente,
  showLoader,
  hideLoader,
  showToast,
  renderNotificationBadge,
  buildNotifications,
  toggleNotifications,
  navigateTo,
  changeMonth,
  changeDay,
  filtrarPorVendedor
}) {
  function obterSemanaAtual() {
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

  async function renderAgendaDia() {
    const currentUser = getCurrentUser();
    const currentMonth = getCurrentMonth();
    const currentYear = getCurrentYear();
    const currentDay = getCurrentDay();
    const selectedVendedor = getSelectedVendedor();
    const selectedLoja = getSelectedLoja();

    showLoader();
    const { inicio, fim } = obterSemanaAtual();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioStr = inicio.toISOString().split('T')[0];

    if (typeof window._agendaFiltro === 'undefined') window._agendaFiltro = 'pendentes';

    let agendados = [];
    let realizados = [];

    try {
      let query = db.from('orcamentos')
        .select('id_orcamento, valor_orcado, id_usuario, data_contato, hora_contato, observacao_agendamento, modelo_colchao, ligacao_confirmada, clientes(nome_cliente, whatsapp), status_orcamento(nome), usuarios(nome, id_loja)')
        .not('data_contato', 'is', null)
        .not('id_status', 'is', null);

      if (currentUser?.perfil === 'Vendedor') {
        query = query.eq('id_usuario', currentUser.id_usuario);
      } else if (currentUser?.perfil === 'Gerente' || (currentUser?.perfil || '').toLowerCase() === 'terminal') {
        query = query.eq('usuarios.id_loja', currentUser.id_loja);
        if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);
      } else {
        if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);
      }

      const { data: rawData, error } = await query;
      if (error) throw error;

      const todos = (rawData || []).map(o => ({
        ...o,
        status: o.status_orcamento ? o.status_orcamento.nome : STATUS.CONTATO_INICIAL
      }));

      const ordenarCronologicamente = (a, b) => {
        if (a.data_contato !== b.data_contato) return a.data_contato.localeCompare(b.data_contato);
        return (a.hora_contato || '').localeCompare(b.hora_contato || '');
      };

      agendados = todos.filter(o => {
        if ([STATUS.PERDIDO, STATUS.DECLINADO].includes(o.status)) return false;
        if (o.ligacao_confirmada) return false;
        const dataContato = new Date(o.data_contato + 'T00:00:00');
        const naSemana = dataContato >= inicio && dataContato <= fim;
        const atrasado = dataContato < hoje;
        return naSemana || atrasado;
      }).sort(ordenarCronologicamente);

      realizados = todos.filter(o => {
        if ([STATUS.PERDIDO, STATUS.DECLINADO].includes(o.status)) return false;
        if (!o.ligacao_confirmada) return false;
        const dataContato = new Date(o.data_contato + 'T00:00:00');
        const naSemana = dataContato >= inicio && dataContato <= fim;
        const atrasado = dataContato < hoje;
        return naSemana || atrasado;
      }).sort(ordenarCronologicamente);
    } catch (err) {
      showToast('Erro ao carregar a agenda: ' + err.message, 'error');
      hideLoader();
      return;
    }

    hideLoader();

    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

    const buildToggle = () => `
      <div class="agenda-toggle" id="agendaToggle">
        <button class="${window._agendaFiltro === 'pendentes' ? 'active' : ''}" onclick="setAgendaFiltro('pendentes')">Pendentes <span class="toggle-count">${agendados.length}</span></button>
        <button class="${window._agendaFiltro === 'realizados' ? 'active' : ''}" onclick="setAgendaFiltro('realizados')">Realizados <span class="toggle-count">${realizados.length}</span></button>
      </div>`;

    let html = `<header class="dashboard-header"><h1>Agenda e Próximos Passos</h1><div class="header-controls">${isGerente ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><select class="vendedor-select" id="vendedorSelectAgenda" onchange="filtrarPorVendedor(this.value)">${buildVendedorOptions()}</select></div>` : ''}<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></span><select class="month-select" onchange="changeMonth(this.value)">${buildMonthOptions()}</select></div><div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></span><select class="day-select" onchange="changeDay(this.value)">${buildDayOptions()}</select></div><div class="header-notification-area"><button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="notification-badge" id="notificationBadgeCount"></span></button></div></div></header>`;
    html += buildToggle();

    const listaAtiva = window._agendaFiltro === 'realizados' ? realizados : agendados;
    const msgVazia = window._agendaFiltro === 'realizados' ? '📭 Nenhum contato realizado neste período.' : '✨ Nenhum contato pendente para esta semana.';

    if (listaAtiva.length === 0) {
      html += `<div class="chart-card" style="text-align:center; padding:48px; color:var(--text-muted);">${msgVazia}</div>`;
    } else {
      html += `<div class="table-card"><table id="agendaTable"><thead><tr><th style="min-width:120px;">Data / Hora</th><th>Cliente</th><th>WhatsApp</th><th>Motivo do Contato</th>${isGerente ? '<th>Vendedor</th>' : ''}<th style="text-align:center;">Contato</th></tr></thead><tbody>`;
      listaAtiva.forEach(o => {
        const nome = escapeHtml(o.clientes?.nome_cliente || 'Cliente');
        const agendRaw = o.observacao_agendamento || '';
        const linhas = agendRaw.split('\n');
        const tipo = escapeHtml(linhas[0] || '-');
        const obsExtra = linhas.length > 1 ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px; font-weight:400;">${escapeHtml(linhas.slice(1).join(' '))}</div>` : '';
        const dataObj = new Date(o.data_contato + 'T00:00:00');
        const dataExibicao = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const horaExibicao = o.hora_contato || '--:--';
        const agendamentoCompleto = `${dataExibicao} às ${horaExibicao}`;
        const isRealizado = window._agendaFiltro === 'realizados';
        html += `<tr class="clickable-row" data-id="${o.id_orcamento}" ${isRealizado ? 'style="opacity:0.65;"' : ''}><td style="font-weight:500; white-space:nowrap; min-width:120px;">${agendamentoCompleto}</td><td><span class="client-name">${nome}</span></td><td>${escapeHtml(o.clientes?.whatsapp || '-')}</td><td style="font-size:var(--font-xs); color:var(--text-secondary); font-weight:600;">${tipo}${obsExtra}</td>${isGerente ? `<td>${escapeHtml(o.usuarios?.nome || '-')}</td>` : ''}<td style="text-align:center; vertical-align:middle;">${isRealizado ? `<span style="color:var(--brand-blue); font-size:18px;" title="Contato realizado">✓</span>` : `<button class="btn-confirm-contact" data-id="${o.id_orcamento}" title="Confirmar contato realizado" onclick="event.stopPropagation()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg></button>`}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    document.getElementById('mainContent').innerHTML = html;
    document.querySelectorAll('.table-card tbody tr.clickable-row').forEach(row => {
      row.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        if (id) abrirDetalhesCliente(id);
      });
    });
    document.querySelectorAll('.btn-confirm-contact').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await confirmarContato(btn.getAttribute('data-id'), btn);
      });
    });
    renderNotificationBadge(buildNotifications().length);
  }

  async function setAgendaFiltro(valor) {
    window._agendaFiltro = valor;
    await renderAgendaDia();
  }

  async function confirmarContato(orcamentoId, btnElement) {
    if (btnElement.classList.contains('loading')) return;
    btnElement.classList.add('loading');
    try {
      const { error } = await db.from('orcamentos').update({ ligacao_confirmada: true }).eq('id_orcamento', orcamentoId);
      if (error) throw error;

      const idx = AppState.kpisMensais.findIndex(o => o.id_orcamento === orcamentoId);
      if (idx !== -1) AppState.kpisMensais[idx].ligacao_confirmada = true;

      await db.from('comentarios').insert([{
        id_orcamento: orcamentoId,
        texto: '✅ Contato confirmado como realizado via agenda.',
        tipo: 'Sistema',
        autor: currentUser?.nome || 'Sistema'
      }]);

      const row = btnElement.closest('tr');
      if (row) {
        row.style.transition = 'opacity 0.2s ease, transform 0.15s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(8px)';
        setTimeout(() => {
          const tbody = row.parentNode;
          row.remove();
          if (tbody && tbody.children.length === 0) {
            const isGerente = currentUser?.perfil === 'Gerente' || currentUser?.perfil === 'Administrador' || currentUser?.perfil === 'Admin';
            const colspanCount = 5 + (isGerente ? 1 : 0);
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="${colspanCount}" style="text-align:center; padding:48px; color:var(--text-muted);">✨ Nenhum contato pendente para esta semana.</td>`;
            tbody.appendChild(emptyRow);
          }
        }, 200);
      }

      showToast('Contato confirmado!', 'success');
    } catch (err) {
      showToast('Erro ao confirmar contato: ' + err.message, 'error');
      btnElement.classList.remove('loading');
    }
  }

  return {
    renderAgendaDia,
    setAgendaFiltro,
    confirmarContato
  };
}
