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
        <div class="section-header">
            <h2 class="section-title">Meu Radar</h2>
            <div class="header-actions">
                <div class="radar-chips" id="radarChips">
                    <button type="button" class="radar-chip" data-tipo="alert" onclick="toggleRadarChip('alert')" title="Filtrar Alertas">
                        <span class="radar-chip-label">Alertas</span><span class="radar-chip-sep">·</span><span class="radar-chip-count" id="count-alerts">0</span>
                    </button>
                    <button type="button" class="radar-chip" data-tipo="tip" onclick="toggleRadarChip('tip')" title="Filtrar Dicas">
                        <span class="radar-chip-label">Dicas</span><span class="radar-chip-sep">·</span><span class="radar-chip-count" id="count-tips">0</span>
                    </button>
                    <button type="button" class="radar-chip" data-tipo="suggestion" onclick="toggleRadarChip('suggestion')" title="Filtrar Sugestões">
                        <span class="radar-chip-label">Sugestões</span><span class="radar-chip-sep">·</span><span class="radar-chip-count" id="count-suggestions">0</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="radar-card">
            <div class="radar-card-header">
                <div class="radar-card-header-left">
                    <span class="radar-total" id="radarTotal">--</span>
                    <span class="radar-resumo" id="radarResumo">sinais</span>
                </div>
                <span class="radar-updated" id="radarUpdated"></span>
            </div>
            <div id="signalContainer"></div>
            <div class="radar-card-footer" id="radarCardFooter">
                <span class="radar-rodape" id="radarRodape"></span>
                <button class="radar-ver-historico" onclick="navigateTo('carteira')">Ver histórico</button>
            </div>
        </div>

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

// Usado pelo botão "Desfazer" do toast — reverte addIgnoredRadarId.
function removerIgnoredRadarId(idOrcamento) {
    const ignored = getIgnoredRadarIds().filter(id => id !== idOrcamento);
    sessionStorage.setItem('radar_ignorados', JSON.stringify(ignored));
}

// Concluídos têm TTL de 7 dias — depois voltam a aparecer caso o problema persista.
// Formato interno: [{id, ts}] (novo) ou string[] (legado, migrado na próxima gravação).
const CONCLUIDOS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getConcludedRadarIds() {
    try {
        const stored = localStorage.getItem('radar_concluidos');
        if (!stored) return [];
        const parsed = JSON.parse(stored);

        // Formato legado (array de strings) — sem TTL, retorna direto
        if (parsed.length > 0 && typeof parsed[0] === 'string') return parsed;

        // Novo formato [{id, ts}] — filtra expirados e compacta
        const agora = Date.now();
        const validos = parsed.filter(e => agora - (e.ts || 0) < CONCLUIDOS_TTL_MS);
        if (validos.length !== parsed.length) {
            localStorage.setItem('radar_concluidos', JSON.stringify(validos));
        }
        return validos.map(e => e.id);
    } catch { return []; }
}

function addConcludedRadarId(id) {
    try {
        const stored = localStorage.getItem('radar_concluidos');
        let lista = stored ? JSON.parse(stored) : [];
        // Migra formato legado
        if (lista.length > 0 && typeof lista[0] === 'string') {
            lista = lista.map(oldId => ({ id: oldId, ts: Date.now() }));
        }
        if (!lista.some(e => e.id === id)) {
            lista.push({ id, ts: Date.now() });
            localStorage.setItem('radar_concluidos', JSON.stringify(lista));
        }
    } catch {}
}

// Usado pelo botão "Desfazer" do toast — reverte addConcludedRadarId.
function removerConcludedRadarId(id) {
    try {
        const stored = localStorage.getItem('radar_concluidos');
        if (!stored) return;
        const lista = JSON.parse(stored);
        // Suporta ambos os formatos
        const nova = lista.filter(e => (typeof e === 'string' ? e : e.id) !== id);
        localStorage.setItem('radar_concluidos', JSON.stringify(nova));
    } catch {}
}

