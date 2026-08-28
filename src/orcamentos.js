// ═══════════════════════════════════════════════════════════════
// Módulo: orcamentos.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { detectClientePK } from './clientes.js';
import { atualizarIndicadorDigitacao, renderComentariosHtml, salvarComentario, salvarObservacaoFixa } from './comentarios.js';
import { STATUS } from './constants.js';
import { analisarClienteComIA } from './radar.js';
import { navigateTo } from './router.js';
import { AppState, podeCriarOrcamento, setClienteAtual, store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, hideLoader, openModal, showLoader, showToast } from './ui.js';
import { addDiasBrasilia, classToFormatStatus, escapeHtml, formatCurrency, getAgoraBrasiliaISO, getHojeBrasilia, parseCurrency, removerCodigoProduto, setUltimaVisita, validateField } from './utils.js';

        async function carregarProdutos() {
    try {
        const { data, error } = await db.from('produtos').select('id_produto, codigo, nome_produto').order('nome_produto');
        if (error) {
            console.error('Supabase erro em produtos:', error.code, error.message, error.details, error.hint);
            showToast('Erro ao carregar produtos: ' + (error.message || error.code), 'error');
            return;
        }
        if (data) {
            store.todosProdutos = data.map(p => ({
                id_produto: p.id_produto,
                codigo: p.codigo || '',
                nome: p.nome_produto || ''
            })).filter(p => p.nome.trim() !== '');
        }
    } catch (e) {
        console.error('Erro ao carregar tabela de produtos:', e);
        showToast('Erro inesperado ao carregar produtos', 'error');
    }
}

        function _ajusteBuildSelectOpts(valorSelecionado) {
            let opts = '<option value="">Selecione um produto</option>';
            store.todosProdutos.forEach(p => {
                const texto = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                const sel = texto === valorSelecionado ? ' selected' : '';
                opts += `<option value="${escapeHtml(texto)}"${sel}>${escapeHtml(texto)}</option>`;
            });
            return opts;
        }

        function ajusteRecalcularTotal() {
            let total = 0;
            document.querySelectorAll('#ajusteProdutosContainer .ajuste-input-por').forEach(inp => {
                total += parseCurrency(inp.value);
            });
            const el = document.getElementById('ajusteDisplayTotal');
            if (el) el.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            return total;
        }

        function ajusteValidarDesconto(input) {
            let v = parseFloat((input.value || '0').replace(',', '.'));
            if (isNaN(v) || v < 0) v = 0;
            if (v > 100) v = 100;
            input.value = v === 0 ? '' : v;
        }

        function ajusteRecalcularLinha(el) {
            const row = el.closest('.produto-row');
            if (!row) return;
            const deInput = row.querySelector('.ajuste-input-de');
            const descInput = row.querySelector('.ajuste-input-desc');
            const porInput = row.querySelector('.ajuste-input-por');
            const de = parseCurrency(deInput?.value || '0');
            const desc = Math.min(100, Math.max(0, parseFloat((descInput?.value || '0').replace(',', '.')) || 0));
            const por = de * (1 - desc / 100);
            if (porInput) porInput.value = 'R$ ' + por.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            ajusteRecalcularTotal();
        }

        function _ajusteAtualizarLixeiras() {
            const btns = document.querySelectorAll('#ajusteProdutosContainer .btn-remove-item');
            const disable = btns.length === 1;
            btns.forEach(b => { b.style.opacity = disable ? '0.3' : '1'; b.style.pointerEvents = disable ? 'none' : 'auto'; });
        }

        function ajusteAdicionarLinha(nomePre = '', valorDePre = '', valorDescPre = '') {
            const container = document.getElementById('ajusteProdutosContainer');
            const row = document.createElement('div');
            row.className = 'produto-row';
            row.innerHTML = `
                <div class="produto-row-top">
                    <select class="form-input prod-nome">
                        ${_ajusteBuildSelectOpts(nomePre)}
                    </select>
                    <button type="button" class="btn-remove-item" onclick="this.closest('.produto-row').remove(); ajusteRecalcularTotal(); _ajusteAtualizarLixeiras();" title="Remover item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
                <div class="produto-row-bottom ajuste-row-bottom">
                    <div>
                        <div class="produto-row-label">De</div>
                        <input type="text" class="form-input input-de font-data ajuste-input-de" placeholder="R$ 0,00" inputmode="decimal"
                            value="${escapeHtml(valorDePre)}"
                            oninput="this.value = formatCurrency(this.value); ajusteRecalcularLinha(this);">
                    </div>
                    <div class="ajuste-desc-wrapper">
                        <div class="produto-row-label">% Desc.</div>
                        <div class="ajuste-desc-input-group">
                            <input type="number" class="form-input ajuste-input-desc" placeholder="0" min="0" max="100" step="0.1"
                                value="${escapeHtml(valorDescPre)}"
                                oninput="ajusteValidarDesconto(this); ajusteRecalcularLinha(this);">
                            <span class="ajuste-desc-sign">%</span>
                        </div>
                    </div>
                    <div>
                        <div class="produto-row-label">Por</div>
                        <input type="text" class="form-input input-por font-data ajuste-input-por" placeholder="R$ 0,00" inputmode="decimal" readonly tabindex="-1"
                            title="Calculado automaticamente a partir de 'De' e '% Desc.'">
                    </div>
                </div>`;
            container.appendChild(row);
            ajusteRecalcularLinha(row.querySelector('.ajuste-input-de'));
            _ajusteAtualizarLixeiras();
        }

        function abrirAjusteProposta() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) return;

            const isVendedor = store.currentUser.perfil === 'Vendedor';
            const isOpenStatus = [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(orc.status);
            const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';

            // Trava de segurança para Vendedor em orçamentos fechados/perdidos
            if (isVendedor && !isOpenStatus) {
                showToast('Propostas fechadas ou perdidas não podem ser editadas.', 'error');
                return;
            }

            // Limpa container e campos
            document.getElementById('ajusteProdutosContainer').innerHTML = '';
            document.getElementById('ajusteMotivo').value = '';
            document.getElementById('ajustePropostaMsg').textContent = '';

            // Subtitle contextual
            const alertaStatus = (!isOpenStatus && isGerente)
                ? `⚠️ Atenção: este orçamento está "${orc.status}". A alteração ficará registrada no histórico.`
                : `Editando proposta · ${escapeHtml(orc.clientes?.nome_cliente || 'cliente')} · ${escapeHtml(orc.status)}`;
            document.getElementById('ajustePropostaSubtitle').textContent = alertaStatus;

            // Workaround: reconstrói linhas a partir da string modelo_colchao
            const produtosStr = orc.modelo_colchao || '';
            const produtos = produtosStr.split(',').map(p => p.trim()).filter(Boolean);
            const valorTotal = parseFloat(orc.valor_orcado || 0);
            const umSoProduto = produtos.length === 1;

            if (produtos.length === 0) {
                // Nenhum produto salvo: cria linha em branco
                ajusteAdicionarLinha();
            } else {
                produtos.forEach((nome, i) => {
                    // Se só há 1 produto, pré-popula o "DE" com o total (sem desconto aplicado ainda)
                    const valorDe = (umSoProduto && i === 0)
                        ? 'R$ ' + valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                        : '';
                    ajusteAdicionarLinha(nome, valorDe, '');
                });
            }

            openModal('modalAjusteProposta');
        }

        async function salvarAjusteProposta() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) return;

            const container = document.getElementById('ajusteProdutosContainer');
            const rows = container.querySelectorAll('.produto-row');
            const msgEl = document.getElementById('ajustePropostaMsg');
            msgEl.textContent = '';

            // Coleta produtos e valores
            const itens = [];
            let valorTotal = 0;
            let valido = true;

            rows.forEach(row => {
                const nome = (row.querySelector('.prod-nome')?.value || '').trim();
                const por  = parseCurrency(row.querySelector('.ajuste-input-por')?.value || '0');
                if (nome) {
                    itens.push({ nome, por });
                    valorTotal += por;
                } else {
                    valido = false;
                }
            });

            if (!valido || itens.length === 0) {
                msgEl.textContent = 'Selecione um produto em todas as linhas antes de salvar.';
                msgEl.className = 'field-error';
                return;
            }

            const novosProdutos = itens.map(i => i.nome).join(', ');
            const motivo        = document.getElementById('ajusteMotivo').value.trim();

            // Valores antigos para auditoria
            const valorAntigo    = parseFloat(orc.valor_orcado || 0);
            const valorAntigoFmt = valorAntigo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const valorNovoFmt   = valorTotal.toLocaleString('pt-BR',  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // Spinner
            const btn = document.getElementById('btnSalvarAjuste');
            btn.querySelector('.btn-spinner').style.display = 'inline-block';
            btn.querySelector('.btn-text').textContent = 'Salvando...';
            btn.disabled = true;

            try {
                // 1. UPDATE orcamentos
                const { error: errUpdate } = await db
                    .from('orcamentos')
                    .update({ modelo_colchao: novosProdutos, valor_orcado: valorTotal })
                    .eq('id_orcamento', orc.id_orcamento);
                if (errUpdate) throw errUpdate;

                // 2. Sincroniza itens_orcamento com a lista editada (apaga os
                // antigos, insere os novos) — se não fizer isso, o fechamento
                // da venda usaria os produtos ORIGINAIS (de antes do ajuste)
                // pra dar baixa no estoque, deduzindo o item errado. Best-effort
                // com aviso (não trava a edição): o modelo_colchao/valor_orcado
                // acima já são a fonte de verdade visível pro usuário.
                const { error: errDelItens } = await db.from('itens_orcamento').delete().eq('id_orcamento', orc.id_orcamento);
                if (errDelItens) {
                    console.error('Falha ao limpar itens antigos do orçamento:', errDelItens.message);
                    showToast('Proposta salva, mas os itens de estoque não foram atualizados — avise o suporte.', 'warning');
                } else {
                    const itensPayload = itens.map(i => ({
                        id_orcamento: orc.id_orcamento,
                        id_produto: resolverIdProdutoPeloTexto(i.nome),
                        quantidade: 1,
                        preco_praticado: i.por,
                    }));
                    const { error: errInsItens } = await db.from('itens_orcamento').insert(itensPayload);
                    if (errInsItens) {
                        console.error('Falha ao gravar itens atualizados do orçamento:', errInsItens.message);
                        showToast('Proposta salva, mas os itens de estoque não foram atualizados — avise o suporte.', 'warning');
                    }
                }

                // 3. Atualiza estado local
                AppState.contextoVenda.clienteAtual.modelo_colchao = novosProdutos;
                AppState.contextoVenda.clienteAtual.valor_orcado   = valorTotal;

                // Recarrega comentários para refletir o log na timeline
                try {
                    const { data: novosComentarios } = await db
                        .from('comentarios')
                        .select('*')
                        .eq('id_orcamento', orc.id_orcamento)
                        .order('data_criacao', { ascending: true });
                    if (novosComentarios) AppState.contextoVenda.clienteAtual.comentarios = novosComentarios;
                } catch (_) { /* mantém estado anterior */ }

                showToast('Proposta ajustada com sucesso!', 'success');
                closeModal('modalAjusteProposta');
                renderDetalhesClientePage();

            } catch (e) {
                msgEl.textContent = 'Erro ao salvar: ' + (e.message || e);
                msgEl.className = 'field-error';
            } finally {
                btn.querySelector('.btn-spinner').style.display = 'none';
                btn.querySelector('.btn-text').textContent = 'Salvar Alteração';
                btn.disabled = false;
            }
        }

        function buildProdutosOptionsDatalist() {
            if (store.todosProdutos.length === 0) return '';
            return store.todosProdutos.map(p => {
                const textoDisplay = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                return `<option value="${escapeHtml(textoDisplay)}">`;
            }).join('');
        }

        async function abrirDetalhesCliente(id) {
    if (!id) { showToast('Erro: Orçamento não encontrado.', 'error'); return; }
    try {
        showLoader();
        
        // ═══════════════════════════════════════════════════════
        // NOVO: Buscar orçamento com filtro de soft delete
        // ═══════════════════════════════════════════════════════
        const { data: orcamento, error } = await db
            .from('orcamentos')
            .select('*, clientes(nome_cliente, whatsapp, cpf), usuarios(nome), status_orcamento(nome), niveis_interesse(nome)')
            .eq('id_orcamento', id)
            .is('deleted_at', null)  // ← ADICIONAR
            .single();
            
        if (error || !orcamento) throw new Error('Orçamento não encontrado.');

        orcamento.status = orcamento.status_orcamento ? orcamento.status_orcamento.nome : STATUS.CONTATO_INICIAL;
        orcamento.interesse = orcamento.niveis_interesse ? orcamento.niveis_interesse.nome : null;

        // CPF/WhatsApp vêm mascarados de db.from('clientes') (criptografados em
        // repouso) — busca o valor completo via RPC pra exibir na ficha.
        if (orcamento.clientes) {
            const { data: pii } = await db.rpc('rpc_obter_cliente_pii', { p_id_cliente: orcamento.id_cliente });
            if (pii && pii[0]) {
                orcamento.clientes.cpf = pii[0].cpf || orcamento.clientes.cpf;
                orcamento.clientes.whatsapp = pii[0].whatsapp || orcamento.clientes.whatsapp;
            }
        }
        
        // ═══════════════════════════════════════════════════════
        // NOVO: Buscar itens do orçamento
        // ═══════════════════════════════════════════════════════
        const { data: itens } = await db
            .from('itens_orcamento')
            .select('*, produtos(nome_produto, modelo)')
            .eq('id_orcamento', id);
        
        // ═══════════════════════════════════════════════════════
        // NOVO: Buscar histórico de movimentações de estoque
        // ═══════════════════════════════════════════════════════
        const { data: movimentacoes } = await db
            .from('vw_movimentacoes_recentes')
            .select('*')
            .eq('orcamento', orcamento.protocolo)
            .order('created_at', { ascending: false })
            .limit(10);
        
        const { data: comentarios, error: erroComent } = await db.from('comentarios').select('*').eq('id_orcamento', id).order('data_criacao', { ascending: true });
        if (erroComent) throw erroComent;
        
        // Anexamos os comentários direto no objeto 'orcamento'
        orcamento.comentarios = comentarios || [];
        
        // Guardamos o pacote completo dentro do Cofre!
        setClienteAtual(orcamento);
        
        // Esconde o FAB (botão +) — abrirDetalhesCliente não passa pelo navigateTo,
        // então o bloco do router que o oculta nunca é executado sem este hide explícito.
        const fab = document.getElementById('fabButton');
        if (fab) fab.style.display = 'none';

        // Renderiza com itens e movimentações
        renderDetalhesClientePage(orcamento, itens, movimentacoes);

        store.previousView = store.currentView; store.currentView = 'detalhes_cliente'; setUltimaVisita(id);
    } catch (e) { 
        showToast('Erro ao carregar cliente.', 'error'); 
    } finally { 
        hideLoader(); 
    }
}

        function renderDetalhesClientePage() {
            if (!AppState.contextoVenda.clienteAtual) { navigateTo(store.previousView); return; }
            const orc = AppState.contextoVenda.clienteAtual; 
            const id = orc.id_orcamento;
            const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
            const main = document.getElementById('mainContent');
            const isOpenStatus = [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(orc.status);
            
            const comentarios = orc.comentarios || []; 
            const comentariosFrag = renderComentariosHtml(comentarios, id);
            const statusClass = classToFormatStatus(orc.status);
            const interesse = escapeHtml(orc.interesse || '-');
            const interesseColor = orc.interesse === 'Alta' ? '#10b981' : orc.interesse === 'Média' ? '#f59e0b' : orc.interesse === 'Baixa' ? '#ef4444' : '#94a3b8';
            const dataCriacao = orc.data_criacao ? new Date(orc.data_criacao).toLocaleDateString('pt-BR') : '-';
            const ultimoContato = comentarios.length > 0 ? new Date(comentarios[comentarios.length - 1].data_criacao).toLocaleDateString('pt-BR') : '-';
            const whats = (orc.clientes?.whatsapp || '').replace(/\D/g, '');
            const valorFormatado = 'R$ ' + parseFloat(orc.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

            main.innerHTML = `
                <header style="display:flex; align-items:center; gap:16px; margin-bottom:20px; flex-wrap:nowrap; overflow:hidden;">
                    <button class="btn-voltar" onclick="voltarDetalhes()" style="flex-shrink:0;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Voltar
                    </button>
                    <div style="flex:1; min-width:0; display:flex; align-items:center; gap:12px; overflow:hidden;">
                        <div style="font-size:1.25rem; font-weight:800; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${escapeHtml(orc.clientes?.nome_cliente || 'Cliente')}</div>
                        ${orc.protocolo ? `<span style="font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; color:var(--brand-blue-dark); background:var(--brand-blue-subtle); border:1px solid rgba(15, 118, 110, 0.25); padding:2px 9px; border-radius:5px; white-space:nowrap; flex-shrink:0;">${escapeHtml(orc.protocolo)}</span>` : ''}
                    </div>
                    <button type="button" class="btn-agendar-icon" data-tooltip="Agendar contato" onclick="abrirModalAgendamento()">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </button>
                </header>

                <div class="detalhes-page-wrapper">

                    <div style="grid-column: 1 / -1; background: linear-gradient(to right, var(--bg-body), var(--card-bg)); border: 1px dashed var(--brand-blue); border-left: 4px solid var(--brand-blue); border-radius: var(--radius-md); padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display:none;" id="ia-insights-container-removido">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 700; color: var(--brand-blue-dark); font-size: 15px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                            Estratégia sugerida pela IA (funcionalidade movida para modal)
                        </div>
                        <div id="ia-insights-content" style="font-size: 13.5px; line-height: 1.6; color: var(--text-primary);"></div>
                    </div>

                    <div class="det-col-wide">
                        <section class="det-section">
                            <div class="det-section-header">
                                <svg class="det-section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <h2 class="det-section-title">Dados do Cliente</h2>
                            </div>

                            
                            <div class="det-pill-row">
                                <div class="det-pill">
                                    <span class="det-pill-label">Status</span>
                                    <span class="det-pill-value"><span class="status-tag ${statusClass}" style="font-size:11px; padding:3px 10px;">${escapeHtml(orc.status)}</span></span>
                                </div>
                                <div class="det-pill">
                                    <span class="det-pill-label">Interesse</span>
                                    <span class="det-pill-value"><svg width="8" height="8" viewBox="0 0 10 10" style="flex-shrink:0;"><circle cx="5" cy="5" r="5" fill="${interesseColor}"/></svg>${interesse}</span>
                                </div>
                            </div>

                            
                            <div class="det-pill-row" style="grid-template-columns:1fr; margin-bottom:10px;">
                                <div class="det-pill">
                                    <span class="det-pill-label">WhatsApp</span>
                                    <div class="det-pill-row-action">
                                        <span class="det-pill-value mono">${escapeHtml(orc.clientes?.whatsapp || '-')}</span>
                                        ${whats ? `<button type="button" onclick="enviarOrcamentoWhatsApp()" class="btn-wa-inline" style="flex-shrink:0; border:none; cursor:pointer;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                            Chamar
                                        </button>` : ''}
                                    </div>
                                </div>
                            </div>

                            
                            <div class="det-pill-row">
                                <div class="det-pill">
                                    <span class="det-pill-label">CPF / CNPJ</span>
                                    <span class="det-pill-value mono">${escapeHtml(orc.clientes?.cpf || '-')}</span>
                                </div>
                                <div class="det-pill">
                                    <span class="det-pill-label">Origem</span>
                                    <span class="det-pill-value">${escapeHtml(orc.origem || '-')}</span>
                                </div>
                            </div>

                            
                            <div class="det-pill-row">
                                <div class="det-pill">
                                    <span class="det-pill-label">Criado em</span>
                                    <span class="det-pill-value">${dataCriacao}</span>
                                </div>
                                <div class="det-pill">
                                    <span class="det-pill-label">Último Contato</span>
                                    <span class="det-pill-value">${ultimoContato}</span>
                                </div>
                            </div>
                            ${isGerente && orc.usuarios?.nome ? `
                            <div class="det-pill-row" style="grid-template-columns:1fr;">
                                <div class="det-pill">
                                    <span class="det-pill-label">Vendedor Responsável</span>
                                    <span class="det-pill-value" style="font-weight:600;">${escapeHtml(orc.usuarios.nome)}</span>
                                </div>
                            </div>` : ''}

                            
                            <div class="det-pill-row" style="grid-template-columns:1fr;">
                                <div class="det-pill highlight">
                                    <span class="det-pill-label">Valor Orçado</span>
                                    <span class="det-pill-value">${valorFormatado}</span>
                                </div>
                            </div>

                            
                            ${orc.modelo_colchao ? (() => {
                                const prods = orc.modelo_colchao.split(',').map(p => p.trim()).filter(Boolean);
                                if (prods.length === 0) return '';
                                // Sem valores individuais persistidos no banco: quando há mais de 1 item,
                                // referenciamos o valor total orçado apenas na linha do primeiro item.
                                const listaHtml = prods.map((p, i) => `
                                    <li>
                                        <span class="produto-bullet">•</span>
                                        <span class="produto-nome">${escapeHtml(removerCodigoProduto(p))}</span>
                                        ${(i === 0 && prods.length === 1) ? `<span class="produto-valor">${valorFormatado}</span>` : ''}
                                    </li>`).join('');
                                return `
                                <div class="det-pill-row" style="grid-template-columns:1fr;">
                                    <div class="det-pill">
                                        <span class="det-pill-label">Produto(s)</span>
                                        <ul class="det-produtos-lista">${listaHtml}</ul>
                                    </div>
                                </div>`;
                            })() : ''}

                            <button class="btn-primary-action" style="width:100%;justify-content:center;margin-top:10px;" onclick="abrirModalGerarOrcamento()">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Gerar Orçamento para o Cliente
                            </button>

                            
                            ${orc.forma_pagamento || orc.data_entrega ? `
                            <div class="det-pill-row">
                                ${orc.forma_pagamento ? `<div class="det-pill"><span class="det-pill-label">Pagamento</span><span class="det-pill-value">${escapeHtml(orc.forma_pagamento)}</span></div>` : ''}
                                ${orc.data_entrega ? `<div class="det-pill"><span class="det-pill-label">Entrega</span><span class="det-pill-value blue">${new Date(orc.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
                            </div>` : ''}

                            
                            ${isGerente ? `
                            <div class="det-pill-row" style="grid-template-columns:1fr;">
                                <div class="det-pill">
                                    <span class="det-pill-label">Vendedor</span>
                                    <span class="det-pill-value">${escapeHtml(orc.usuarios?.nome || '-')}</span>
                                </div>
                            </div>` : ''}

                            <div class="det-obs-area" style="margin-top:auto; padding-top:12px;">
                                <label class="det-obs-label">Observações <span id="obsSalvaLoader" class="auto-save-indicator">✓ Salvo</span></label>
                                <textarea id="obsFixaCliente" class="form-input" style="resize:none; min-height:72px; font-size:13px;" placeholder="Ex: Cliente prefere contato de manhã..." onblur="salvarObservacaoFixa('${orc.id_orcamento}')">${escapeHtml(orc.observacoes || '')}</textarea>
                            </div>

                            ${(() => {
                                const isVendedor = store.currentUser.perfil === 'Vendedor';
                                const podeAjustar = isGerente || !isVendedor || isOpenStatus;
                                const btnAjuste = podeAjustar ? `
                                <button class="btn-primary-action" style="width:100%;justify-content:center;margin-top:0;" onclick="abrirAjusteProposta()">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Ajustar Proposta
                                </button>` : '';
                                const btnsFechamento = (isOpenStatus && !isGerente) ? `
                                <div style="display:flex;gap:8px;margin-top:8px;">
                                    <button class="btn-fechar-hero" style="flex:1;justify-content:center;" onclick="abrirConfirmaFechamento('${orc.id_orcamento}')">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                        Fechar Venda
                                    </button>
                                    <button class="btn-perder-hero" style="flex:1;justify-content:center;" onclick="abrirMotivoPerda('${orc.id_orcamento}')">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                        Marcar Perdida
                                    </button>
                                </div>` : '';
                                if (!btnAjuste && !btnsFechamento) return '';
                                return `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light);">${btnAjuste}${btnsFechamento}</div>`;
                            })()}
                        </section>
                    </div>

                    <div class="det-col-history">
                        <section class="det-section scrollable">
                            <div class="det-section-header">
                                <svg class="det-section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <h2 class="det-section-title">Histórico de Contatos</h2>
                            </div>

                            <div class="det-timeline-scroll" id="listaComentarios"></div>

                            <div class="det-comment-expand" id="btnExpandComment" onclick="expandirComentario()">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Adicionar registro...
                            </div>
                            <div class="det-comment-form" id="formComentario">
                                <textarea id="novoComentario" rows="3" class="form-input" style="font-size:13px; background:var(--card-bg); resize:none;" placeholder="Registre observações, ligações ou anotações..." oninput="atualizarIndicadorDigitacao()"></textarea>
                                <div class="typing-indicator" id="typingIndicator">Mensagem sendo redigida...</div>
                                <div class="det-comment-actions">
                                    <div class="field-error" id="comentarioMsg"></div>
                                    <button class="btn-registrar-hist" id="btnSalvarTimeline" onclick="salvarComentario()">
                                        <span class="btn-spinner" style="display:none; width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>
                                        <span class="btn-text" style="display:flex; align-items:center; gap:6px;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                            Registrar
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>

                </div>

<button id="btnFabIA" onclick="analisarClienteComIA('${id}')" style="position: fixed; bottom: 32px; right: 32px; background: linear-gradient(135deg, var(--gold), var(--gold-dark)); color: #fff; border: none; padding: 14px 24px; border-radius: 30px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 10px 20px -3px var(--gold-glow), var(--shadow-md); display: flex; align-items: center; gap: 8px; z-index: 1000; transition: transform 0.2s, box-shadow 0.2s; font-family: 'Inter', sans-serif;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 14px 26px -3px var(--gold-glow), var(--shadow-lg)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 20px -3px var(--gold-glow), var(--shadow-md)'">
                    <span class="btn-text">✨ Destravar Venda</span>
                    <span class="btn-spinner" style="display:none; width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>
                </button>
            `;
            // Injeta o fragment da timeline após o main.innerHTML ser construído
            const listaContainer = document.getElementById('listaComentarios');
            if (listaContainer) listaContainer.appendChild(comentariosFrag);
        }

        // Monta o texto do orçamento pronto para copiar e enviar ao cliente
        // (WhatsApp) — linguagem voltada a converter em venda, não um recibo frio.
        // Só usa dado já carregado no contexto, não faz request nova.
        // descontoPercentual (opcional): quando informado, mostra o valor "de/por"
        // com o desconto em destaque (âncora de preço) em vez de só o valor final.
        function montarTextoOrcamento(orc, descontoPercentual) {
            const nomeCliente = (orc.clientes?.nome_cliente || '').trim();
            const primeiroNome = nomeCliente.split(/\s+/)[0] || nomeCliente;
            const nomeVendedor = (orc.usuarios?.nome || store.currentUser.nome || '').trim();

            const produtos = (orc.modelo_colchao || '')
                .split(',')
                .map(p => removerCodigoProduto(p.trim()))
                .filter(Boolean);

            const fmt = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const valorFinal = parseFloat(orc.valor_orcado || 0);
            const desconto = Math.min(95, Math.max(0, parseFloat(descontoPercentual) || 0));
            const valorTabela = desconto > 0 ? valorFinal / (1 - desconto / 100) : null;

            const linhas = [];
            linhas.push(`Oi${primeiroNome ? ', ' + primeiroNome : ''}! Tudo bem? Separei uma condição especial pra você 😊`);
            linhas.push('');
            if (produtos.length > 0) {
                linhas.push('🛏️ *Selecionei pra você:*');
                produtos.forEach(p => linhas.push(`• ${p}`));
                linhas.push('');
            }
            if (valorTabela) {
                const descontoFmt = desconto.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
                linhas.push(`~De ${fmt(valorTabela)}~`);
                linhas.push(`💰 *Por apenas ${fmt(valorFinal)}* (${descontoFmt}% de desconto! 🔥)`);
            } else {
                linhas.push(`💰 *Valor: ${fmt(valorFinal)}*`);
            }
            if (orc.forma_pagamento) linhas.push(`💳 ${orc.forma_pagamento}`);
            if (orc.data_entrega) linhas.push(`🚚 Entrega prevista: ${new Date(orc.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}`);
            linhas.push('');
            linhas.push('Essa condição eu separei pensando exatamente no que você procura — vale muito a pena garantir agora! 💪');
            linhas.push('');
            linhas.push('Posso já confirmar esse pedido pra você? É só me responder por aqui! ✅');
            linhas.push('');
            linhas.push(nomeVendedor);

            return linhas.join('\n');
        }

        // Controla se o vendedor já digitou algo no textarea por conta própria — a
        // partir daí o campo de % desconto para de sobrescrever o texto sozinho,
        // pra não apagar uma edição manual sem aviso.
        let textoOrcamentoEditadoManualmente = false;

        function abrirModalGerarOrcamento() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) { showToast('Orçamento não encontrado.', 'error'); return; }
            textoOrcamentoEditadoManualmente = false;
            const descontoInput = document.getElementById('gerarOrcamentoDesconto');
            if (descontoInput) descontoInput.value = '';
            const textarea = document.getElementById('textoOrcamentoGerado');
            if (textarea) textarea.value = montarTextoOrcamento(orc, 0);
            openModal('modalGerarOrcamento');
        }

        function atualizarTextoOrcamentoComDesconto() {
            if (textoOrcamentoEditadoManualmente) return; // não pisa numa edição manual já feita
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) return;
            const descontoInput = document.getElementById('gerarOrcamentoDesconto');
            const textarea = document.getElementById('textoOrcamentoGerado');
            if (textarea) textarea.value = montarTextoOrcamento(orc, descontoInput?.value);
        }

        // Chamado pelo oninput do textarea — detecta a primeira edição manual e
        // avisa uma vez só que, a partir daí, o % desconto não altera mais o texto.
        function marcarTextoOrcamentoEditadoManualmente() {
            if (textoOrcamentoEditadoManualmente) return;
            textoOrcamentoEditadoManualmente = true;
            showToast('Texto em edição manual — o campo de % desconto não vai mais alterá-lo automaticamente.', 'info');
        }

        async function copiarTextoOrcamento() {
            const textarea = document.getElementById('textoOrcamentoGerado');
            if (!textarea) return;
            try {
                await navigator.clipboard.writeText(textarea.value);
                showToast('Texto copiado! Já pode colar no WhatsApp.', 'success');
            } catch (e) {
                // Fallback para navegadores/contextos sem permissão da Clipboard API.
                textarea.focus();
                textarea.select();
                try {
                    document.execCommand('copy');
                    showToast('Texto copiado! Já pode colar no WhatsApp.', 'success');
                } catch (e2) {
                    showToast('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', 'error');
                }
            }
        }

        // Abre o WhatsApp já com o texto do orçamento preenchido
        // (wa.me/...?text=...) em vez de exigir copiar-colar manual, e
        // registra automaticamente na timeline que a mensagem foi enviada.
        // Antes esse registro só existia se o vendedor lembrasse de anotar
        // manualmente — sem ele, o Radar IA podia marcar o cliente como
        // "esfriando" mesmo tendo sido contatado no mesmo dia.
        // Serve tanto o botão do modal "Gerar orçamento" (usa o texto já
        // revisado/com desconto do textarea) quanto o link "Chamar" da
        // página de detalhes (gera o texto padrão na hora).
        async function enviarOrcamentoWhatsApp() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) { showToast('Orçamento não encontrado.', 'error'); return; }

            const numero = (orc.clientes?.whatsapp || '').replace(/\D/g, '');
            if (!numero) {
                showToast('Este cliente não tem WhatsApp cadastrado.', 'error');
                return;
            }

            const textarea = document.getElementById('textoOrcamentoGerado');
            const texto = (textarea && textarea.value.trim()) || montarTextoOrcamento(orc, 0);

            window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`, '_blank');

            // Best-effort: se o log falhar, o envio já aconteceu (o WhatsApp
            // já abriu) — não faz sentido travar o vendedor por causa disso.
            try {
                const { error } = await db.from('comentarios').insert([{
                    id_orcamento: orc.id_orcamento,
                    texto: 'Orçamento enviado por WhatsApp.',
                    tipo: 'Sistema',
                    autor: store.currentUser.nome
                }]);
                if (error) throw error;

                const { data: novosComentarios } = await db.from('comentarios')
                    .select('*')
                    .eq('id_orcamento', orc.id_orcamento)
                    .order('data_criacao', { ascending: true });
                if (novosComentarios) {
                    orc.comentarios = novosComentarios;
                    renderDetalhesClientePage();
                }
            } catch (e) {
                console.error('Erro ao registrar envio de WhatsApp na timeline:', e);
            }
        }

        function buildProdutoSelectOptions() {
            let opts = '<option value="">Selecione um produto</option>';
            if (store.todosProdutos.length === 0) return opts;
            store.todosProdutos.forEach(p => {
                const texto = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                opts += `<option value="${escapeHtml(texto)}">${escapeHtml(texto)}</option>`;
            });
            return opts;
        }

        function adicionarProdutoRow() {
            const container = document.getElementById('produtosContainer'); 
            const row = document.createElement('div'); 
            row.className = 'produto-row';
            row.innerHTML = `
                <div class="produto-row-top">
                    <div class="prod-nome-wrapper">
                        <input type="text" class="form-input prod-nome" placeholder="Digite para buscar um produto..." autocomplete="off" required
                            oninput="filtrarProdutoSugestoes(this)"
                            onfocus="filtrarProdutoSugestoes(this)"
                            onkeydown="prodNomeKeydown(event, this)"
                            onblur="setTimeout(() => fecharProdutoSugestoes(this), 150)">
                        <span class="prod-check" title="Produto reconhecido">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                        <div class="prod-suggestions"></div>
                    </div>
                    <button type="button" class="btn-remove-item" onclick="removerProdutoRow(this)" title="Remover item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
                <div class="produto-row-bottom ajuste-row-bottom">
                    <div>
                        <div class="produto-row-label">De</div>
                        <input type="text" class="form-input input-de font-data" placeholder="R$ 0,00" inputmode="decimal"
                            oninput="this.value = formatCurrency(this.value); recalcularLinhaNovoOrcamento(this);">
                    </div>
                    <div class="ajuste-desc-wrapper">
                        <div class="produto-row-label">% Desc.</div>
                        <div class="ajuste-desc-input-group">
                            <input type="number" class="form-input ajuste-input-desc" placeholder="0" min="0" max="100" step="0.1"
                                oninput="ajusteValidarDesconto(this); recalcularLinhaNovoOrcamento(this);">
                            <span class="ajuste-desc-sign">%</span>
                        </div>
                    </div>
                    <div>
                        <div class="produto-row-label">Por</div>
                        <input type="text" class="form-input input-por font-data" placeholder="R$ 0,00" inputmode="decimal" readonly tabindex="-1"
                            title="Calculado automaticamente a partir de 'De' e '% Desc.'">
                    </div>
                </div>
            `;
            container.appendChild(row); 
            atualizarBotoesLixeira();
        }

        function recalcularLinhaNovoOrcamento(el) {
            const row = el.closest('.produto-row');
            if (!row) return;
            const deInput = row.querySelector('.input-de');
            const descInput = row.querySelector('.ajuste-input-desc');
            const porInput = row.querySelector('.input-por');
            const de = parseCurrency(deInput?.value || '0');
            const desc = Math.min(100, Math.max(0, parseFloat((descInput?.value || '0').replace(',', '.')) || 0));
            const por = de * (1 - desc / 100);
            if (porInput) porInput.value = 'R$ ' + por.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            calcTotalModal();
        }

        function filtrarProdutoSugestoes(input) {
            const wrapper = input.closest('.prod-nome-wrapper');
            const box = wrapper.querySelector('.prod-suggestions');
            const termo = input.value.trim().toLowerCase();

            validarProdutoSelecionado(input); // atualiza o "check" verde de correspondência exata

            if (!termo) { box.innerHTML = ''; box.classList.remove('show'); return; }

            const matches = store.todosProdutos.filter(p => {
                const nome = (p.nome || '').toLowerCase();
                const cod = (p.codigo || '').toLowerCase();
                return nome.includes(termo) || cod.includes(termo);
            }).slice(0, 8);

            if (matches.length === 0) {
                box.innerHTML = '<div class="prod-suggestion-empty">Nenhum produto encontrado</div>';
                box.classList.add('show');
                return;
            }

            box.innerHTML = matches.map(p => {
                const texto = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                return `<div class="prod-suggestion-item" data-texto="${escapeHtml(texto)}" onmousedown="event.preventDefault(); selecionarProdutoSugestao(this)">
                    <span class="psi-nome">${escapeHtml(p.nome)}</span>
                </div>`;
            }).join('');
            box.classList.add('show');
        }

        function selecionarProdutoSugestao(el) {
            const texto = el.dataset.texto;
            const wrapper = el.closest('.prod-nome-wrapper');
            const input = wrapper.querySelector('.prod-nome');
            input.value = texto;
            fecharProdutoSugestoes(input);
            validarProdutoSelecionado(input);
            input.focus();
        }

        function fecharProdutoSugestoes(input) {
            const wrapper = input.closest('.prod-nome-wrapper');
            const box = wrapper.querySelector('.prod-suggestions');
            box.innerHTML = '';
            box.classList.remove('show');
        }

        function prodNomeKeydown(e, input) {
            const wrapper = input.closest('.prod-nome-wrapper');
            const box = wrapper.querySelector('.prod-suggestions');
            if (e.key === 'Escape') {
                fecharProdutoSugestoes(input);
            } else if (e.key === 'Enter' && box.classList.contains('show')) {
                const first = box.querySelector('.prod-suggestion-item');
                if (first) { e.preventDefault(); selecionarProdutoSugestao(first); }
            }
        }

        // Mesma lógica de correspondência de validarProdutoSelecionado() (o
        // "check" verde), reaproveitada pra ligar o texto digitado num
        // produto real do catálogo — usada tanto ao criar quanto ao editar
        // (Ajuste de Proposta) um orçamento, pra popular itens_orcamento e
        // permitir a baixa automática de estoque no fechamento da venda.
        // Item digitado que não bate com o catálogo (ex: "Frete") retorna
        // null de propósito — continua sendo salvo (em modelo_colchao e, com
        // id_produto nulo, em itens_orcamento), só não participa da baixa.
        function resolverIdProdutoPeloTexto(texto) {
            const alvo = (texto || '').trim().toLowerCase();
            if (!alvo) return null;
            const match = store.todosProdutos.find(p => {
                const textoDisplay = p.codigo ? `${p.codigo} - ${p.nome}`.toLowerCase() : p.nome.toLowerCase();
                return textoDisplay === alvo || p.nome.toLowerCase() === alvo;
            });
            return match ? match.id_produto : null;
        }

        function validarProdutoSelecionado(input) {
            const checkSpan = input.parentElement.querySelector('.prod-check');
            const produtoDigitado = input.value.trim().toLowerCase();
            
            const produtoExiste = store.todosProdutos.some(p => {
                const textoDisplay = p.codigo ? `${p.codigo} - ${p.nome}`.toLowerCase() : p.nome.toLowerCase();
                return textoDisplay === produtoDigitado || p.nome.toLowerCase() === produtoDigitado;
            });
        
            if (produtoExiste && produtoDigitado !== '') {
                checkSpan.style.display = 'inline-flex';
                input.style.borderColor = '#10b981';
            } else {
                checkSpan.style.display = 'none';
                input.style.borderColor = 'var(--border-light)';
            }
        }

        function removerProdutoRow(btn) { btn.closest('.produto-row').remove(); calcTotalModal(); atualizarBotoesLixeira(); }

        function atualizarBotoesLixeira() { const btns = document.getElementById('produtosContainer').querySelectorAll('.btn-remove-item'); if (btns.length === 1) { btns[0].style.opacity = '0.3'; btns[0].style.pointerEvents = 'none'; } else { btns.forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; }); } }

        function calcTotalModal() { 
    let total = 0; 
    const container = document.getElementById('produtosContainer');
    
    // Só faz a soma se estiver dentro da página de Novo Orçamento
    if (container) {
        container.querySelectorAll('.input-por').forEach(inp => { 
            total += parseCurrency(inp.value); 
        }); 
    }
    
    const display = document.getElementById('displayTotalModal');
    if (display) {
        display.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }); 
    }
    
    return total; 
}

        function abrirNovoOrcamento() { if (!podeCriarOrcamento()) return; navigateTo('novo_orcamento'); }

        async function verificarClientePorCpf(cpf, telefone) {
            if (!cpf) return { existe: false, cliente: null, avisoTelefone: null };
            // CPF/whatsapp ficam criptografados em repouso — a busca de duplicado
            // usa um hash determinístico (RPC), não mais .eq('cpf', ...) direto.
            const { data: matches } = await db.rpc('rpc_buscar_cliente_por_documento', { p_cpf: cpf, p_whatsapp: telefone || null });
            const match = matches && matches[0];
            if (match && match.tipo_match === 'cpf') {
                return { existe: true, cliente: { id_cliente: match.id_cliente, nome_cliente: match.nome_cliente }, avisoTelefone: null };
            }
            if (match && match.tipo_match === 'whatsapp') {
                return { existe: false, cliente: null, avisoTelefone: `Atenção: o telefone ${telefone} pertence a ${match.nome_cliente} (CPF diferente). Deseja continuar?` };
            }
            return { existe: false, cliente: null, avisoTelefone: null };
        }

        async function validarCPF() {
            const cpfInput = document.getElementById('modCpf');
            const errSpan = document.getElementById('errCpf');
            let cpf = cpfInput.value.replace(/\D/g, '');
            
            // Se estiver vazio, passa direto (agora é opcional)
            if (cpf.length === 0) {
                errSpan.textContent = '';
                return true;
            }
            
            // Se preencheu, valida o tamanho (11 para CPF ou 14 para CNPJ)
            if (cpf.length !== 11 && cpf.length !== 14) { 
                errSpan.textContent = 'CPF/CNPJ inválido'; 
                return false; 
            }
            
            errSpan.textContent = '';
            const { data: matches } = await db.rpc('rpc_buscar_cliente_por_documento', { p_cpf: cpf });
            const existing = matches && matches.find(m => m.tipo_match === 'cpf');
            if (existing) {
                errSpan.textContent = `⚠️ Documento já pertence a ${existing.nome_cliente}. O orçamento será vinculado a este cliente.`;
                return false;
            }
            return true;
        }

        async function renderNovoOrcamentoPage() {
            const main = document.getElementById('mainContent');
            if (store.todosProdutos.length === 0) await carregarProdutos();
            const hoje = getHojeBrasilia();
        
            main.innerHTML = `
                <header class="dashboard-header" style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
                    <button class="btn-voltar" onclick="navigateTo(store.previousView)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Voltar
                    </button>
                    <h1 style="font-size: 20px; font-weight: 800; color:var(--text-primary); flex:1;">Novo Orçamento</h1>
                    <button type="button" class="btn-agendar-icon" data-tooltip="Agendar contato" onclick="abrirModalAgendarNovoOrcamento()">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </button>
                </header>

                <div class="novo-orcamento-wrapper">
                    <!-- COLUNA 1: CLIENTE -->
                    <section class="novo-orcamento-section">
                        <div class="section-header">
                            <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <h2 class="section-title">Dados do Cliente</h2>
                        </div>

                        <div class="form-group"><label for="modNome">Nome ou Razão Social *</label><input type="text" id="modNome" class="form-input" placeholder="Ex: João da Silva" onblur="validateField('modNome','errNome')"><div class="field-error" id="errNome" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label for="modCpf">CPF / CNPJ</label><input type="text" id="modCpf" class="form-input font-data" placeholder="Opcional" onblur="validarCPF()"><div class="field-error" id="errCpf" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>                            <div class="form-group"><label for="modWhats">WhatsApp *</label><input type="tel" id="modWhats" class="form-input font-data" placeholder="(00) 00000-0000" onblur="validateField('modWhats','errWhats')"><div class="field-error" id="errWhats" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                        </div>

                        <div class="form-group"><label for="modEmail">E-mail</label><input type="email" id="modEmail" class="form-input" placeholder="cliente@email.com"></div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label for="modOrigem">Canal de Origem</label><select id="modOrigem" class="form-input"><option value="">Selecionar...</option><option value="Instagram">Instagram / Redes Sociais</option><option value="WhatsApp">WhatsApp (Orgânico)</option><option value="Indicação">Indicação</option><option value="Passou na Loja">Passou na Loja Física</option><option value="Panfleto">Ação Externa</option><option value="Outros">Outros</option></select></div>
                            <div class="form-group"><label for="modInteresse">Interesse</label><select id="modInteresse" class="form-input"><option value="">Selecionar...</option><option value="Alto">Alto</option><option value="Médio">Médio</option><option value="Baixo">Baixo</option></select></div>
                        </div>

                        <div class="form-group" style="margin-bottom: 0; flex: 1;"><label for="modObservacoes">Contexto / Observações</label><textarea id="modObservacoes" class="form-input" placeholder="Necessidades específicas, histórico..."></textarea></div>
                    </section>

                    <!-- COLUNA 2: ITENS -->
                    <section class="novo-orcamento-section">
                        <div class="section-header">
                            <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            <h2 class="section-title">Itens</h2>
                        </div>

                        <div class="produtos-wrapper" id="produtosContainer"></div>

                        <button type="button" class="btn-add-item-premium" onclick="adicionarProdutoRow()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar linha de produto
                        </button>
                        <div class="field-error" id="errItens" style="text-align: center; color:#ef4444; font-size:12px; margin-top:8px;"></div>

                        <div class="total-modal-box">
                            <span>Total</span>
                            <span class="valor-total" id="displayTotalModal">R$ 0,00</span>
                        </div>
                    </section>
                </div>

                <div class="footer-actions" style="max-width:320px; margin:24px auto 0;">
                    <button id="btnSalvarOrcamento" style="background:var(--brand-blue); color:#fff; border:none; padding:14px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:0.2s;" onclick="salvarOrcamento()">
                        <span class="btn-spinner" style="display:none; width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>
                        <span class="btn-text" style="display:flex; align-items:center; gap:8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            Confirmar e Salvar
                        </span>
                    </button>
                    <p class="msg" id="modalMsg" style="text-align: center; font-size: 12px;"></p>
                </div>

                <!-- Agendamento de contato: acessível pelo ícone no cabeçalho, não mais um card fixo na página -->
                <div class="modal-overlay" id="modalAgendarNovoOrcamento" onclick="if(event.target===this)closeModal('modalAgendarNovoOrcamento')">
                    <div class="modal-card" style="max-width:460px; width:96%;">
                        <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Agendar Contato
                        </h3>

                        <div class="form-group"><label for="modDataOrcamento">Data do Orçamento</label><input type="date" id="modDataOrcamento" class="form-input font-data" value="${hoje}" onblur="validateField('modDataOrcamento','errDataOrc')"><div class="field-error" id="errDataOrc" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>

                        <div class="form-group"><label for="modMotivoContato">Tipo de Contato</label><select id="modMotivoContato" class="form-input"><option value="">Selecionar...</option><optgroup label="Vendas"><option value="Apresentação de Campanha/Promoção">Apresentação de Campanha/Promoção</option><option value="Reativação de Contato Antigo">Reativação de Contato Antigo</option><option value="Acompanhamento de Orçamento">Acompanhamento de Orçamento</option><option value="Virada de Tabela">Virada de Tabela</option><option value="Quebra de Objeção">Quebra de Objeção</option><option value="Cross-sell (Venda Cruzada)">Cross-sell (Venda Cruzada)</option></optgroup><optgroup label="Pós-Venda"><option value="Alinhamento Logístico">Alinhamento Logístico</option><option value="Acompanhamento de Adaptação (Pós-Entrega)">Acompanhamento de Adaptação (Pós-Entrega)</option><option value="Assistência Técnica">Assistência Técnica</option></optgroup></select></div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label for="modDataContato">Data</label><input type="date" id="modDataContato" class="form-input font-data" onblur="validateField('modDataContato','errDataContato')"><div class="field-error" id="errDataContato" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                            <div class="form-group"><label for="modHoraContato">Horário *</label><input type="time" id="modHoraContato" class="form-input font-data" onblur="validateField('modHoraContato','errHoraContato')"><div class="field-error" id="errHoraContato" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                        </div>

                        <div class="modal-btns">
                            <button class="btn-cancelar-modal" onclick="closeModal('modalAgendarNovoOrcamento')">Fechar</button>
                        </div>
                    </div>
                </div>
            `;

            adicionarProdutoRow();
            calcTotalModal();
            setTimeout(() => { const modNome = document.getElementById('modNome'); if(modNome) modNome.focus(); }, 100);

        }

        function abrirModalAgendarNovoOrcamento() {
            openModal('modalAgendarNovoOrcamento');
        }

        async function salvarOrcamento() {
            if (store.salvandoOrcamento) return;
            store.salvandoOrcamento = true;
            const btn = document.getElementById('btnSalvarOrcamento');
            btn.classList.add('saving');
            btn.disabled = true;
            
            try {
                const nome = document.getElementById('modNome').value.trim();
                const cpf = document.getElementById('modCpf').value.replace(/\D/g, '');
                const whats = document.getElementById('modWhats').value.trim();
                const origem = document.getElementById('modOrigem').value;
                const interesse = document.getElementById('modInteresse').value;
                const observacoes = document.getElementById('modObservacoes').value;
                const dataOrcamento = document.getElementById('modDataOrcamento').value;
                const dataContato = document.getElementById('modDataContato').value;
                const horaContato = document.getElementById('modHoraContato').value;
                const motivoContato = document.getElementById('modMotivoContato') ? document.getElementById('modMotivoContato').value : '';
                
                let valid = true;
                if (!nome) { document.getElementById('errNome').textContent = 'Obrigatório'; valid = false; }
                
                // Valida apenas se o documento foi preenchido, mas não exige
                if (cpf && cpf.length !== 11 && cpf.length !== 14) { 
                    document.getElementById('errCpf').textContent = 'Documento inválido'; 
                    valid = false; 
                }
                
                if (!whats) { document.getElementById('errWhats').textContent = 'Obrigatório'; valid = false; }
                              
                const produtoRows = document.getElementById('produtosContainer').querySelectorAll('.produto-row');
                if (produtoRows.length === 0) {
                    document.getElementById('errItens').textContent = 'Adicione pelo menos um produto';
                    valid = false;
                } else {
                    let hasEmpty = false;
                    produtoRows.forEach(row => {
                        const nomeProd = row.querySelector('.prod-nome').value.trim();
                        const valorProd = parseCurrency(row.querySelector('.input-por').value);
                        if (!nomeProd || valorProd <= 0) hasEmpty = true;
                    });
                    
                    if (hasEmpty) {
                        document.getElementById('errItens').textContent = 'Preencha nome e valor de todos os produtos';
                        valid = false;
                    }
               } 
                
                if (!valid) { 
                    showToast('Preencha todos os campos obrigatórios', 'error'); 
                    store.salvandoOrcamento = false;
                    btn.classList.remove('saving');
                    btn.disabled = false;
                    return; 
                }
                
                const { existe, cliente, avisoTelefone } = await verificarClientePorCpf(cpf, whats);
                let idClienteExistente = null;

                if (existe) {
                    idClienteExistente = cliente.id_cliente;
                    showToast(`Cliente já existe: ${cliente.nome_cliente}. Orçamento será vinculado.`, 'info');
                } else if (avisoTelefone) {
                    const continuar = confirm(avisoTelefone + '\nDeseja continuar com o novo cadastro?');
                    if (!continuar) {
                        store.salvandoOrcamento = false;
                        btn.classList.remove('saving');
                        btn.disabled = false;
                        return;
                    }
                }
                const emailOrc = document.getElementById('modEmail') ? document.getElementById('modEmail').value.trim() : '';

                const produtosList = [];
                let valorTotal = 0;
                produtoRows.forEach(row => {
                    const nomeProd = row.querySelector('.prod-nome').value.trim();
                    const valorDe = parseCurrency(row.querySelector('.input-de').value);
                    const valorPor = parseCurrency(row.querySelector('.input-por').value);
                    produtosList.push({ nome: nomeProd, valorDe: valorDe, valorPor: valorPor });
                    valorTotal += valorPor;
                });
                
                const statusInicial = store.mapStatusUUID.find(s => s.nome === STATUS.CONTATO_INICIAL);
                const idStatus = statusInicial ? statusInicial.id_status : null;
                let idInteresse = null;
                if (interesse) {
                    const nivel = store.mapInteresseUUID.find(n => n.nome === interesse);
                    idInteresse = nivel ? nivel.id_interesse : null;
                }
                let dataCriacaoFinal = dataOrcamento;
                const hojeData = getHojeBrasilia();
                if (dataOrcamento === hojeData) {
                    dataCriacaoFinal = getAgoraBrasiliaISO();
                } else {
                    dataCriacaoFinal = `${dataOrcamento}T12:00:00.000Z`;
                }
                // Cliente (se necessário) + orçamento são criados em uma única transação
                // atômica via RPC (função Postgres) — ver
                // supabase/migrations/*_rpc_operacoes_atomicas.sql
                const { data: resultadoSalvar, error: errRpc } = await db.rpc('rpc_salvar_orcamento', {
                    p_id_cliente: idClienteExistente,
                    p_nome_cliente: nome,
                    p_cpf: cpf || null,
                    p_whatsapp: whats,
                    p_email: emailOrc || null,
                    p_id_usuario_cadastro: store.currentUser.id_usuario,
                    p_id_usuario: store.currentUser.id_usuario,
                    p_id_status: idStatus,
                    p_id_nivel_interesse: idInteresse,
                    p_valor_orcado: valorTotal,
                    p_modelo_colchao: produtosList.map(p => p.nome).join(', '),
                    p_data_criacao: dataCriacaoFinal,
                    p_data_contato: dataContato || null,
                    p_hora_contato: horaContato || null,
                    p_observacao_agendamento: motivoContato || null,
                    p_observacoes: observacoes,
                    p_origem: origem,
                    // Estruturado (produto + quantidade), pra baixa automática de
                    // estoque disparar de verdade no fechamento da venda — antes
                    // só existia o texto livre acima, e o trigger de baixa nunca
                    // tinha nada em itens_orcamento pra processar.
                    p_itens: produtosList.map(p => ({
                        id_produto: resolverIdProdutoPeloTexto(p.nome),
                        quantidade: 1,
                        preco_praticado: p.valorPor,
                    })),
                });
                if (errRpc) throw errRpc;
                const newOrc = Array.isArray(resultadoSalvar) ? resultadoSalvar[0] : resultadoSalvar;

                showToast(`Orçamento ${newOrc.protocolo} salvo com sucesso!`, 'success');
                navigateTo(store.previousView);
            } catch (error) {
                console.error(error);
                let errMsg = error.message;
                if (errMsg && (errMsg.includes('duplicate key') || errMsg.includes('unique constraint'))) {
                    errMsg = 'Conflito na geração do protocolo. Por favor, tente clicar em salvar novamente.';
                }
                showToast('Erro ao salvar orçamento: ' + errMsg, 'error');
            } finally {
                btn.classList.remove('saving');
                btn.disabled = false;
                store.salvandoOrcamento = false;
            }
        }

        function abrirMotivoPerda(id) { store.idOrcamentoParaPerder = id; openModal('modalMotivoPerda'); }

        async function confirmarPerda(event) {
            if (store.isConfirmingPerda) return;
            const motivoSelect = document.getElementById('motivoPerdaSelect');
            const motivoDetalhes = document.getElementById('motivoPerda').value.trim();
            const motivo = motivoSelect.value;
            if (!motivo) { document.getElementById('errMotivo').textContent = 'Selecione o motivo principal.'; return; }
            const btn = event.currentTarget;
            btn.classList.add('saving'); btn.disabled = true; store.isConfirmingPerda = true;
            try {
                if (!store.mapStatusUUID.length) {
                    const { data } = await db.from('status_orcamento').select('*');
                    store.mapStatusUUID = data || [];
                }
                const statusPerdido = store.mapStatusUUID.find(s => s.nome === STATUS.PERDIDO);
                if (!statusPerdido) throw new Error('Status "Perdido" não encontrado');
                // Update do status + comentário em uma única transação atômica via RPC.
                const { error } = await db.rpc('rpc_confirmar_perda_orcamento', {
                    p_id_orcamento: store.idOrcamentoParaPerder,
                    p_id_status_perdido: statusPerdido.id_status,
                    p_motivo: motivo,
                    p_motivo_detalhes: motivoDetalhes || null,
                    p_autor: store.currentUser.nome
                });
                if (error) throw error;
                showToast('Venda registrada como perdida.', 'success');
                closeModal('modalMotivoPerda');
                if (store.currentView === 'detalhes_cliente') await abrirDetalhesCliente(store.idOrcamentoParaPerder);
                else navigateTo(store.currentView);
            } catch (e) { showToast('Erro ao registrar perda: ' + e.message, 'error'); }
            finally { btn.classList.remove('saving'); btn.disabled = false; store.isConfirmingPerda = false; }
        }

        function selecionarModoFechamento(modo) {
            store.modoFechamentoSelecionado = modo;
            const btnEntrega = document.getElementById('btnOpcaoEntrega');
            const btnRetirada = document.getElementById('btnOpcaoRetirada');
            const step2 = document.getElementById('fechamentoStep2');
            const errModo = document.getElementById('errModoFechamento');
            if (errModo) errModo.textContent = '';

            // Highlight selecionado
            btnEntrega.style.borderColor = modo === 'entrega' ? 'var(--brand-blue)' : 'var(--border-light)';
            btnEntrega.style.background = modo === 'entrega' ? 'var(--brand-blue-subtle)' : 'var(--card-bg)';
            btnEntrega.style.color = modo === 'entrega' ? 'var(--brand-blue-dark)' : 'var(--text-primary)';
            btnRetirada.style.borderColor = modo === 'retirada' ? 'var(--accent-green)' : 'var(--border-light)';
            btnRetirada.style.background = modo === 'retirada' ? 'var(--accent-green-subtle)' : 'var(--card-bg)';
            btnRetirada.style.color = modo === 'retirada' ? 'var(--accent-green-dark)' : 'var(--text-primary)';

            if (modo === 'entrega') {
                step2.style.display = 'block';
            } else {
                step2.style.display = 'none';
                const errData = document.getElementById('errDataEntrega');
                if (errData) errData.textContent = '';
            }
        }

        function abrirConfirmaFechamento(id) {
            store.idOrcamentoParaPerder = id;
            store.modoFechamentoSelecionado = null;

            // Reset visual
            const btnEntrega = document.getElementById('btnOpcaoEntrega');
            const btnRetirada = document.getElementById('btnOpcaoRetirada');
            if (btnEntrega) { btnEntrega.style.borderColor = 'var(--border-light)'; btnEntrega.style.background = 'var(--card-bg)'; btnEntrega.style.color = 'var(--text-primary)'; }
            if (btnRetirada) { btnRetirada.style.borderColor = 'var(--border-light)'; btnRetirada.style.background = 'var(--card-bg)'; btnRetirada.style.color = 'var(--text-primary)'; }

            const step2 = document.getElementById('fechamentoStep2');
            if (step2) step2.style.display = 'none';
            const dataEntrega = document.getElementById('fechamentoDataEntrega');
            if (dataEntrega) dataEntrega.value = '';
            const errData = document.getElementById('errDataEntrega');
            if (errData) errData.textContent = '';
            const errModo = document.getElementById('errModoFechamento');
            if (errModo) errModo.textContent = '';

            openModal('modalConfirmaFechamento');
            const btn = document.getElementById('btnConfirmaFechar');
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = 'Confirmar Fechamento';
            btn.disabled = false;
            btn.onclick = async () => { await confirmarFechamento(id); };
        }

       async function confirmarFechamento(id) {
            const errModo = document.getElementById('errModoFechamento');
            errModo.textContent = '';

            if (!store.modoFechamentoSelecionado) {
                errModo.textContent = 'Selecione se o produto será entregue ou retirado na loja.';
                return;
            }

            let dataEntrega = null;
            if (store.modoFechamentoSelecionado === 'entrega') {
                dataEntrega = document.getElementById('fechamentoDataEntrega').value;
                const errData = document.getElementById('errDataEntrega');
                errData.textContent = '';
                if (!dataEntrega) { errData.textContent = 'Selecione a data de entrega.'; return; }
            }

            const btn = document.getElementById('btnConfirmaFechar');
            btn.querySelector('.btn-spinner').style.display = 'inline-block';
            btn.querySelector('.btn-text').textContent = 'Salvando...';
            btn.disabled = true;

            try {
                if (!store.mapStatusUUID.length) {
                    const { data } = await db.from('status_orcamento').select('*');
                    store.mapStatusUUID = data || [];
                }
                const statusFechado = store.mapStatusUUID.find(s => s.nome === STATUS.FECHADO);
                if (!statusFechado) throw new Error('Status "Fechado" não encontrado');

                // Fechamento + (se entrega) agendamento de confirmação de recebimento + comentário:
                // tudo em uma única transação atômica via RPC. Ver
                // supabase/migrations/*_rpc_operacoes_atomicas.sql
                const { error } = await db.rpc('rpc_confirmar_fechamento_orcamento', {
                    p_id_orcamento: id,
                    p_id_status_fechado: statusFechado.id_status,
                    p_data_entrega: store.modoFechamentoSelecionado === 'entrega' ? dataEntrega : null,
                    p_autor: store.currentUser.nome
                });
                if (error) throw error;

                if (store.modoFechamentoSelecionado === 'entrega') {
                    closeModal('modalConfirmaFechamento');
                    showToast('🎉 Venda fechada! Agendamento de confirmação criado automaticamente.', 'success');
                    navigateTo('inicio'); 

                } else {
                    // Retirada na loja
                    closeModal('modalConfirmaFechamento');

                    // Exibir parabéns antes de redirecionar
                    setTimeout(() => {
                        showToast('🏆 Parabéns! Venda concluída com sucesso!', 'success');
                    }, 100);
                    navigateTo('inicio'); 
                }
            } catch (e) {
                showToast('Erro ao fechar venda: ' + e.message, 'error');
                btn.querySelector('.btn-spinner').style.display = 'none';
                btn.querySelector('.btn-text').textContent = 'Confirmar Fechamento';
                btn.disabled = false;
            }
        }

        function abrirModalAgendamento() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) return;
            document.getElementById('agendarData').value = orc.data_contato || '';
            document.getElementById('agendarHora').value = orc.hora_contato || '';
            document.getElementById('agendarTipo').value = '';
            document.getElementById('agendarObservacao').value = '';
            document.getElementById('agendarTipoErro').textContent = '';
            document.getElementById('agendarMsg').textContent = '';
            openModal('modalAgendarContato');
        }

        async function agendarContato() {
            const data = document.getElementById('agendarData').value;
            const hora = document.getElementById('agendarHora').value;
            const tipo = document.getElementById('agendarTipo').value;
            const obs = document.getElementById('agendarObservacao')?.value?.trim() || '';
            const tipoErro = document.getElementById('agendarTipoErro');
            
            if (!data) return showToast('Selecione uma data para o agendamento.', 'error');
            if (!tipo) { tipoErro.textContent = 'Selecione o tipo de contato.'; document.getElementById('agendarTipo').style.borderColor = '#ef4444'; return; }
            else { tipoErro.textContent = ''; document.getElementById('agendarTipo').style.borderColor = 'var(--border-light)'; }
            
            const btn = document.getElementById('btnConfirmarAgendamento');
            btn.querySelector('.btn-spinner').style.display = 'inline-block'; btn.querySelector('.btn-text').textContent = 'Salvando...'; btn.disabled = true;
            try {
                const obsAgendamento = obs ? `${tipo}\n${obs}` : tipo;
                const { error: err1 } = await db.from('orcamentos').update({ data_contato: data, hora_contato: hora, observacao_agendamento: obsAgendamento }).eq('id_orcamento', AppState.contextoVenda.clienteAtual.id_orcamento);
                if (err1) throw new Error(err1.message);
                
                closeModal('modalAgendarContato');
                showToast('Agendamento confirmado!', 'success'); await abrirDetalhesCliente(AppState.contextoVenda.clienteAtual.id_orcamento);
            } catch (e) { showToast('Erro ao agendar: ' + e.message, 'error'); } 
            finally { btn.querySelector('.btn-spinner').style.display = 'none'; btn.querySelector('.btn-text').textContent = 'Confirmar Agendamento'; btn.disabled = false; }
        }

        function voltarDetalhes() {
            const fab = document.getElementById('fabButton');
            if (fab && podeCriarOrcamento()) fab.style.display = 'flex';
            store.currentView = store.previousView;
            navigateTo(store.currentView);
        }

        function setQuickDate(dias) {
            const iso = addDiasBrasilia(dias);
            const input = document.getElementById('agendarData');
            if (input) input.value = iso;
        }

        function expandirComentario() {
            const btn = document.getElementById('btnExpandComment');
            const form = document.getElementById('formComentario');
            if (btn) btn.style.display = 'none';
            if (form) { form.classList.add('open'); const ta = document.getElementById('novoComentario'); if (ta) ta.focus(); }
        }

