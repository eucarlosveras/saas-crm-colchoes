// ═══════════════════════════════════════════════════════════════
// Módulo: radar.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { abrirDetalhesCliente } from './orcamentos.js';
import { AppState, store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { escapeHtml, getHojeBrasilia } from './utils.js';

// Retorna o HTML do bloco "Meu Radar" (header + cards de contagem + lista de sinais).
// Extraído para ser embutido em qualquer container — hoje é usado dentro da tela
// Início (Visão Vendedor), no lugar da antiga fileira de gráficos.
function getMeuRadarBlockHtml() {
    return `
        <div class="radar-header">
            <h2 class="page-title">
                <span class="radar-icon-badge">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
                </span>
                Meu Radar
            </h2>
            <div class="header-actions">
                <select class="seller-select" id="sellerFilter">
                    <option value="Todos">Todos os vendedores</option>
                </select>
            </div>
        </div>

        <div class="summary-grid">
            <div class="summary-card">
                <div class="summary-icon alerts">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                </div>
                <div class="summary-info"><h4>Alertas urgentes</h4><span id="count-alerts">0</span></div>
            </div>
            <div class="summary-card">
                <div class="summary-icon tips">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
                <div class="summary-info"><h4>Dicas de abordagem</h4><span id="count-tips">0</span></div>
            </div>
            <div class="summary-card">
                <div class="summary-icon suggestions">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.75c.44.37.7.86.7 1.42V17h6.6v-.83c0-.56.26-1.05.7-1.42A7 7 0 0012 2z"/></svg>
                </div>
                <div class="summary-info"><h4>Sugestões de ação</h4><span id="count-suggestions">0</span></div>
            </div>
        </div>

        <div id="signalContainer"></div>

        <div class="empty-state" id="emptyState" style="display: none;">
            <div class="empty-state-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3>Tudo em ordem por aqui! 🎉</h3>
            <p>Nenhum sinal pendente. Continue acompanhando seus clientes e o radar te avisará quando algo precisar de atenção.</p>
        </div>
    `;
}

function getIgnoredRadarIds() {
    const stored = sessionStorage.getItem('radar_ignorados');
    return stored ? JSON.parse(stored) : [];
}

function addIgnoredRadarId(idOrcamento) {
    const ignored = getIgnoredRadarIds();
    if (!ignored.includes(idOrcamento)) {
        ignored.push(idOrcamento);
        sessionStorage.setItem('radar_ignorados', JSON.stringify(ignored));
    }
}

function getConcludedRadarIds() {
    const stored = localStorage.getItem('radar_concluidos');
    return stored ? JSON.parse(stored) : [];
}

function addConcludedRadarId(idOrcamento) {
    const concluidos = getConcludedRadarIds();
    if (!concluidos.includes(idOrcamento)) {
        concluidos.push(idOrcamento);
        localStorage.setItem('radar_concluidos', JSON.stringify(concluidos));
    }
}

async function carregarSinaisRadar() {
    const hojeIso = getHojeBrasilia();
    const hoje = new Date(`${hojeIso}T00:00:00`);
    
    store.radarSignalsData = [];
    const ignoredIds = [...getIgnoredRadarIds(), ...getConcludedRadarIds()];

    try {
        // 1. Busca Orçamentos
        const { data: orcamentos, error: errOrc } = await db
            .from('orcamentos')
            .select(`
                id_orcamento, data_criacao, data_contato, data_entrega, ligacao_confirmada, valor_orcado, modelo_colchao,
                clientes(nome_cliente), usuarios(nome), status_orcamento(nome)
            `);
        
        // 2. Busca Estoque Zerado (Regra 1)
        const { data: estoqueZero, error: errEst } = await db
            .from('estoque')
            .select('id_produto, codigo_produto, nome_produto')
            .lte('qtd_disponivel', 0);

        if (estoqueZero && estoqueZero.length > 0) {
            estoqueZero.forEach(item => {
                const signalId = 'est-' + item.id_produto;
                if (ignoredIds.includes(signalId)) return;
                store.radarSignalsData.push({
                    id: signalId,
                    seller: 'Todos', // Alerta global para a loja
                    type: 'alert',
                    priority: 'high',
                    message: `Ruptura de Estoque: ${item.nome_produto}`,
                    leadName: item.codigo_produto,
                    time: 'Hoje',
                    justification: `Produto atingiu zero unidades disponíveis. Acione compras ou fornecedor com urgência para não travar vendas.`,
                    actionText: 'Ver Estoque',
                    executed: false,
                    ignored: false
                });
            });
        }

        if (errOrc || !orcamentos) return;

        // Dicionário de SLA médio em dias para cada fase (Regra 3 - Ajustável)
        const SLAs = {
            'Contato Inicial': 2,
            'Negociação': 5,
            'Em Fechamento': 3
        };

        orcamentos.forEach(orc => {
            const statusNome = orc.status_orcamento?.nome || '';
            const isFechado = statusNome === 'Fechado' || statusNome === 'Vendido';
            const isPerdido = statusNome === 'Perdido' || statusNome === 'Declinado';
            
            const nomeCliente = orc.clientes?.nome_cliente || 'Cliente';
            const nomeVendedor = orc.usuarios?.nome || 'Sem Vendedor';
            const dataCriacao = orc.data_criacao ? new Date(orc.data_criacao) : null;
            const diffDays = dataCriacao ? Math.floor(Math.abs(hoje - dataCriacao) / (1000 * 60 * 60 * 24)) : 0;

            // Regra 2: Data de Entrega Hoje (Apenas para fechados)
            const idEntrega = orc.id_orcamento + '-entrega';
            if (isFechado && orc.data_entrega === hojeIso && !ignoredIds.includes(idEntrega)) {
                store.radarSignalsData.push({
                    id: idEntrega,
                    seller: nomeVendedor,
                    type: 'alert',
                    priority: 'high',
                    message: `Dia de Entrega: Confirme o recebimento!`,
                    leadName: nomeCliente,
                    time: 'Hoje',
                    justification: `Entrega programada para hoje. Garanta que o cliente recebeu tudo corretamente e registe o feedback.`,
                    actionText: 'Abrir Pedido',
                    executed: false,
                    ignored: false
                });
            }

            // Regras exclusivas para funil ativo (não fechado/perdido)
            if (!isFechado && !isPerdido) {
                
                // Regra 3: Estagnado no Kanban (> 1.5x a média)
                const idEstagnado = orc.id_orcamento + '-estagnado';
                const slaFase = SLAs[statusNome] || 3;
                if (diffDays > (slaFase * 1.5) && !ignoredIds.includes(idEstagnado)) {
                    const valorFmt = parseFloat(orc.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    store.radarSignalsData.push({
                        id: idEstagnado,
                        seller: nomeVendedor,
                        type: 'tip',
                        priority: 'medium',
                        message: `Oportunidade estagnada em ${statusNome}.`,
                        leadName: nomeCliente,
                        time: formatDateForDisplay(dataCriacao),
                        justification: `A oportunidade de R$ ${valorFmt} está há ${diffDays} dias nesta fase (média: ${slaFase} dias). Aja para destravá-la.`,
                        actionText: 'Fazer Follow-up',
                        executed: false,
                        ignored: false
                    });
                }

                // Regra 4: Cross-sell de Cama sem acessórios
                const idCross = orc.id_orcamento + '-crosssell';
                const produtosStr = (orc.modelo_colchao || '').toLowerCase();
                const temCamaColchao = produtosStr.includes('colchão') || produtosStr.includes('colchao') || produtosStr.includes('cama') || produtosStr.includes('box');
                const temAcessorios = produtosStr.includes('protetor') || produtosStr.includes('travesseiro');

                if (temCamaColchao && !temAcessorios && statusNome === 'Em Fechamento' && !ignoredIds.includes(idCross)) {
                    store.radarSignalsData.push({
                        id: idCross,
                        seller: nomeVendedor,
                        type: 'suggestion',
                        priority: 'low',
                        message: `Venda sem acessórios detetada.`,
                        leadName: nomeCliente,
                        time: 'Hoje',
                        justification: `O cliente está a fechar um colchão/cama mas não incluiu acessórios. Ofereça um combo com protetor e travesseiros para aumentar o ticket médio.`,
                        actionText: 'Oferecer Combo',
                        executed: false,
                        ignored: false
                    });
                }
            }
        });
    } catch (e) {
        console.error('Erro ao gerar sinais do Radar:', e);
    }
}

function formatDateForDisplay(date) {
    if (!date) return '';
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    
    if (date.toDateString() === hoje.toDateString()) return 'Hoje';
    if (date.toDateString() === ontem.toDateString()) return 'Ontem';
    
    return date.toLocaleDateString('pt-BR');
}

async function initMeuRadar() {
    // Carrega os sinais reais do Supabase primeiro
    await carregarSinaisRadar();
    
    const sellerSelect = document.getElementById('sellerFilter');
    if (sellerSelect) {
        // Puxa o nome do usuário real do CRM, ou usa fallback
        let nomeLogado = (typeof store.currentUser !== 'undefined' && store.currentUser?.nome) ? store.currentUser.nome : 'Sem Nome';
        
        // Adapta os sinais para mostrar os cards para o usuário logado
        store.radarSignalsData.forEach(s => {
            if (s.seller === 'Carlos' || s.seller === 'Maria') {
                s.seller = nomeLogado;
            }
        });

        let opts = '<option value="Todos">Todos os vendedores</option>';
        opts += `<option value="${nomeLogado}">Eu (${nomeLogado})</option>`;
        
        // Adiciona outros vendedores únicos dos sinais
        const vendedoresUnicos = [...new Set(store.radarSignalsData.map(s => s.seller))];
        vendedoresUnicos.forEach(v => {
            if (v !== nomeLogado && v !== 'Sem Nome') {
                opts += `<option value="${v}">${v}</option>`;
            }
        });
        
        sellerSelect.innerHTML = opts;
        sellerSelect.value = nomeLogado;

        sellerSelect.addEventListener('change', (e) => {
            renderRadarSignals(e.target.value);
        });
        
        renderRadarSignals(nomeLogado);
    }
}

function renderRadarSignals(sellerFilter) {
    const container = document.getElementById('signalContainer');
    const emptyState = document.getElementById('emptyState');
    if(!container) return;

    const ordemPrioridade = { critical: 0, high: 1, medium: 2, low: 3 };
    const filtered = store.radarSignalsData
        .filter(s => {
            if (s.ignored) return false;
            if (sellerFilter === 'Todos') return true;
            return s.seller === sellerFilter;
        })
        .sort((a, b) => (ordemPrioridade[a.priority] ?? 4) - (ordemPrioridade[b.priority] ?? 4));

    // Atualiza contadores
    const elAlerts = document.getElementById('count-alerts');
    const elTips = document.getElementById('count-tips');
    const elSugs = document.getElementById('count-suggestions');
    if(elAlerts) elAlerts.innerText = filtered.filter(s => s.type === 'alert').length;
    if(elTips) elTips.innerText = filtered.filter(s => s.type === 'tip').length;
    if(elSugs) elSugs.innerText = filtered.filter(s => s.type === 'suggestion').length;

    if (filtered.length === 0) {
        container.innerHTML = '';
        if(emptyState) emptyState.style.display = 'block';
        return;
    }

    if(emptyState) emptyState.style.display = 'none';

    const configMap = {
        alert:      { icone: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>' },
        tip:        { icone: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>' },
        suggestion: { icone: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' }
    };

    // Agrupa por tipo, na ordem: alertas → dicas → sugestões
    const grupos = [
        { tipo: 'alert', titulo: '🔴 Ação Imediata' },
        { tipo: 'tip', titulo: '💡 Dicas para Hoje' },
        { tipo: 'suggestion', titulo: '⚡ Oportunidades' }
    ];

    let html = '';
    grupos.forEach(grupo => {
        const itens = filtered.filter(s => s.type === grupo.tipo);
        if (itens.length === 0) return;

        html += `<div class="signal-section-title">${grupo.titulo}</div><div class="signal-list">`;

        itens.forEach(signal => {
            const conf = configMap[signal.type];

            // Extrai UUID correto removendo sufixo pelo final (UUIDs contêm hífens)
            const sufixos = ['-estagnado', '-entrega', '-crosssell'];
            let orcId = signal.id;
            for (const s of sufixos) { if (signal.id.endsWith(s)) { orcId = signal.id.slice(0, -s.length); break; } }

            const isEstoque = signal.id.startsWith('est-');
            const leadTag = isEstoque
                ? `<span class="meta-tag client">${escapeHtml(signal.leadName || '')}</span>`
                : `<span class="meta-tag client" style="cursor:pointer;" onclick="abrirDetalhesCliente('${orcId}')">${escapeHtml(signal.leadName || '')}</span>`;

            html += `
                <div class="radar-task" id="radar-card-${signal.id}" data-tipo="${signal.type}" data-prioridade="${signal.priority || 'low'}">
                    <div class="radar-task-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${conf.icone}</svg>
                    </div>
                    <div class="radar-task-body">
                        <div class="radar-task-top">
                            <span class="radar-task-message">${escapeHtml(signal.message || '')}</span>
                            <span class="radar-task-time">${escapeHtml(signal.time || '')}</span>
                        </div>
                        ${signal.justification ? `<div class="radar-task-desc">${escapeHtml(signal.justification)}</div>` : ''}
                        <div class="radar-task-meta">
                            ${leadTag}
                            <span class="meta-tag store">${escapeHtml(signal.seller || '')}</span>
                        </div>
                        <div class="radar-task-actions">
                            <button class="btn-action primary" onclick="handleRadarAction('${signal.id}')">${escapeHtml(signal.actionText || 'Ver Detalhes')}</button>
                            <button class="btn-action ghost" onclick="handleRadarIgnore('${signal.id}')">Ignorar</button>
                        </div>
                    </div>
                    <button class="radar-check-btn" onclick="handleRadarCheck('${signal.id}')" title="Marcar como resolvido" aria-label="Marcar tarefa como concluída">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                </div>
            `;
        });

        html += `</div>`;
    });

    container.innerHTML = html;
} // Fecha a função renderRadarSignals

window.handleRadarAction = function(id) {
    // Redireciona para o detalhe do orçamento usando a função nativa do CRM
    if (typeof abrirDetalhesCliente === 'function') {
        // IDs de estoque não correspondem a orçamentos — ignora
        if (id.startsWith('est-')) return;
        // O id_orcamento é um UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
        // Os sinais usam o padrão "{uuid}-{sufixo}" (ex: "-estagnado", "-entrega", "-crosssell").
        // split('-')[0] retornava apenas o 1º segmento do UUID — bug.
        // Solução: remove o sufixo conhecido pelo final, preservando o UUID completo.
        const sufixos = ['-estagnado', '-entrega', '-crosssell'];
        let orcamentoId = id;
        for (const s of sufixos) {
            if (id.endsWith(s)) { orcamentoId = id.slice(0, -s.length); break; }
        }
        abrirDetalhesCliente(orcamentoId);
    }
};

window.handleRadarCheck = function(id) {
    const card = document.getElementById(`radar-card-${id}`);
    if (card) {
        card.classList.add('radar-task-checked');
        setTimeout(() => {
            addConcludedRadarId(id);
            const index = store.radarSignalsData.findIndex(s => s.id === id);
            if (index > -1) store.radarSignalsData[index].ignored = true; // some da lista igual ao "ignorar"

            const select = document.getElementById('sellerFilter');
            renderRadarSignals(select ? select.value : 'Todos');
        }, 450);
    }
};

window.handleRadarIgnore = function(id) {
    const card = document.getElementById(`radar-card-${id}`);
    if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';

        setTimeout(() => {
            addIgnoredRadarId(id);
            const index = store.radarSignalsData.findIndex(s => s.id === id);
            if (index > -1) store.radarSignalsData[index].ignored = true;
            
            const select = document.getElementById('sellerFilter');
            renderRadarSignals(select ? select.value : 'Todos');
        }, 300);
    }
};

async function analisarClienteComIA(idOrcamentoAtual) {
    const btn = document.getElementById('btnFabIA');
    
    if(btn) {
        btn.querySelector('.btn-text').textContent = 'A analisar...';
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.disabled = true;
    }

    try {
        const orc = AppState.contextoVenda.clienteAtual;
        if (!orc) throw new Error('Cliente atual não encontrado no estado.');
        const nomeCliente = orc.clientes?.nome_cliente || 'Cliente';

        // 1. Puxar todos os orçamentos do cliente (Histórico de Compras/Tentativas)
        const { data: todosOrcamentos, error: errOrc } = await db.from('orcamentos')
            .select('id_orcamento, protocolo, valor_orcado, modelo_colchao, data_criacao, data_entrega, status_orcamento(nome)')
            .eq('id_cliente', orc.id_cliente)
            .order('data_criacao', { ascending: false });

        // 2. Puxar todo o histórico (comentários) de TODOS os orçamentos desse cliente
        const idsOrcamentos = (todosOrcamentos || []).map(o => o.id_orcamento);
        let todosComentarios = [];
        if (idsOrcamentos.length > 0) {
            const { data: coms } = await db.from('comentarios')
                .select('texto, tipo, autor, data_criacao')
                .in('id_orcamento', idsOrcamentos)
                .order('data_criacao', { ascending: true });
            todosComentarios = coms || [];
        }

        // 3. Verificar se é pós-venda (status Fechado)
        const statusAtual = orc.status || '';
        const isFechado = statusAtual === 'Fechado';

        // Calcular dias desde a entrega (se houver data_entrega)
        const dataEntrega = orc.data_entrega || null;
        let diasDesdeEntrega = null;
        if (dataEntrega) {
            const hoje = new Date();
            const entrega = new Date(dataEntrega);
            diasDesdeEntrega = Math.floor((hoje - entrega) / (1000 * 60 * 60 * 24));
        }

        // 4. Montar o Dossiê para a IA
        let dossie = `=== DADOS DO CLIENTE ===\n`;
        dossie += `Nome: ${orc.clientes?.nome_cliente || 'Desconhecido'}\n`;
        dossie += `Origem: ${orc.origem || 'Não informada'}\n`;
        dossie += `Interesse: ${orc.interesse || 'Não informado'}\n\n`;

        dossie += `=== ORÇAMENTO ATUAL ===\n`;
        dossie += `Produto(s): ${orc.modelo_colchao || 'Nenhum'}\n`;
        dossie += `Valor: R$ ${orc.valor_orcado}\n`;
        dossie += `Status: ${statusAtual}\n`;

        if (isFechado) {
            dossie += `Data de entrega prevista: ${dataEntrega ? new Date(dataEntrega).toLocaleDateString('pt-BR') : 'Não informada'}\n`;
            dossie += `Dias desde a entrega: ${diasDesdeEntrega !== null ? diasDesdeEntrega + ' dias' : 'Entrega ainda não realizada'}\n`;
            dossie += `MODO: PÓS-VENDA — foco em satisfação, fidelização e indicação. NÃO tente vender nada novo neste momento.\n\n`;
        } else {
            dossie += `\n`;
        }

        dossie += `=== HISTÓRICO DE NEGÓCIOS ===\n`;
        (todosOrcamentos || []).forEach(o => {
            const dataFormatada = new Date(o.data_criacao).toLocaleDateString('pt-BR');
            dossie += `- [${dataFormatada}] Status: ${o.status_orcamento?.nome || '-'} | Valor: R$ ${o.valor_orcado} | Produto: ${o.modelo_colchao}\n`;
        });

        dossie += `\n=== HISTÓRICO DE CONTATOS (TIMELINE) ===\n`;
        todosComentarios.forEach(c => {
            const dataFormatada = new Date(c.data_criacao).toLocaleDateString('pt-BR');
            dossie += `[${dataFormatada}] ${c.autor} (${c.tipo}): ${c.texto}\n`;
        });

        // Validação no Console para Engenharia de Prompt

        // 5. Chamada real ao Groq via Edge Function
        const promptFinal = isFechado
            ? `Analise o dossiê abaixo. Esta é uma venda já realizada. Gere a resposta no formato de pós-venda (Situação Pós-Venda, Ação Recomendada e Mensagem WhatsApp).\n\n${dossie}`
            : `Analise o dossiê abaixo e gere a resposta no formato padrão (Estratégia, Argumentos e Mensagem WhatsApp).\n\n${dossie}`;

        const resposta = await chamarIA(promptFinal);

        if(btn) {
            btn.querySelector('.btn-text').textContent = '✨ Destravar Venda';
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.disabled = false;
        }
        abrirModalChatIA(resposta, nomeCliente);

    } catch (error) {
        console.error("Erro ao analisar cliente:", error);
        if(typeof showToast === 'function') showToast('Erro ao gerar análise da IA.', 'error');
        if(btn) {
            btn.querySelector('.btn-text').textContent = '✨ Destravar Venda';
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.disabled = false;
        }
    }
}

async function chamarIA(prompt, contexto = '') {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error('Usuário não autenticado.');

    const res = await fetch(
        'https://blumqkxwasdbyozdvrsp.supabase.co/functions/v1/gemini-proxy',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ prompt }),
        }
    );

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.text;
}

function abrirModalChatIA(respostaInicial = '') {
    const modal = document.getElementById('modalChatIA');
    if (!modal) return;
    
    // Pega o ID do orçamento atual
    const orc = AppState.contextoVenda.clienteAtual;
    store.currentOrcamentoId = orc?.id_orcamento || null;
    
    // Inicializa as mensagens
    store.chatIAMessages = [];
    
    // Adiciona mensagem inicial da IA se houver resposta
    if (respostaInicial) {
        store.chatIAMessages.push({
            id: Date.now().toString(),
            role: 'assistant',
            content: respostaInicial
        });
    }
    
    // Renderiza as mensagens
    renderizarMensagensChat();
    
    // Abre o modal usando a função padrão
    openModal('modalChatIA');
    
    // Focus no input
    setTimeout(() => {
        const input = document.getElementById('chatInputIA');
        if (input) input.focus();
    }, 200);
}

function fecharModalChatIA() {
    closeModal('modalChatIA');
}

function renderizarMensagensChat() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;
    
    container.innerHTML = store.chatIAMessages.map(msg => {
        const isUser = msg.role === 'user';
        return `
            <div style="display:flex; gap:12px; ${isUser ? 'flex-direction:row-reverse;' : ''}">
                <div style="width:32px; height:32px; border-radius:50%; background:${isUser ? 'linear-gradient(135deg, var(--brand-blue), var(--brand-blue-dark))' : 'linear-gradient(135deg, var(--gold), var(--gold-dark))'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:var(--shadow-xs);">
                    ${isUser 
                        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
                        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>'
                    }
                </div>
                <div style="max-width:75%; padding:12px 16px; border-radius:16px; background:${isUser ? 'linear-gradient(135deg, var(--brand-blue), var(--brand-blue-dark))' : 'var(--card-bg)'}; color:${isUser ? '#fff' : 'var(--text-primary)'}; border:${isUser ? 'none' : '1px solid var(--border-light)'}; box-shadow:var(--shadow-xs);">
                    <div style="font-size:13.5px; line-height:1.6; white-space:pre-wrap;">${formatarMensagemIA(msg.content)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // Auto-scroll para o final
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

function formatarMensagemIA(texto) {
    return texto
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\s*[-•*]\s+/gm, '<li>')
        .replace(/<\/li>(?!\s*<li>)/g, '</li>');
}

async function enviarMensagemChatIA() {
    const input = document.getElementById('chatInputIA');
    const btn = document.getElementById('btnEnviarChatIA');
    
    if (!input || !btn) return;
    
    const texto = input.value.trim();
    if (!texto) return;
    
    // Desabilita botão e mostra loading
    btn.disabled = true;
    btn.style.opacity = '0.6';
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>';
    
    // Adiciona mensagem do usuário
    store.chatIAMessages.push({
        id: Date.now().toString(),
        role: 'user',
        content: texto
    });
    
    input.value = '';
    renderizarMensagensChat();
    
    try {
        // Monta o contexto com o dossiê do cliente
        const orc = AppState.contextoVenda.clienteAtual;
        if (!orc) throw new Error('Cliente atual não encontrado.');
        
        let contexto = `=== CONTEXTO ATUAL ===\n`;
        contexto += `Cliente: ${orc.clientes?.nome_cliente || 'Desconhecido'}\n`;
        contexto += `Produto: ${orc.modelo_colchao || 'Nenhum'}\n`;
        contexto += `Valor: R$ ${orc.valor_orcado}\n`;
        contexto += `Status: ${orc.status}\n\n`;
        
        // Histórico de mensagens do chat
        const historicoChat = store.chatIAMessages.slice(0, -1).map(m => 
            `${m.role === 'user' ? 'Usuário' : 'IA'}: ${m.content}`
        ).join('\n');
        
        const promptFinal = `${contexto}\n=== HISTÓRICO DA CONVERSA ===\n${historicoChat}\n\nÚltima mensagem do usuário: ${texto}\n\nResponda de forma útil e objetiva como assistente de vendas especializado em colchões.`;
        
        const resposta = await chamarIA(promptFinal);
        
        // Adiciona resposta da IA
        store.chatIAMessages.push({
            id: Date.now().toString(),
            role: 'assistant',
            content: resposta
        });
        
        renderizarMensagensChat();
        
    } catch (error) {
        console.error("Erro ao enviar mensagem:", error);
        if(typeof showToast === 'function') showToast('Erro ao enviar mensagem.', 'error');
        
        // Adiciona mensagem de erro
        store.chatIAMessages.push({
            id: Date.now().toString(),
            role: 'assistant',
            content: 'Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente.'
        });
        renderizarMensagensChat();
    } finally {
        // Restaura botão
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.innerHTML = originalText;
        input.focus();
    }
}

export { abrirModalChatIA, addConcludedRadarId, addIgnoredRadarId, analisarClienteComIA, carregarSinaisRadar, chamarIA, enviarMensagemChatIA, fecharModalChatIA, formatDateForDisplay, formatarMensagemIA, getConcludedRadarIds, getIgnoredRadarIds, getMeuRadarBlockHtml, initMeuRadar, renderRadarSignals, renderizarMensagensChat };