async function carregarSinaisRadar() {
    const hojeIso = getHojeBrasilia();
    const hoje = new Date(`${hojeIso}T00:00:00`);

    store.radarSignalsData = [];
    const ignoredIds = [...getIgnoredRadarIds(), ...getConcludedRadarIds()];

    try {
        // ── Busca paralela: orçamentos + estoque ─────────────────────────────
        const [{ data: orcamentos, error: errOrc }, { data: estoque }] = await Promise.all([
            db.from('orcamentos').select(`
                id_orcamento, protocolo, data_criacao, data_contato, data_entrega,
                ligacao_confirmada, valor_orcado, modelo_colchao,
                clientes(nome_cliente), usuarios(nome), status_orcamento(nome)
            `),
            // Busca até qtd 2 para cobrir tanto zerado quanto baixo numa única query
            db.from('estoque')
              .select('id_produto, codigo_produto, nome_produto, qtd_disponivel')
              .lte('qtd_disponivel', 2),
        ]);

        // ── Regra 1: Ruptura de estoque (zerado) ─────────────────────────────
        // e prepara mapa de produtos com estoque baixo (1-2 un.) para Regra 7
        const produtosBaixoEstoque = new Map(); // nome_produto.lower → {nome, qtd}
        if (estoque) {
            estoque.forEach(item => {
                const nomeLower = item.nome_produto.toLowerCase();
                if (item.qtd_disponivel <= 0) {
                    const signalId = 'est-' + item.id_produto;
                    if (!ignoredIds.includes(signalId)) {
                        store.radarSignalsData.push({
                            id: signalId,
                            seller: 'Todos',
                            type: 'alert',
                            priority: 'high',
                            message: `Ruptura de estoque: ${item.nome_produto}`,
                            leadName: item.codigo_produto || '',
                            time: 'Hoje',
                            justification: `Produto zerado. Acione compras ou fornecedor com urgência para não travar vendas em andamento.`,
                            actionText: 'Ver Estoque',
                            executed: false,
                            ignored: false
                        });
                    }
                } else {
                    // qtd 1-2: candidato ao alerta de estoque baixo (Regra 7)
                    produtosBaixoEstoque.set(nomeLower, { nome: item.nome_produto, qtd: item.qtd_disponivel });
                }
            });
        }

        if (errOrc || !orcamentos) return;

        // SLA em dias por fase (quanto tempo é considerado normal naquela etapa)
        const SLAs = { 'Contato Inicial': 2, 'Negociação': 5, 'Em Fechamento': 3 };

        orcamentos.forEach(orc => {
            const statusNome   = orc.status_orcamento?.nome || '';
            const isFechado    = statusNome === 'Fechado' || statusNome === 'Vendido';
            const isPerdido    = statusNome === 'Perdido' || statusNome === 'Declinado';
            const nomeCliente  = orc.clientes?.nome_cliente || 'Cliente';
            const nomeVendedor = orc.usuarios?.nome || '';

            const dataCriacao = orc.data_criacao ? new Date(orc.data_criacao) : null;

            // data_contato = data agendada para o próximo contato/retorno.
            // Nos fechados com entrega, o RPC seta data_contato = data_entrega
            // (confirmação de recebimento) — ignoramos ela fora do contexto de entrega.
            const dataContato = (!isFechado && orc.data_contato)
                ? new Date(`${orc.data_contato}T00:00:00`)
                : null;

            // Dias desde o retorno agendado (positivo = vencido, 0 = hoje, negativo = futuro)
            const diasRetornoVencido = dataContato
                ? Math.floor((hoje - dataContato) / (1000 * 60 * 60 * 24))
                : null;

            // Dias desde a criação — usado como fallback para estagnamento
            const diffCriacao = dataCriacao
                ? Math.floor((hoje - dataCriacao) / (1000 * 60 * 60 * 24))
                : 0;

            // ────────────────────────────────────────────────────────────────
            // REGRAS PARA ORÇAMENTOS FECHADOS
            // ────────────────────────────────────────────────────────────────
            if (isFechado) {
                // Regra 2: Dia de entrega hoje
                const idEntrega = orc.id_orcamento + '-entrega';
                if (orc.data_entrega === hojeIso && !ignoredIds.includes(idEntrega)) {
                    store.radarSignalsData.push({
                        id: idEntrega, protocolo: orc.protocolo || null, seller: nomeVendedor,
                        type: 'alert', priority: 'high',
                        message: 'Dia de entrega: confirme o recebimento!',
                        leadName: nomeCliente, time: 'Hoje',
                        justification: 'Entrega programada para hoje. Contate o cliente para confirmar que tudo chegou certo e registre o feedback.',
                        actionText: 'Abrir Pedido', executed: false, ignored: false
                    });
                }

                // Regra 5: Entrega próxima (1-3 dias) sem ligação de confirmação
                const idEntregaProx = orc.id_orcamento + '-entrega-proximo';
                if (orc.data_entrega && orc.data_entrega !== hojeIso && !orc.ligacao_confirmada && !ignoredIds.includes(idEntregaProx)) {
                    const dataEntregaObj = new Date(`${orc.data_entrega}T00:00:00`);
                    const diasParaEntrega = Math.floor((dataEntregaObj - hoje) / (1000 * 60 * 60 * 24));
                    if (diasParaEntrega >= 1 && diasParaEntrega <= 3) {
                        const qtdDias = diasParaEntrega === 1 ? 'amanhã' : `em ${diasParaEntrega} dias`;
                        store.radarSignalsData.push({
                            id: idEntregaProx, protocolo: orc.protocolo || null, seller: nomeVendedor,
                            type: 'alert', priority: 'high',
                            message: `Confirmar entrega ${qtdDias}.`,
                            leadName: nomeCliente,
                            time: dataEntregaObj.toLocaleDateString('pt-BR'),
                            justification: `Entrega ${qtdDias} e a ligação de confirmação ainda não foi feita. Contate o cliente para garantir que está esperando.`,
                            actionText: 'Confirmar Entrega', executed: false, ignored: false
                        });
                    }
                }

                // Regra 6: Pós-venda — verificar satisfação (3 a 7 dias após entrega)
                const idPosVenda = orc.id_orcamento + '-pos-venda';
                if (orc.data_entrega && !ignoredIds.includes(idPosVenda)) {
                    const dataEntregaObj = new Date(`${orc.data_entrega}T00:00:00`);
                    const diasDesdeEntrega = Math.floor((hoje - dataEntregaObj) / (1000 * 60 * 60 * 24));
                    if (diasDesdeEntrega >= 3 && diasDesdeEntrega <= 7) {
                        store.radarSignalsData.push({
                            id: idPosVenda, protocolo: orc.protocolo || null, seller: nomeVendedor,
                            type: 'suggestion', priority: 'low',
                            message: 'Pós-venda: verificar satisfação.',
                            leadName: nomeCliente,
                            time: formatDateForDisplay(dataEntregaObj),
                            justification: `Cliente recebeu há ${diasDesdeEntrega} dias. Ligue para verificar satisfação, resolver dúvidas e pedir indicações.`,
                            actionText: 'Ligar para cliente', executed: false, ignored: false
                        });
                    }
                }

                return; // Nenhuma regra de funil ativo se aplica a fechados
            }

            // ────────────────────────────────────────────────────────────────
            // REGRAS PARA FUNIL ATIVO (não Fechado, não Perdido)
            // ────────────────────────────────────────────────────────────────
            if (isPerdido) return;

            const produtosStr = (orc.modelo_colchao || '').toLowerCase();

            // Regra 2b: Retorno prometido vencido (data_contato passou, orçamento ativo)
            // Esta é a regra mais crítica: o cliente estava esperando uma ligação.
            const idRetorno = orc.id_orcamento + '-retorno';
            if (diasRetornoVencido !== null && diasRetornoVencido > 0 && !ignoredIds.includes(idRetorno)) {
                store.radarSignalsData.push({
                    id: idRetorno, protocolo: orc.protocolo || null, seller: nomeVendedor,
                    type: 'alert', priority: 'critical',
                    message: `Retorno vencido há ${diasRetornoVencido} dia${diasRetornoVencido > 1 ? 's' : ''}.`,
                    leadName: nomeCliente,
                    time: formatDateForDisplay(dataContato),
                    justification: `Contato estava agendado para ${dataContato.toLocaleDateString('pt-BR')} e não foi realizado. O cliente pode estar sendo abordado pela concorrência.`,
                    actionText: 'Ligar agora', executed: false, ignored: false
                });
            }

            // Regra 2c: Em Fechamento crítico sem data de retorno agendada
            // (Se há data_contato vencida, a Regra 2b já cobre — evita duplicata)
            const idFechamentoCritico = orc.id_orcamento + '-fechamento-critico';
            if (statusNome === 'Em Fechamento' && diasRetornoVencido === null && diffCriacao > 2 && !ignoredIds.includes(idFechamentoCritico)) {
                store.radarSignalsData.push({
                    id: idFechamentoCritico, protocolo: orc.protocolo || null, seller: nomeVendedor,
                    type: 'alert', priority: 'critical',
                    message: `Em Fechamento há ${diffCriacao} dias sem contato.`,
                    leadName: nomeCliente,
                    time: formatDateForDisplay(dataCriacao),
                    justification: `Estágio mais crítico do funil. Orçamento há ${diffCriacao} dias em Fechamento sem retorno agendado. Risco alto de perder a venda.`,
                    actionText: 'Fechar Venda', executed: false, ignored: false
                });
            }

            // Regra 3: Estagnado no funil
            // Usa data_contato como referência quando disponível (mais preciso que data_criacao);
            // Não dispara para "Em Fechamento" — a Regra 2c já é mais específica.
            const idEstagnado = orc.id_orcamento + '-estagnado';
            const slaFase = SLAs[statusNome] || 3;
            // Referência: data mais recente entre contato agendado (se futuro/hoje) e criação
            const diasEstagnado = (diasRetornoVencido !== null && diasRetornoVencido <= 0)
                ? Math.abs(diasRetornoVencido)   // contato futuro: conta a partir da criação
                : diffCriacao;
            if (diasEstagnado > slaFase * 1.5 && statusNome !== 'Em Fechamento' && !ignoredIds.includes(idEstagnado)) {
                const valorFmt = parseFloat(orc.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                const refLabel = dataContato ? `contato agendado para ${dataContato.toLocaleDateString('pt-BR')}` : `criado há ${diffCriacao}d`;
                store.radarSignalsData.push({
                    id: idEstagnado, protocolo: orc.protocolo || null, seller: nomeVendedor,
                    type: 'tip', priority: 'medium',
                    message: `Oportunidade parada em ${statusNome}.`,
                    leadName: nomeCliente,
                    time: formatDateForDisplay(dataContato || dataCriacao),
                    justification: `R$ ${valorFmt} sem avanço (SLA desta fase: ${slaFase}d; ${refLabel}). Faça contato ou reclassifique a oportunidade.`,
                    actionText: 'Fazer Follow-up', executed: false, ignored: false
                });
            }

            // Regra 4: Cross-sell — colchão/cama em Fechamento sem acessórios
            const idCross = orc.id_orcamento + '-crosssell';
            const temCamaColchao = produtosStr.includes('colchão') || produtosStr.includes('colchao')
                || produtosStr.includes('cama') || produtosStr.includes('box');
            const temAcessorios = produtosStr.includes('protetor') || produtosStr.includes('travesseiro');
            if (temCamaColchao && !temAcessorios && statusNome === 'Em Fechamento' && !ignoredIds.includes(idCross)) {
                store.radarSignalsData.push({
                    id: idCross, protocolo: orc.protocolo || null, seller: nomeVendedor,
                    type: 'suggestion', priority: 'low',
                    message: 'Venda sem acessórios detectada.',
                    leadName: nomeCliente, time: 'Hoje',
                    justification: 'Cliente em fechamento de colchão/cama sem protetor ou travesseiro. Ofereça um combo para aumentar o ticket médio.',
                    actionText: 'Oferecer Combo', executed: false, ignored: false
                });
            }

            // Regra 7: Produto cotado com estoque crítico (1-2 unidades)
            // Compara palavras do nome do produto cadastrado no estoque com modelo_colchao
            const idEstoqueBaixo = orc.id_orcamento + '-estoque-baixo';
            if (produtosStr && produtosBaixoEstoque.size > 0 && !ignoredIds.includes(idEstoqueBaixo)) {
                let prodEncontrado = null;
                for (const [nomeLower, info] of produtosBaixoEstoque.entries()) {
                    // Usa palavras com ≥ 4 chars para evitar matches ruins (ex: "de", "com")
                    const palavras = nomeLower.split(/\s+/).filter(p => p.length >= 4);
                    if (palavras.length > 0 && palavras.some(p => produtosStr.includes(p))) {
                        prodEncontrado = info;
                        break;
                    }
                }
                if (prodEncontrado) {
                    store.radarSignalsData.push({
                        id: idEstoqueBaixo, protocolo: orc.protocolo || null, seller: nomeVendedor,
                        type: 'alert', priority: 'high',
                        message: 'Estoque baixo do produto cotado.',
                        leadName: nomeCliente, time: 'Hoje',
                        justification: `"${prodEncontrado.nome}" tem apenas ${prodEncontrado.qtd} unidade(s) em estoque e consta nesta proposta. Feche antes que acabe.`,
                        actionText: 'Ver Estoque', executed: false, ignored: false
                    });
                }
            }

            // Regra 8: Orçamento sem valor definido (impossível calcular funil/meta)
            const idSemValor = orc.id_orcamento + '-sem-valor';
            const valorOrcado = parseFloat(orc.valor_orcado ?? 0);
            if ((valorOrcado === 0 || isNaN(valorOrcado)) && !ignoredIds.includes(idSemValor)) {
                store.radarSignalsData.push({
                    id: idSemValor, protocolo: orc.protocolo || null, seller: nomeVendedor,
                    type: 'tip', priority: 'low',
                    message: 'Orçamento sem valor definido.',
                    leadName: nomeCliente,
                    time: formatDateForDisplay(dataCriacao),
                    justification: 'Sem valor não é possível calcular o funil nem a meta com precisão. Edite o orçamento e adicione o ticket estimado.',
                    actionText: 'Editar Orçamento', executed: false, ignored: false
                });
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

// Toast com botão "Desfazer" pra concluir/ignorar um sinal do Radar — não usa
// showToast() (ui.js) de propósito: aquela função é genérica, sem botão de ação,
// usada em ~20 lugares do app, e mexer nela pra suportar um botão mudaria o
// comportamento de todos os outros toasts. Este aqui reaproveita o mesmo
// #toast-container e a mesma classe .toast (visual idêntico), só que com um
// botão extra e ficando na tela um pouco mais (a ação some da lista antes do
// toast — a pessoa precisa de tempo pra perceber e decidir se quer desfazer).
function mostrarToastDesfazerRadar(mensagem, aoDesfazer) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast info toast-desfazer';
    toast.innerHTML = `
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>${escapeHtml(mensagem)}</span>
        <button type="button">Desfazer</button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const remover = () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); };
    const timer = setTimeout(remover, 5000);
    toast.querySelector('button').onclick = () => {
        clearTimeout(timer);
        remover();
        aoDesfazer();
    };
}

async function initMeuRadar() {
    // Carrega os sinais reais do Supabase primeiro — a query já vem escopada ao
    // usuário logado via RLS (login + senha definem o dono dos dados), então não
    // existe mais filtro de vendedor no cliente: o radar é sempre pessoal.
    await carregarSinaisRadar();

    // Filtro por categoria (chips) começa sempre zerado a cada visita à tela —
    // ver toggleRadarChip/renderRadarSignals.
    store.radarChipFiltro = new Set();

    renderRadarSignals();
}

function renderRadarSignals() {
    const container = document.getElementById('signalContainer');
    const emptyState = document.getElementById('emptyState');
    if(!container) return;

    const chipFiltro = store.radarChipFiltro || (store.radarChipFiltro = new Set());
    const ordemPrioridade = { critical: 0, high: 1, medium: 2, low: 3 };

    // Base: todos os sinais não-ignorados do usuário logado (RLS já garante que só
    // vêm dados dele). As contagens dos chips usam essa base inteira — não encolhem
    // quando um chip filtra a lista, senão o usuário perderia a noção do total.
    const base = store.radarSignalsData.filter(s => !s.ignored);
    const contagens = {
        alert: base.filter(s => s.type === 'alert').length,
        tip: base.filter(s => s.type === 'tip').length,
        suggestion: base.filter(s => s.type === 'suggestion').length
    };

    // Lista visível: se algum chip está ativo, mostra só as categorias marcadas;
    // sem nenhum chip ativo (estado inicial), mostra tudo.
    const filtered = base
        .filter(s => chipFiltro.size === 0 || chipFiltro.has(s.type))
        .sort((a, b) => (ordemPrioridade[a.priority] ?? 4) - (ordemPrioridade[b.priority] ?? 4));

    // Atualiza contagem + estado visual (ativo / contagem zero) de cada chip
    document.querySelectorAll('#radarChips .radar-chip').forEach(chip => {
        const tipo = chip.dataset.tipo;
        const n = contagens[tipo] || 0;
        const countEl = chip.querySelector('.radar-chip-count');
        if (countEl) countEl.textContent = n;
        chip.classList.toggle('active', chipFiltro.has(tipo));
        chip.classList.toggle('count-zero', n === 0);
    });

    const radarCard = document.querySelector('.radar-card');

    if (filtered.length === 0) {
        container.innerHTML = '';
        if (radarCard) radarCard.style.display = 'none';
        if(emptyState) emptyState.style.display = 'block';
        return;
    }

    if (radarCard) radarCard.style.display = '';
    if(emptyState) emptyState.style.display = 'none';

    // Atualiza o header do card (total + resumo + hora)
    const totalEl    = document.getElementById('radarTotal');
    const resumoEl   = document.getElementById('radarResumo');
    const updatedEl  = document.getElementById('radarUpdated');
    const rodapeEl   = document.getElementById('radarRodape');
    const criticos   = filtered.filter(s => s.priority === 'critical').length;
    if (totalEl)   totalEl.textContent  = String(filtered.length).padStart(2, '0');
    if (resumoEl)  resumoEl.textContent = (filtered.length === 1 ? 'sinal aberto' : 'sinais abertos')
                                          + (criticos ? ` · ${criticos} exige ação hoje` : '');
    if (updatedEl) updatedEl.textContent = 'atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (rodapeEl)  rodapeEl.textContent  = chipFiltro.size > 0
        ? 'Filtro ativo — alguns sinais estão ocultos'
        : 'Sinais gerados automaticamente a partir dos seus orçamentos';

    // Mapeamento tipo → badge visual (label, cores e dot)
    const tipoInfo = {
        alert:      { label: 'Alerta',   bg: 'rgba(251,238,238,1)',   fg: '#A93A3A', catColor: '#D65C5C' },
        tip:        { label: 'Dica',     bg: 'rgba(30,58,95,0.06)',   fg: '#1E3A5F', catColor: '#2C5282' },
        suggestion: { label: 'Sugestão', bg: 'rgba(30,158,110,0.08)', fg: '#167A56', catColor: '#1E9E6E' }
    };

    let html = '<ul class="radar-list">';

    filtered.forEach(signal => {
        const info      = tipoInfo[signal.type] || tipoInfo.tip;
        const isEstoque = signal.id.startsWith('est-');
        const isCritical = signal.priority === 'critical';
        // Clique na linha abre os detalhes — exceto sinais de estoque.
        const clickRow   = !isEstoque ? ` onclick="handleRadarAction('${signal.id}')"` : '';
        // Stripe colorida na borda esquerda só pra critical (inset box-shadow)
        const stripe     = isCritical ? `box-shadow: inset 3px 0 0 ${info.catColor};` : '';
        // Descrição contextual: cliente · justificativa (tooltip = texto completo)
        const descInline = [signal.leadName, signal.justification].filter(Boolean).join(' · ');
        const tituloCompleto = escapeHtml(signal.message || '') + (descInline ? ' — ' + escapeHtml(descInline) : '');

        html += `
            <li class="radar-row" id="radar-card-${signal.id}" data-tipo="${signal.type}" data-prioridade="${signal.priority || 'low'}" style="${stripe}"${clickRow}>
                <button class="radar-check" onclick="event.stopPropagation(); handleRadarCheck('${signal.id}')" title="Marcar como resolvido" aria-label="Marcar sinal como concluído"></button>
                <div class="radar-content">
                    <div class="radar-content-top">
                        <span class="radar-title">${escapeHtml(signal.message || '')}</span>
                        ${isCritical ? '<span class="radar-urgente-badge">urgente</span>' : ''}
                    </div>
                    <span class="radar-desc-truncated" title="${tituloCompleto}">${escapeHtml(descInline)}</span>
                </div>
                <span class="radar-tipo-badge" style="background:${info.bg}; color:${info.fg};">
                    <span class="radar-tipo-dot" style="background:${info.catColor};"></span>${info.label}
                </span>
                <span class="radar-protocolo">${signal.protocolo ? escapeHtml(signal.protocolo) : ''}</span>
                <time class="radar-date">${escapeHtml(signal.time || '')}</time>
                <span class="radar-arrow" onclick="event.stopPropagation(); handleRadarIgnore('${signal.id}')" title="Ignorar" aria-label="Ignorar sinal">&#x203A;</span>
            </li>
        `;
    });

    html += '</ul>';
    container.innerHTML = html;

    ajustarAlturaRadarScroll(container);
} // Fecha a função renderRadarSignals

// Limita a visualização do Meu Radar a 7 notificações por vez: mede a altura real
// renderizada dos 7 primeiros cards (que varia conforme têm ou não justificativa) e
// usa isso como max-height do container, ativando rolagem para o restante.
const LIMITE_SINAIS_VISIVEIS = 7;
function ajustarAlturaRadarScroll(container) {
    container.style.maxHeight = '';
    container.classList.remove('radar-scrollable');

    const cards = container.querySelectorAll('.radar-row');
    if (cards.length <= LIMITE_SINAIS_VISIVEIS) return;

    const ultimoVisivel = cards[LIMITE_SINAIS_VISIVEIS - 1];
    // getBoundingClientRect (em vez de offsetTop) porque offsetTop é relativo ao
    // offsetParent posicionado mais próximo, que pode não ser o próprio container.
    const alturaVisivel = ultimoVisivel.getBoundingClientRect().bottom - container.getBoundingClientRect().top;

    container.style.maxHeight = `${Math.ceil(alturaVisivel)}px`;
    container.classList.add('radar-scrollable');
}

window.handleRadarAction = function(id) {
    // Redireciona para o detalhe do orçamento usando a função nativa do CRM
    if (typeof abrirDetalhesCliente === 'function') {
        // IDs de estoque não correspondem a orçamentos — ignora
        if (id.startsWith('est-')) return;
        // O id_orcamento é um UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
        // Os sinais usam o padrão "{uuid}-{sufixo}" (ex: "-estagnado", "-entrega", "-crosssell").
        // split('-')[0] retornava apenas o 1º segmento do UUID — bug.
        // Solução: remove o sufixo conhecido pelo final, preservando o UUID completo.
        const sufixos = [
            '-estagnado', '-entrega', '-crosssell',
            '-retorno', '-fechamento-critico', '-entrega-proximo',
            '-pos-venda', '-sem-valor', '-estoque-baixo',
        ];
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
        // .done = opacity reduzida + risco no texto (lê como "concluído", diferente
        // do fade completo do "ignorar" logo abaixo — semânticas diferentes).
        card.classList.add('done');
        const signal = store.radarSignalsData.find(s => s.id === id);
        setTimeout(() => {
            addConcludedRadarId(id);
            const index = store.radarSignalsData.findIndex(s => s.id === id);
            if (index > -1) store.radarSignalsData[index].ignored = true; // some da lista igual ao "ignorar"

            renderRadarSignals();

            mostrarToastDesfazerRadar(`Concluído: ${signal?.message || 'sinal'}`, () => {
                removerConcludedRadarId(id);
                const idx = store.radarSignalsData.findIndex(s => s.id === id);
                if (idx > -1) store.radarSignalsData[idx].ignored = false;
                renderRadarSignals();
            });
        }, 300);
    }
};

// Chip de categoria (Urgentes/Dicas/Ações) funciona como filtro multi-seleção da
// lista abaixo: clique ativa/desativa aquela categoria; com nenhum chip ativo,
// mostra tudo (estado inicial). Ver renderRadarSignals, que lê store.radarChipFiltro.
window.toggleRadarChip = function(tipo) {
    if (!store.radarChipFiltro) store.radarChipFiltro = new Set();
    if (store.radarChipFiltro.has(tipo)) store.radarChipFiltro.delete(tipo);
    else store.radarChipFiltro.add(tipo);
    renderRadarSignals();
};

window.handleRadarIgnore = function(id) {
    const card = document.getElementById(`radar-card-${id}`);
    if (card) {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        const signal = store.radarSignalsData.find(s => s.id === id);

        setTimeout(() => {
            addIgnoredRadarId(id);
            const index = store.radarSignalsData.findIndex(s => s.id === id);
            if (index > -1) store.radarSignalsData[index].ignored = true;

            renderRadarSignals();

            mostrarToastDesfazerRadar(`Ignorado: ${signal?.message || 'sinal'}`, () => {
                removerIgnoredRadarId(id);
                const idx = store.radarSignalsData.findIndex(s => s.id === id);
                if (idx > -1) store.radarSignalsData[idx].ignored = false;
                renderRadarSignals();
            });
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