export { _ajusteAtualizarLixeiras, _ajusteBuildSelectOpts, abrirAjusteProposta, abrirConfirmaFechamento, abrirDetalhesCliente, abrirModalAgendamento, abrirModalAgendarNovoOrcamento, abrirModalGerarOrcamento, abrirMotivoPerda, abrirNovoOrcamento, adicionarProdutoRow, agendarContato, ajusteAdicionarLinha, ajusteRecalcularLinha, ajusteRecalcularTotal, ajusteValidarDesconto, atualizarBotoesLixeira, atualizarTextoOrcamentoComDesconto, buildProdutoSelectOptions, buildProdutosOptionsDatalist, calcTotalModal, carregarProdutos, confirmarFechamento, confirmarPerda, copiarTextoOrcamento, enviarOrcamentoWhatsApp, expandirComentario, fecharProdutoSugestoes, filtrarProdutoSugestoes, marcarTextoOrcamentoEditadoManualmente, montarTextoOrcamento, prodNomeKeydown, recalcularLinhaNovoOrcamento, removerProdutoRow, renderDetalhesClientePage, renderNovoOrcamentoPage, salvarAjusteProposta, salvarOrcamento, selecionarModoFechamento, selecionarProdutoSugestao, setQuickDate, validarCPF, validarProdutoSelecionado, verificarClientePorCpf, voltarDetalhes };
