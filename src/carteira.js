// ═══════════════════════════════════════════════════════════════
// Módulo: carteira.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { ITEMS_PER_PAGE, STATUS } from './constants.js';
import { renderFiltrosData } from './filtros.js';
import { calcularMetaTotal } from './metas.js';
import { buildNotifications, renderNotificationBadge, toggleNotifications } from './notificacoes.js';
import { abrirDetalhesCliente, abrirMotivoPerda } from './orcamentos.js';
import { getLojasPermitidas, store } from './state.js';
import { db } from './supabaseClient.js';
import { showToast } from './ui.js';
import { classToFormatStatus, escapeHtml, getAgoraBrasiliaISO, getAvatarColor, getIniciais, removerCodigoProduto, sanitizeCsvField, timeAgo } from './utils.js';

        async function atualizarTabelaPaginadaServer() {
            const tbody = document.getElementById('tableBody');
            const pagination = document.getElementById('paginationContainer');
            if (!tbody || !pagination) return;
            
            const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
            const gridTemplate = getNegociacoesGridTemplate(isGerente);
            tbody.innerHTML = `<div class="negociacoes-empty">Carregando dados...</div>`;

            try {
                let query = db.from('orcamentos')
                    .select('*, clientes!inner(nome_cliente, whatsapp), usuarios!inner(nome, id_loja), status_orcamento(nome)', { count: 'exact' });
            
                // Regra de Ferro: Se for Gerente, obriga a(s) loja(s) permitida(s) E o vendedor a existir
                if (store.currentUser.perfil === 'Gerente') {
                    const lojasPermitidasTab = getLojasPermitidas();
                    // Nunca pula o filtro: se não há lojas permitidas, força zero resultados (falha fechada).
                    query = query.in('usuarios.id_loja', (lojasPermitidasTab && lojasPermitidasTab.length > 0) ? lojasPermitidasTab : ['00000000-0000-0000-0000-000000000000']);
                    if (store.selectedVendedor !== 'todos') query = query.eq('id_usuario', store.selectedVendedor);
                } else if (store.currentUser.perfil === 'Vendedor') {
                    query = query.eq('id_usuario', store.currentUser.id_usuario);
                } else {
                    if (store.selectedVendedor !== 'todos') {
                        query = query.eq('id_usuario', store.selectedVendedor);
                    } else if (store.selectedLoja !== 'todas') {
                        const idsLoja = store.todosVendedores.filter(v => v.id_loja === store.selectedLoja).map(v => v.id_usuario);
                        if (idsLoja.length > 0) query = query.in('id_usuario', idsLoja);
                    }
                }

                if (store.searchTerm) query = query.ilike('clientes.nome_cliente', `%${store.searchTerm}%`);
                if (store.searchProtocolo) query = query.ilike('protocolo', `%${store.searchProtocolo}%`);

                if (store.currentFilter !== 'todos') {
                    let searchNomes = [store.currentFilter];
                    if (store.currentFilter === STATUS.VENDIDO) searchNomes = [STATUS.FECHADO, STATUS.VENDIDO];
                    else if (store.currentFilter === STATUS.PERDIDO) searchNomes = [STATUS.DECLINADO, STATUS.PERDIDO];
                    else if (['Contato Inicial', 'Negociação de Valores', 'Aguardando Decisão'].includes(store.currentFilter)) {
                        searchNomes = [store.currentFilter, STATUS.EM_NEGOCIACAO];
                    }
                    const uuidsPermitidos = store.mapStatusUUID.filter(s => searchNomes.includes(s.nome)).map(s => s.id_status);
                    if(uuidsPermitidos.length > 0) query = query.in('id_status', uuidsPermitidos);
                }

                /* 
                 // FILTRO DE MÊS E DIA ATIVADO PARA A CARTEIRA DE NEGOCIAÇÕES
	if (store.currentDay) {
   	 const start = new Date(store.currentYear, store.currentMonth - 1, store.currentDay).toISOString();
    	const end = new Date(store.currentYear, store.currentMonth - 1, store.currentDay, 23, 59, 59).toISOString();
    	query = query.gte('data_criacao', start).lte('data_criacao', end);
	} else if (store.currentMonth && store.currentYear) {
   	  const startDate = new Date(store.currentYear, store.currentMonth - 1, 1).toISOString();
  	  const endDate = new Date(store.currentYear, store.currentMonth, 0, 23, 59, 59).toISOString();
  	  query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
	}

                */

                const from = (store.currentPage - 1) * ITEMS_PER_PAGE;
                const to = from + ITEMS_PER_PAGE - 1;
                query = query.range(from, to).order('data_criacao', { ascending: false });

                const { data: pagina, error, count } = await query;
                if (error) throw error;

                const totalPages = Math.ceil(count / ITEMS_PER_PAGE) || 1;
                if (store.currentPage > totalPages && totalPages > 0) { store.currentPage = totalPages; return atualizarTabelaPaginadaServer(); }

                tbody.innerHTML = '';
                if (!pagina || pagina.length === 0) {
                    tbody.innerHTML = `<div class="negociacoes-empty">Nenhum registro encontrado.</div>`;
                } else {
                    const frag = document.createDocumentFragment();
                    pagina.forEach(o => {
                        const nome = o.clientes?.nome_cliente || 'Cliente';
                        const dataRelativa = timeAgo(o.data_criacao);
                        const dataCompleta = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : '-';
                        const statusTexto = o.status_orcamento ? o.status_orcamento.nome : STATUS.CONTATO_INICIAL;
                        const idNumerico = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || '');
                        const produtos = o.modelo_colchao ? o.modelo_colchao.split(',').map(p => p.trim()).filter(Boolean) : [];
                        // Exibição sem o código do produto (ex: "5014077 - Colchão X" -> "Colchão X").
                        // O código só aparece dentro do orçamento após a seleção do item, não nesta lista.
                        const nomeProdutoSemCodigo = removerCodigoProduto;
                        const qtdExtra = produtos.length - 1;
                        const vendedorNome = o.usuarios?.nome || '-';

                        let valorClass = 'v-neutro';
                        if ([STATUS.FECHADO, STATUS.VENDIDO].includes(statusTexto)) valorClass = 'v-fechado';
                        else if ([STATUS.PERDIDO, STATUS.DECLINADO].includes(statusTexto)) valorClass = 'v-perdido';

                        const row = document.createElement('div');
                        row.className = 'negociacao-row';
                        row.style.gridTemplateColumns = gridTemplate;
                        row.dataset.id = o.id_orcamento;
                        row.addEventListener('click', () => abrirDetalhesCliente(o.id_orcamento));

                        row.innerHTML = `
                            <div class="negociacao-avatar" style="background:${getAvatarColor(nome)};">${getIniciais(nome)}</div>
                            <div class="cliente-cell">
                                <div class="client-name">${escapeHtml(nome)}</div>
                                <div class="cliente-proto">#${escapeHtml(idNumerico)}</div>
                            </div>
                            <div class="produto-cell">
                                <div class="produto-nome">${escapeHtml(produtos.length > 0 ? nomeProdutoSemCodigo(produtos[0]) : '-')}</div>
                                ${qtdExtra > 0 ? `<button type="button" class="btn-expand-produtos produto-extra-btn">+ ${qtdExtra} item${qtdExtra > 1 ? 'ns' : ''} <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
                            </div>
                            ${isGerente ? `
                            <div class="vendedor-cell">
                                <div class="negociacao-avatar vendedor-avatar" style="background:${getAvatarColor(vendedorNome)};">${getIniciais(vendedorNome)}</div>
                                <span class="vendedor-nome">${escapeHtml(vendedorNome)}</span>
                            </div>` : ''}
                            <div><span class="status-tag ${classToFormatStatus(statusTexto)}">${escapeHtml(statusTexto)}</span></div>
                            <div class="data-cell">${escapeHtml(dataRelativa)}<span class="full">${escapeHtml(dataCompleta)}</span></div>
                            <div class="valor-cell ${valorClass}">R$ ${parseFloat(o.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            <div class="chevron"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
                        `;

                        // O botão de expandir produtos não deve abrir os detalhes do orçamento
                        const btnExp = row.querySelector('.produto-extra-btn');
                        if (btnExp) btnExp.addEventListener('click', e => toggleAccordion(e, o.id_orcamento));

                        frag.appendChild(row);

                        // Linha accordion (só se tiver itens extras)
                        if (qtdExtra > 0) {
                            const acc = document.createElement('div');
                            acc.id = `acc-${o.id_orcamento}`;
                            acc.className = 'accordion-row';
                            const divAcc = document.createElement('div');
                            divAcc.className = 'accordion-inner';
                            const strong = document.createElement('strong');
                            strong.textContent = 'Todos os itens do protocolo:';
                            const ul = document.createElement('ul');
                            ul.style.marginTop = '8px';
                            produtos.forEach(p => {
                                const li = document.createElement('li');
                                const bullet = document.createElement('span');
                                bullet.style.cssText = 'color:var(--brand-blue); font-weight:bold;';
                                bullet.textContent = '•';
                                li.appendChild(bullet);
                                li.appendChild(document.createTextNode(' ' + nomeProdutoSemCodigo(p)));
                                ul.appendChild(li);
                            });
                            divAcc.appendChild(strong);
                            divAcc.appendChild(ul);
                            acc.appendChild(divAcc);
                            frag.appendChild(acc);
                        }
                    });
                    tbody.appendChild(frag);
                }

                // Info de contagem
                const infoEl = document.getElementById('paginationInfo');
                if (infoEl) {
                    if (!count) { infoEl.textContent = 'Nenhuma negociação encontrada'; }
                    else {
                        const fromDisplay = from + 1;
                        const toDisplay = Math.min(from + ITEMS_PER_PAGE, count);
                        infoEl.textContent = `Mostrando ${fromDisplay}–${toDisplay} de ${count} negociação${count !== 1 ? 'ões' : ''}`;
                    }
                }

                // Paginação em pílulas
                const fragPag = document.createDocumentFragment();
                const btnAnterior = document.createElement('button');
                btnAnterior.className = 'page-btn';
                btnAnterior.innerHTML = '‹';
                btnAnterior.disabled = store.currentPage <= 1;
                btnAnterior.setAttribute('aria-label', 'Página anterior');
                btnAnterior.addEventListener('click', () => changePage(store.currentPage - 1));
                fragPag.appendChild(btnAnterior);

                getPaginaNumeros(store.currentPage, totalPages).forEach(p => {
                    if (p === '...') {
                        const span = document.createElement('span');
                        span.className = 'page-btn page-ellipsis';
                        span.textContent = '…';
                        fragPag.appendChild(span);
                    } else {
                        const btn = document.createElement('button');
                        btn.className = 'page-btn' + (p === store.currentPage ? ' active' : '');
                        btn.textContent = p;
                        btn.addEventListener('click', () => changePage(p));
                        fragPag.appendChild(btn);
                    }
                });

                const btnProximo = document.createElement('button');
                btnProximo.className = 'page-btn';
                btnProximo.innerHTML = '›';
                btnProximo.disabled = store.currentPage >= totalPages;
                btnProximo.setAttribute('aria-label', 'Próxima página');
                btnProximo.addEventListener('click', () => changePage(store.currentPage + 1));
                fragPag.appendChild(btnProximo);

                pagination.innerHTML = '';
                pagination.appendChild(fragPag);
            } catch (error) { 
            tbody.innerHTML = `<div class="negociacoes-empty erro">Erro ao carregar dados da tabela.</div>`; 
            }
        }

        async function exportarCSV() {
            showToast('Gerando relatório...', 'info');
            try {
                let query = db.from('orcamentos').select('*, clientes!inner(nome_cliente, whatsapp), usuarios!inner(nome, id_loja), status_orcamento(nome)');
                if (store.currentUser.perfil === 'Vendedor') query = query.eq('id_usuario', store.currentUser.id_usuario);
                else if (store.currentUser.perfil === 'Gerente') {
                    const lojasPermitidasCSV = getLojasPermitidas();
                    query = query.in('usuarios.id_loja', (lojasPermitidasCSV && lojasPermitidasCSV.length > 0) ? lojasPermitidasCSV : ['00000000-0000-0000-0000-000000000000']);
                    if (store.selectedVendedor !== 'todos') query = query.eq('id_usuario', store.selectedVendedor);
                }
                else if (store.selectedVendedor !== 'todos') query = query.eq('id_usuario', store.selectedVendedor);
                
                if (store.currentMonth && store.currentYear && !store.currentDay) {
                    const start = new Date(store.currentYear, store.currentMonth - 1, 1).toISOString();
                    const end = new Date(store.currentYear, store.currentMonth, 0, 23, 59, 59).toISOString();
                    query = query.gte('data_criacao', start).lte('data_criacao', end);
                }
                
                const { data, error } = await query;
                if (error) throw error;
                if(!data || data.length === 0) return showToast('Nenhum dado para exportar.', 'error');

                let csv = 'Data,Cliente,WhatsApp,Produto,Valor,Status,Vendedor\n';
                data.forEach(row => {
                    const dataFormatada = new Date(row.data_criacao).toLocaleDateString('pt-BR');
                    const nome = `"${sanitizeCsvField(row.clientes?.nome_cliente || '').replace(/"/g, '""')}"`;
                    const whats = `"${sanitizeCsvField(row.clientes?.whatsapp || '')}"`;
                    const prod = `"${sanitizeCsvField(row.modelo_colchao || '').replace(/"/g, '""')}"`;
                    const valor = row.valor_orcado || 0;
                    const status = sanitizeCsvField(row.status_orcamento ? row.status_orcamento.nome : '');
                    const vendedor = `"${sanitizeCsvField(row.usuarios?.nome || '').replace(/"/g, '""')}"`;
                    csv += `${dataFormatada},${nome},${whats},${prod},${valor},${status},${vendedor}\n`;
                });

                const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `relatorio_vendas_${store.currentMonth}_${store.currentYear}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast('Relatório exportado com sucesso!', 'success');
            } catch(e) { showToast('Erro ao exportar relatório.', 'error'); }
        }

        function handleSearch() {
    store.searchTerm = document.getElementById('searchInput')?.value || '';
    store.currentPage = 1;
    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) {
        tagContainer.innerHTML = store.searchTerm ? `<span class="search-tag">🔍 "${escapeHtml(store.searchTerm)}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';
    }
    
    // Atualiza apenas a tela ativa
    if (store.currentView === 'carteira') {
        renderKanbanBoard();
    } else if (store.currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function handleSearchProtocolo() {
    store.searchProtocolo = document.getElementById('searchProtocoloInput')?.value?.trim() || '';
    store.currentPage = 1;
    
    if (store.currentView === 'carteira') {
        renderKanbanBoard();
    } else if (store.currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function handleSearchUnificado() {
    const val = (document.getElementById('searchUnificado')?.value || '').trim();
    const pareceProtocolo = val !== '' && /^[0-9-]+$/.test(val);
    if (pareceProtocolo) { store.searchProtocolo = val; store.searchTerm = ''; }
    else { store.searchTerm = val; store.searchProtocolo = ''; }
    store.currentPage = 1;

    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) {
        tagContainer.innerHTML = val ? `<span class="search-tag">🔍 "${escapeHtml(val)}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';
    }

    if (store.currentView === 'carteira') {
        renderKanbanBoard();
    } else if (store.currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function clearSearch() {
    store.searchTerm = '';
    store.searchProtocolo = '';
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    const inpProt = document.getElementById('searchProtocoloInput');
    if (inpProt) inpProt.value = '';
    const inpUnif = document.getElementById('searchUnificado');
    if (inpUnif) inpUnif.value = '';
    store.currentPage = 1;
    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) tagContainer.innerHTML = '';
    
    if (store.currentView === 'carteira') {
        renderKanbanBoard();
    } else if (store.currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function selectFilter(filter) { 
    store.currentFilter = filter; 
    store.currentPage = 1; 
    
    if (store.currentView === 'carteira') {
        renderKanbanBoard();
    } else if (store.currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

        function getNegociacoesGridTemplate(isGerente) {
            return isGerente
                ? '40px 190px minmax(200px,1fr) 120px 130px 100px 120px 24px'
                : '40px 210px minmax(220px,1fr) 130px 100px 120px 24px';
        }

        function getPaginaNumeros(atual, total) {
            if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
            const nums = [1];
            if (atual > 3) nums.push('...');
            const start = Math.max(2, atual - 1);
            const end = Math.min(total - 1, atual + 1);
            for (let i = start; i <= end; i++) nums.push(i);
            if (atual < total - 2) nums.push('...');
            nums.push(total);
            return nums;
        }

			async function renderCarteiraPage() {
			    const main = document.getElementById('mainContent');
			    const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
			
			    main.innerHTML = `
			        <header class="dashboard-header">
			            <div style="display: flex; flex-direction: column; gap: 4px;">
			                <h1 style="margin: 0;">Pipeline de Vendas</h1>
			                <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">Visão Geral do Funil</span>
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
			        </header>
			
			        <div class="kpi-grid" id="carteiraMetricsGrid">
			            <div class="kpi-card">
			                <div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Total no Pipeline</span></div>
			                <div class="kpi-value" id="carteiraTotalPipeline">R$ 0</div>
			            </div>
			            <div class="kpi-card">
			                <div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Previsão de Faturamento</span></div>
			                <div class="kpi-value" id="carteiraPrevisao">R$ 0</div>
			            </div>
			            <div class="kpi-card">
			                <div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Ticket Médio</span></div>
			                <div class="kpi-value" id="carteiraTicketMedio">R$ 0</div>
			            </div>
			            <div class="kpi-card vendido-highlight">
			                <div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Meta do Mês</span></div>
			                <div class="kpi-value" id="carteiraMetaValor">R$ 0</div>
			                <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Coberta em <strong id="carteiraMetaPercentual">0%</strong></div>
			                <div style="margin-top:6px; width:100%; height:3px; background:var(--border-light); border-radius:4px; overflow:hidden;">
			                    <div id="carteiraMetaProgresso" style="width:0%; height:100%; background:var(--accent-green); border-radius:4px; transition:width .3s;"></div>
			                </div>
			            </div>
			        </div>
			
			        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
			            <div id="searchTagContainer"></div>
			            <input type="text" class="search-input" placeholder="Buscar cliente..." id="searchInput" onchange="handleSearch()" onkeyup="if(event.key === 'Enter') handleSearch()" value="${escapeHtml(store.searchTerm)}">
			            <input type="text" class="search-input" placeholder="Buscar protocolo..." id="searchProtocoloInput" onchange="handleSearchProtocolo()" onkeyup="if(event.key === 'Enter') handleSearchProtocolo()" value="${escapeHtml(store.searchProtocolo)}" style="width:160px;">
			            <select class="form-input" style="width:auto; padding:8px 16px; border-radius:var(--radius-full); font-size:var(--font-sm);" id="listFilterSelect" onchange="selectFilter(this.value)">
			                 <option value="todos" ${store.currentFilter === 'todos' ? 'selected' : ''}>Todos os Status</option>
			                 <option value="Contato Inicial" ${store.currentFilter === STATUS.CONTATO_INICIAL ? 'selected' : ''}>Contato Inicial</option>
			                 <option value="Negociação" ${store.currentFilter === STATUS.NEGOCIACAO ? 'selected' : ''}>Negociação</option>
			                 <option value="Em Fechamento" ${store.currentFilter === STATUS.EM_FECHAMENTO ? 'selected' : ''}>Em Fechamento</option>
			                 <option value="Fechado" ${store.currentFilter === STATUS.FECHADO ? 'selected' : ''}>Fechado</option>
			                 <option value="Perdido" ${store.currentFilter === STATUS.PERDIDO ? 'selected' : ''}>Perdido</option>
			            </select>
			        </div>
			
			        <div id="kanbanBoard" class="active"></div>
			    `;
			
			    await renderKanbanBoard();
			    renderNotificationBadge(buildNotifications().length);
			}

        function toggleAccordion(event, idOrcamento) {
            event.stopPropagation();
            const accordionRow = document.getElementById(`acc-${idOrcamento}`);
            const btn = event.currentTarget;
            if (accordionRow.classList.contains('open')) {
                accordionRow.classList.remove('open');
                btn.classList.remove('open');
            } else {
                document.querySelectorAll('.accordion-row.open').forEach(r => r.classList.remove('open'));
                document.querySelectorAll('.btn-expand-produtos.open').forEach(b => b.classList.remove('open'));
                accordionRow.classList.add('open');
                btn.classList.add('open');
            }
        }

        function changePage(page) { store.currentPage = page; atualizarTabelaPaginadaServer(); }

        function switchCarteiraView(view) {
            store.kanbanAtivo = (view === 'kanban');

            const tabelaWrapper = document.getElementById('tabelaCarteiraWrapper');
            const kanbanBoard   = document.getElementById('kanbanBoard');
            const btnTabela     = document.getElementById('btnViewTabela');
            const btnKanban     = document.getElementById('btnViewKanban');

            if (!tabelaWrapper || !kanbanBoard) return;

            if (store.kanbanAtivo) {
                tabelaWrapper.classList.add('hidden');
                kanbanBoard.classList.add('active');
                btnTabela?.classList.remove('active');
                btnKanban?.classList.add('active');
                renderKanbanBoard();
            } else {
                kanbanBoard.classList.remove('active');
                tabelaWrapper.classList.remove('hidden');
                btnTabela?.classList.add('active');
                btnKanban?.classList.remove('active');
                atualizarTabelaPaginadaServer();
            }
        }

        const PROBABILIDADE_POR_ETAPA = {
            [STATUS.CONTATO_INICIAL]: 0.20,
            [STATUS.NEGOCIACAO]: 0.50,
            [STATUS.EM_FECHAMENTO]: 0.80
        };

        async function atualizarMetricasCarteira() {
            const elPipeline = document.getElementById('carteiraTotalPipeline');
            if (!elPipeline) return;

            // ═══════════════════════════════════════════════════════
            // NOVO: Buscar dados já calculados nas Views
            // ═══════════════════════════════════════════════════════
            
            // 1. Funil de vendas (já vem calculado)
            const { data: funil } = await db
                .from('vw_funil_vendas')
                .select('*');
            
            // 2. Vendas do mês (já vem calculado)
            const mesAtual = new Date().getMonth() + 1;
            const anoAtual = new Date().getFullYear();
            
            const { data: vendasMes } = await db
                .from('vw_vendas_mensais')
                .select('*')
                .eq('ano', anoAtual)
                .eq('mes', mesAtual)
                .single();
            
            // 3. Calcular métricas a partir das Views
            const etapasAbertas = funil?.filter(f => 
                !['fechado', 'perdido', 'vendido', 'declinado'].includes(f.etapa.toLowerCase())
            ) || [];
            
            const totalPipeline = etapasAbertas.reduce((s, f) => s + parseFloat(f.valor_total || 0), 0);
            const ticketMedio = etapasAbertas.reduce((s, f) => s + parseFloat(f.valor_medio || 0), 0) / (etapasAbertas.length || 1);
            
            const vendasFechadasValor = vendasMes?.faturamento_total || 0;
            
            // 4. Previsão (usando probabilidades)
            const previsaoPipeline = etapasAbertas.reduce((s, f) => {
                const peso = PROBABILIDADE_POR_ETAPA[f.etapa] || 0;
                return s + (parseFloat(f.valor_total || 0) * peso);
            }, 0);
            const previsao = vendasFechadasValor + previsaoPipeline;
            
            // 5. Meta do Mês
            const metaTotal = calcularMetaTotal();
            const metaPercentual = metaTotal > 0 ? Math.min(100, Math.round((vendasFechadasValor / metaTotal) * 100)) : 0;

            // Atualizar DOM
            const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            elPipeline.textContent = fmt(totalPipeline);
            document.getElementById('carteiraPrevisao').textContent = fmt(previsao);
            document.getElementById('carteiraTicketMedio').textContent = fmt(ticketMedio);
            document.getElementById('carteiraMetaValor').textContent = fmt(metaTotal);
            document.getElementById('carteiraMetaPercentual').textContent = `${metaPercentual}%`;
            document.getElementById('carteiraMetaProgresso').style.width = `${metaPercentual}%`;
        }

        async function renderKanbanBoard() {
            const board = document.getElementById('kanbanBoard');
            if (!board) return;
            board.innerHTML = `<div class="kanban-loading"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".3"/><path d="M21 12a9 9 0 01-9 9"/></svg> Carregando pipeline...</div>`;

            try {
                const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';

                // Busca orçamentos do período selecionado (sem paginação — kanban precisa do total)
                let query = db.from('orcamentos')
                    .select('id_orcamento, protocolo, data_criacao, data_fechamento, valor_orcado, modelo_colchao, data_contato, hora_contato, usuarios!inner(nome, id_loja), clientes(nome_cliente), status_orcamento(nome)')
                    .not('id_status', 'is', null)
                    .is('deleted_at', null);  // Ignorar deletados

                if (store.currentUser.perfil === 'Gerente') {
                    const lojasPermitidasKanban = getLojasPermitidas();
                    // Nunca pula o filtro: se não há lojas permitidas, força zero resultados (falha fechada).
                    query = query.in('usuarios.id_loja', (lojasPermitidasKanban && lojasPermitidasKanban.length > 0) ? lojasPermitidasKanban : ['00000000-0000-0000-0000-000000000000']);
                } else if (store.currentUser.perfil === 'Vendedor') {
                    query = query.eq('id_usuario', store.currentUser.id_usuario);
                } else {
                    if (store.selectedVendedor !== 'todos') {
                        query = query.eq('id_usuario', store.selectedVendedor);
                    } else if (store.selectedLoja !== 'todas') {
                        const ids = store.todosVendedores.filter(v => v.id_loja === store.selectedLoja).map(v => v.id_usuario);
                        if (ids.length > 0) query = query.in('id_usuario', ids);
                    }
                }

                if (store.searchTerm) query = query.ilike('clientes.nome_cliente', `%${store.searchTerm}%`);

                // 1. APLICA O FILTRO DE STATUS DIRETO NO BANCO
                if (store.currentFilter !== 'todos') {
                    const uuidsPermitidos = store.mapStatusUUID
                        .filter(s => s.nome === store.currentFilter)
                        .map(s => s.id_status);
                    
                    if (uuidsPermitidos.length > 0) {
                        query = query.in('id_status', uuidsPermitidos);
                    }
                }

                // 2. APLICA O FILTRO DE PERÍODO (mês/dia selecionado)
                // Em andamento (Contato Inicial, Negociação, Em Fechamento) => SEMPRE visível,
                //   independente do mês, pois ainda está em tratativa.
                // Finalizados (Fechado, Perdido) => só aparece no mês/dia da CONCLUSÃO (data_fechamento).
                let startPeriodo, endPeriodo;
                if (store.currentDay) {
                    startPeriodo = new Date(store.currentYear, store.currentMonth - 1, store.currentDay);
                    endPeriodo = new Date(store.currentYear, store.currentMonth - 1, store.currentDay + 1);
                } else {
                    startPeriodo = new Date(store.currentYear, store.currentMonth - 1, 1);
                    endPeriodo = new Date(store.currentYear, store.currentMonth, 1);
                }
                const startPeriodoISO = startPeriodo.toISOString();
                const endPeriodoISO = endPeriodo.toISOString();

                const statusAbertosIds = store.mapStatusUUID
                    .filter(s => [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(s.nome))
                    .map(s => s.id_status);
                const statusFinalizadosIds = store.mapStatusUUID
                    .filter(s => [STATUS.FECHADO, STATUS.PERDIDO].includes(s.nome))
                    .map(s => s.id_status);

                const orParts = [];
                if (statusAbertosIds.length) {
                    orParts.push(`id_status.in.(${statusAbertosIds.join(',')})`);
                }
                if (statusFinalizadosIds.length) {
                    orParts.push(`and(id_status.in.(${statusFinalizadosIds.join(',')}),data_fechamento.gte.${startPeriodoISO},data_fechamento.lt.${endPeriodoISO})`);
                }
                if (orParts.length) query = query.or(orParts.join(','));

                query = query.order('data_criacao', { ascending: false }).limit(300);

                const { data, error } = await query;
                if (error) throw error;

                atualizarMetricasCarteira(data || []);

                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

                // Agrupa por coluna (funil completo: ativo + finalizados)
                const colunas = [
                    { key: 'ci',  label: 'Contato Inicial',  cls: 'kcol-ci',  statuses: [STATUS.CONTATO_INICIAL] },
                    { key: 'nv',  label: 'Negociação',       cls: 'kcol-nv',  statuses: [STATUS.NEGOCIACAO] },
                    { key: 'ad',  label: 'Em Fechamento',    cls: 'kcol-ad',  statuses: [STATUS.EM_FECHAMENTO] },
                    { key: 'fec', label: 'Fechado',          cls: 'kcol-fec', statuses: [STATUS.FECHADO, 'Vendido'], finalizado: true },
                    { key: 'per', label: 'Perdido',          cls: 'kcol-per', statuses: [STATUS.PERDIDO, STATUS.DECLINADO], finalizado: true }
                ];

                // Se filtro de status ativo, restringe colunas
                const filtroAtivo = store.currentFilter !== 'todos';

                const boardDiv = document.createElement('div');
                boardDiv.className = 'kanban-board';

                colunas.forEach(col => {
                    const items = (data || []).filter(o => {
                        const st = o.status_orcamento?.nome || STATUS.CONTATO_INICIAL;
                        return col.statuses.includes(st);
                    });

                    // Pula coluna se filtro ativo e não há itens
                    if (filtroAtivo && items.length === 0) return;

                    const total = items.reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
                    const statusDestino = col.statuses[0];

                    // Coluna
                    const colDiv = document.createElement('div');
                    colDiv.className = 'kanban-col';
                    colDiv.dataset.status = statusDestino;

                    // Header da coluna (agora em duas linhas: título+contador, e logo abaixo o subtotal,
                    // ambos dentro do mesmo bloco colorido para formar uma unidade visual só)
                    const header = document.createElement('div');
                    header.className = `kanban-col-header ${col.cls}`;

                    const topRow = document.createElement('div');
                    topRow.className = 'kcol-header-top';
                    const titleDiv = document.createElement('div');
                    titleDiv.className = 'kcol-title';
                    const dot = document.createElement('span');
                    dot.className = 'kcol-dot';
                    titleDiv.appendChild(dot);
                    titleDiv.appendChild(document.createTextNode(col.label));
                    const countSpan = document.createElement('span');
                    countSpan.className = 'kcol-count';
                    countSpan.id = `count-${statusDestino.replace(/\s+/g, '-')}`;
                    countSpan.textContent = items.length;
                    topRow.appendChild(titleDiv);
                    topRow.appendChild(countSpan);
                    header.appendChild(topRow);

                    // Subtotal da coluna (valor acumulado + qtd. de orçamentos), 2ª linha do mesmo bloco
                    const totalFmt = total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    const subtotalDiv = document.createElement('div');
                    subtotalDiv.className = 'kcol-subtotal';
                    const strongSubtotal = document.createElement('strong');
                    strongSubtotal.textContent = `R$ ${totalFmt}`;
                    subtotalDiv.appendChild(strongSubtotal);
                    subtotalDiv.appendChild(document.createTextNode(` em ${items.length} orçamento${items.length !== 1 ? 's' : ''}`));
                    header.appendChild(subtotalDiv);
                    colDiv.appendChild(header);

                    // Zona de drop (kanban-cards)
                    const cardsDiv = document.createElement('div');
                    cardsDiv.className = 'kanban-cards';
                    cardsDiv.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:8px; padding-top:8px; min-width:0; overflow:hidden;';

                    if (!col.finalizado) {
                        cardsDiv.addEventListener('dragover', allowDrop);
                        cardsDiv.addEventListener('dragenter', dragEnter);
                        cardsDiv.addEventListener('dragleave', dragLeave);
                        cardsDiv.addEventListener('drop', e => dropCard(e, statusDestino));
                    } else if (col.key === 'per') {
                        cardsDiv.addEventListener('drop', dropCardPerdido);
                    } else {
                        cardsDiv.addEventListener('drop', dropCardFechado);
                    }

                    if (items.length === 0) {
                        const empty = document.createElement('div');
                        empty.className = 'kanban-empty';
                        empty.textContent = 'Nenhum orçamento';
                        cardsDiv.appendChild(empty);
                    } else {
                        items.forEach(o => {
                            const nome = o.clientes?.nome_cliente || 'Cliente';
                            const vendedor = o.usuarios?.nome || '';
                            const inicial = vendedor ? vendedor.charAt(0).toUpperCase() : '?';
                            const idNumerico = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || '—');
                            const produto = o.modelo_colchao ? removerCodigoProduto(o.modelo_colchao.split(',')[0].trim()) : '—';
                            const valor = parseFloat(o.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

                            const dataCriacao = new Date(o.data_criacao);
                            const diasAtras = Math.floor((hoje - dataCriacao) / 86400000);
                            let borderClass = 'kcard-fresh';
                            let daysClass = 'ok-days';
                            let clockIconHtml = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

                            const isFechado = [STATUS.FECHADO, 'Vendido'].includes(o.status_orcamento?.nome);
                            const isPerdido = [STATUS.PERDIDO, STATUS.DECLINADO].includes(o.status_orcamento?.nome);

                            if (isFechado) {
                                borderClass = 'kcard-won';
                                clockIconHtml = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
                            } else if (isPerdido) {
                                borderClass = 'kcard-lost';
                            } else if (o.data_contato) {
                                // FOCO 1 e 2: A agenda do vendedor tem prioridade absoluta
                                const dc = new Date(o.data_contato + 'T00:00:00');
                                if (dc < hoje) {
                                    // Foco 1: Contato vencido — vendedor perdeu o prazo
                                    borderClass = 'kcard-urgent';
                                    daysClass = 'alert-days';
                                } else {
                                    // Foco 2: Contato agendado no futuro — negócio sob controle
                                    borderClass = 'kcard-fresh';
                                }
                            } else if (diasAtras >= 5) {
                                // FOCO 3: Sem nenhuma agenda e já faz muitos dias — abandono real
                                borderClass = 'kcard-urgent';
                                daysClass = 'alert-days';
                                // alertChipData removido: o tempo já aparece no rodapé do card (kcard-days)
                            }

                            const diasLabel = isFechado ? `há ${diasAtras}d` : diasAtras === 0 ? 'Hoje' : diasAtras === 1 ? 'Ontem' : `há ${diasAtras}d`;

                            // Card
                            const card = document.createElement('div');
                            card.className = `kcard ${borderClass}`;
                            card.id = `card-${o.id_orcamento}`;
                            card.addEventListener('click', () => abrirDetalhesCliente(o.id_orcamento));

                            if (isFechado || isPerdido) {
                                card.draggable = false;
                            } else {
                                card.draggable = true;
                                card.addEventListener('dragstart', e => dragStart(e, o.id_orcamento));
                            }

                            // kcard-top
                            const top = document.createElement('div');
                            top.className = 'kcard-top';
                            const nameDiv = document.createElement('div');
                            nameDiv.className = 'kcard-name';
                            nameDiv.textContent = nome;
                            const protoSpan = document.createElement('span');
                            protoSpan.className = 'kcard-proto';
                            protoSpan.textContent = idNumerico;
                            top.appendChild(nameDiv);
                            top.appendChild(protoSpan);

                            // kcard-product
                            const prodDiv = document.createElement('div');
                            prodDiv.className = 'kcard-product';
                            prodDiv.textContent = produto;

                            // kcard-bottom
                            const bottom = document.createElement('div');
                            bottom.className = 'kcard-bottom';
                            const valueSpan = document.createElement('span');
                            valueSpan.className = 'kcard-value';
                            valueSpan.textContent = `R$ ${valor}`;
                            const metaDiv = document.createElement('div');
                            metaDiv.className = 'kcard-meta';
                            const daysDiv = document.createElement('div');
                            daysDiv.className = `kcard-days ${daysClass}`;
                            daysDiv.innerHTML = clockIconHtml;
                            daysDiv.appendChild(document.createTextNode(diasLabel));
                            metaDiv.appendChild(daysDiv);

                            if (isGerente) {
                                const avatarDiv = document.createElement('div');
                                avatarDiv.className = 'kcard-avatar';
                                avatarDiv.title = vendedor;
                                avatarDiv.textContent = inicial;
                                metaDiv.appendChild(avatarDiv);
                            }

                            bottom.appendChild(valueSpan);
                            bottom.appendChild(metaDiv);

                            card.appendChild(top);
                            card.appendChild(prodDiv);
                            card.appendChild(bottom);
                            cardsDiv.appendChild(card);
                        });
                    }

                    colDiv.appendChild(cardsDiv);
                    boardDiv.appendChild(colDiv);
                });

                board.innerHTML = '';
                board.appendChild(boardDiv);

            } catch (e) {
                board.innerHTML = `<div style="padding:24px; text-align:center; color:var(--danger-text);">Erro ao carregar pipeline: ${e.message}</div>`;
            }
        }

function dragStart(event, idOrcamento) {
    // Guarda o ID do card que está sendo arrastado
    event.dataTransfer.setData('text/plain', idOrcamento);
    event.dataTransfer.effectAllowed = 'move';
    
    // Deixa o card original levemente transparente enquanto você arrasta
    setTimeout(() => {
        event.target.style.opacity = '0.4';
    }, 0);
}

function allowDrop(event) {
    // Esse comando é OBRIGATÓRIO. Ele avisa o navegador que essa área aceita receber itens.
    event.preventDefault();
}

function dragEnter(event) {
    event.preventDefault();
    // Feedback visual: acende levemente o fundo da coluna quando o card passa por cima
    event.currentTarget.style.background = 'rgba(99,102,241,0.05)';
    event.currentTarget.style.borderRadius = '8px';
}

function dragLeave(event) {
    // Apaga o fundo da coluna se o card sair dela sem ser solto
    event.currentTarget.style.background = '';
}

async function dropCard(event, statusNomeDestino) {
    event.preventDefault();
    event.currentTarget.style.background = ''; // Limpa o fundo aceso
    
    // 1. Pega o ID do orçamento que guardamos no início do arraste
    const idOrcamento = event.dataTransfer.getData('text/plain');
    if (!idOrcamento) return;

    // 2. Acha a "Chave" (UUID) verdadeira desse status no Supabase
    const statusObj = store.mapStatusUUID.find(s => s.nome === statusNomeDestino);
    if (!statusObj) {
        showToast('Erro: Status destino não encontrado no banco de dados.', 'error');
        renderKanbanBoard(); 
        return;
    }

    showToast('Atualizando pipeline...', 'info');

    try {
        // 3. Salva a nova etapa direto no Supabase
        const { error } = await db.from('orcamentos')
            .update({ id_status: statusObj.id_status })
            .eq('id_orcamento', idOrcamento);

        if (error) throw error;

        // 4. Atualiza a memória local para não precisar baixar tudo do banco de novo
        const index = store.kpisMensais.findIndex(o => String(o.id_orcamento) === String(idOrcamento));
        if (index !== -1) {
            store.kpisMensais[index].status = statusObj.nome;
            if(store.kpisMensais[index].status_orcamento) {
                 store.kpisMensais[index].status_orcamento.nome = statusObj.nome;
            }
        }

        showToast('Orçamento movido com sucesso!', 'success');
        
        // 5. Recarrega o Kanban para os cards se organizarem nas colunas certas
        renderKanbanBoard();

    } catch (error) {
        showToast('Erro ao mover card: ' + error.message, 'error');
        renderKanbanBoard(); // Se der erro, redesenha a tela para o card voltar pro lugar original
    }
}

function dropCardPerdido(event) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    const idOrcamento = event.dataTransfer.getData('text/plain');
    if (!idOrcamento) return;
    // Reutiliza o fluxo existente de motivo de perda
    abrirMotivoPerda(idOrcamento);
}

async function dropCardFechado(event) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    const idOrcamento = event.dataTransfer.getData('text/plain');
    if (!idOrcamento) return;

    const statusObj = store.mapStatusUUID.find(s => s.nome === STATUS.FECHADO);
    if (!statusObj) {
        showToast('Erro: status Fechado não encontrado.', 'error');
        return;
    }

    showToast('Fechando negócio...', 'info');
    try {
        const { error } = await db.from('orcamentos')
            .update({ id_status: statusObj.id_status, data_fechamento: getAgoraBrasiliaISO() })
            .eq('id_orcamento', idOrcamento);
        if (error) throw error;

        const index = store.kpisMensais.findIndex(o => String(o.id_orcamento) === String(idOrcamento));
        if (index !== -1) {
            store.kpisMensais[index].status = STATUS.FECHADO;
            if (store.kpisMensais[index].status_orcamento) store.kpisMensais[index].status_orcamento.nome = STATUS.FECHADO;
        }

        showToast('Negócio fechado com sucesso! 🎉', 'success');
        renderKanbanBoard();
    } catch (err) {
        showToast('Erro ao fechar negócio: ' + err.message, 'error');
        renderKanbanBoard();
    }
}

export { PROBABILIDADE_POR_ETAPA, allowDrop, atualizarMetricasCarteira, atualizarTabelaPaginadaServer, changePage, clearSearch, dragEnter, dragLeave, dragStart, dropCard, dropCardFechado, dropCardPerdido, exportarCSV, getNegociacoesGridTemplate, getPaginaNumeros, handleSearch, handleSearchProtocolo, handleSearchUnificado, renderCarteiraPage, renderKanbanBoard, selectFilter, switchCarteiraView, toggleAccordion };
