// ═══════════════════════════════════════════════════════════════
// Módulo: estoque.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { LIMITE_ESTOQUE_BAIXO } from './constants.js';
import { getLojasPermitidas, store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

        async function verificarAlertasEstoque() {
            try {
                const isAdminOuGerente = store.currentUser && (
                    store.currentUser.perfil === 'Administrador' ||
                    store.currentUser.perfil === 'Admin' ||
                    store.currentUser.perfil === 'Gerente'
                );
                if (!isAdminOuGerente) return;

                let query = db
                    .from('estoque')
                    .select('id, qtd_disponivel, qualidade, id_loja')
                    .lte('qtd_disponivel', LIMITE_ESTOQUE_BAIXO);

                const isAdmin = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
                if (!isAdmin) {
                    const lojasPermitidas = getLojasPermitidas();
                    query = query.in('id_loja', (lojasPermitidas && lojasPermitidas.length > 0) ? lojasPermitidas : ['00000000-0000-0000-0000-000000000000']);
                }

                const { data, error } = await query;
                if (error) {
                    console.error('Erro ao verificar alertas de estoque:', error);
                    return;
                }

                const itensBaixos = (data || []).filter(item => (item.qualidade || '').toLowerCase().trim() !== 'avaria');
                if (itensBaixos.length > 0 && typeof showToast === 'function') {
                    showToast(`⚠️ ${itensBaixos.length} produto(s) com estoque baixo.`, 'warning');
                }
            } catch (e) {
                console.error('Falha ao verificar alertas de estoque:', e);
            }
        }

function fecharModalNovoProduto() {
    closeModal('modalNovoProduto');
}

function abrirModalNovoProduto() {
    // Resetar formulário
    const form = document.getElementById('formNovoProduto');
    if (form) form.reset();
    
    // Carregar categorias dinamicamente
    carregarCategoriasEstoque();

    // Popular o select de Loja: Admin escolhe entre todas; demais perfis só entre as lojas permitidas.
    const selectLoja = document.getElementById('novoProdLoja');
    const campoLoja = document.getElementById('campoNovoProdLoja');
    if (selectLoja) {
        const isAdminNovoProd = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        const lojasPermitidasNovoProd = getLojasPermitidas();
        const lojasParaEscolher = isAdminNovoProd
            ? store.listaLojas
            : store.listaLojas.filter(l => (lojasPermitidasNovoProd || []).includes(l.id_loja));

        selectLoja.innerHTML = '<option value="" disabled selected>Selecione a loja...</option>';
        lojasParaEscolher.slice().sort((a, b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id_loja;
            opt.textContent = l.nome_loja;
            selectLoja.appendChild(opt);
        });

        // Se só existe UMA loja para escolher (caso comum: Gerente/Vendedor de loja única),
        // pré-seleciona e esconde o campo pra não pedir uma escolha óbvia.
        if (lojasParaEscolher.length === 1) {
            selectLoja.value = lojasParaEscolher[0].id_loja;
            if (campoLoja) campoLoja.style.display = 'none';
        } else if (campoLoja) {
            campoLoja.style.display = 'block';
        }
    }
    
    // Popular o select de produtos base usando o array global store.todosProdutos
    const selectBase = document.getElementById('novoProdSelecaoBase');
    if (selectBase && typeof store.todosProdutos !== 'undefined' && Array.isArray(store.todosProdutos)) {
        selectBase.innerHTML = '<option value="" disabled selected>Selecione um produto...</option>';
        store.todosProdutos.forEach(prod => {
            const option = document.createElement('option');
            option.value = prod.id_produto;
            option.textContent = `${prod.codigo} - ${prod.nome}`;
            // Armazena dados no próprio elemento option para acesso fácil
            option.dataset.codigo = prod.codigo;
            option.dataset.nome = prod.nome;
            selectBase.appendChild(option);
        });
        
        // Adiciona listener para atualizar data attributes no select quando mudar
        selectBase.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                this.dataset.codigo = selectedOption.dataset.codigo;
                this.dataset.nome = selectedOption.dataset.nome;
                this.dataset.idProduto = selectedOption.value;
            } else {
                delete this.dataset.codigo;
                delete this.dataset.nome;
                delete this.dataset.idProduto;
            }
        });
    }
    
    // Abrir modal usando a função padrão do sistema
    openModal('modalNovoProduto');
}

async function carregarCategoriasEstoque() {
    const select = document.getElementById('novoProdCategoria');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Carregando...</option>';

    try {
        const { data, error } = await db
            .from('categorias')
            .select('id, nome')
            .order('nome');

        if (error) throw error;

        select.innerHTML = '<option value="" disabled selected>Selecione uma categoria...</option>';
        
        if (data && data.length > 0) {
            data.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nome;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="" disabled>Sem categorias cadastradas</option>';
        }
    } catch (e) {
        console.error('Erro ao carregar categorias:', e);
        showToast('Erro ao carregar categorias: ' + e.message, 'error');
        select.innerHTML = '<option value="" disabled>Erro ao carregar</option>';
    }
}

async function salvarNovoProdutoEstoque(event) {
    event.preventDefault();

    // Obter dados do select de produto base
    const selectBase = document.getElementById('novoProdSelecaoBase');
    const idProduto = selectBase?.dataset.idProduto;
    const codigo = selectBase?.dataset.codigo;
    const nome = selectBase?.dataset.nome;
    
    const categoriaId = document.getElementById('novoProdCategoria')?.value;
    
    const qualidadeEl = document.getElementById('novoProdQualidade');
    if (!qualidadeEl || !qualidadeEl.value) {
        showToast('Selecione a qualidade do produto.', 'warning');
        return;
    }
    const qualidade = qualidadeEl.value;
    
    const qtdInicial = parseInt(document.getElementById('novoProdQuantidade')?.value) || 0;
    const lojaId = document.getElementById('novoProdLoja')?.value;

    if (!idProduto || !codigo || !nome) {
        showToast('Selecione um produto base válido.', 'warning');
        return;
    }
    if (!categoriaId) {
        showToast('Selecione uma categoria válida.', 'warning');
        return;
    }
    if (!lojaId) {
        showToast('Selecione a loja do produto.', 'warning');
        return;
    }

    const btnSalvar = event.target.querySelector('button[type="submit"]');
    const originalText = btnSalvar.textContent;
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    try {
        const payload = {
            id_produto: idProduto,
            codigo_produto: codigo,
            nome_produto: nome,
            categoria_id: parseInt(categoriaId),
            qualidade: qualidade,
            qtd_disponivel: qtdInicial,
            status: 'Ativo',
            id_loja: lojaId
        };

        const { error } = await db.from('estoque').insert(payload);

        if (error) {
            if (error.code === '23505') {
                // Unicidade é por (loja, produto, qualidade) — só bate aqui se
                // ESSA loja já tem esse produto nessa qualidade específica.
                // Outra loja ter o mesmo modelo não colide mais (era um bug).
                throw new Error('Este produto já está cadastrado nesta loja com essa qualidade.');
            }
            throw error;
        }

        showToast('Produto adicionado com sucesso!', 'success');
        fecharModalNovoProduto();
        
        if (typeof renderEstoquePage === 'function') {
            await renderEstoquePage();
        } else if (typeof renderEstoque === 'function') {
            await renderEstoque();
        }

    } catch (e) {
        showToast('Erro ao salvar: ' + e.message, 'error');
    } finally {
        btnSalvar.textContent = originalText;
        btnSalvar.disabled = false;
    }
}

async function renderEstoque() {
    const main = document.getElementById('mainContent');
    if (!main) return;

    main.innerHTML = `
        <header class="dashboard-header">
            <div style="display:flex;align-items:center;gap:12px;">
                <span class="page-icon orange" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                <h1 style="margin:0;">Controle de Estoque</h1>
            </div>
        </header>

        <div class="kpi-grid">
            <div class="kpi-card">
                <span class="kpi-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Total de Produtos</span></div>
                <div class="kpi-value" id="estoqueKpiTotal">-</div>
            </div>
            <div class="kpi-card">
                <span class="kpi-icon green" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Disponível</span></div>
                <div class="kpi-value" style="color: var(--status-success-text);" id="estoqueKpiDisponivel">-</div>
            </div>
            <div class="kpi-card">
                <span class="kpi-icon orange" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Reservado</span></div>
                <div class="kpi-value" style="color: var(--status-warning-text);" id="estoqueKpiReservado">-</div>
            </div>
            <div class="kpi-card">
                <span class="kpi-icon red" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot red"></span><span class="kpi-label">Baixo Estoque</span></div>
                <div class="kpi-value" style="color: var(--danger-text);" id="estoqueKpiBaixo">-</div>
            </div>
        </div>

        <div class="table-card">
            <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
                <input type="text" id="estoqueBuscaInput" class="form-input" placeholder="Buscar por nome ou código..." value="${store.filtroEstoqueBusca}" oninput="filtrarEstoque()" style="flex: 1; min-width: 200px;">
                <select id="estoqueFiltroCategoria" class="form-input" onchange="filtrarEstoque()" style="width: 180px;">
                    <option value="todas">Categorias</option>
                </select>
                <select id="estoqueFiltroQualidade" class="form-input" onchange="filtrarEstoque()" style="width: 160px;">
                    <option value="todas">Qualidades</option>
                    <option value="novo">Novo</option>
                    <option value="mostruario">Mostruário</option>
                    <option value="avaria">Avaria</option>
                </select>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Qualidade</th>
                        <th style="text-align: center;">Disponível</th>
                        <th style="text-align: center;">Reservado</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="estoqueTableBody">
                    <tr><td colspan="7" style="text-align: center; padding: 40px;">Carregando estoque...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    await carregarEstoqueComProdutos();
}

async function carregarEstoqueComProdutos() {
    try {
        // 1. Busca os dados do estoque com o relacionamento de categorias
        let queryEstoque = db.from('estoque').select('*, categorias(nome)');

        // Admin vê tudo. Gerente/Vendedor só veem o estoque das lojas permitidas.
        const isAdminEstoque = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        if (!isAdminEstoque) {
            const lojasPermitidasEstoque = getLojasPermitidas();
            queryEstoque = queryEstoque.in('id_loja', (lojasPermitidasEstoque && lojasPermitidasEstoque.length > 0) ? lojasPermitidasEstoque : ['00000000-0000-0000-0000-000000000000']);
        }

        const { data: estoqueDataResp, error: estoqueError } = await queryEstoque;

        if (estoqueError) throw estoqueError;
        store.estoqueData = estoqueDataResp;

        // 2. Busca todas as categorias para popular o filtro
        const { data: categoriasData, error: catError } = await db
            .from('categorias')
            .select('id, nome')
            .order('nome');

        if (catError) throw catError;

        // 3. Popula o select de filtro dinamicamente
        const selectFiltro = document.getElementById('estoqueFiltroCategoria');
        if (selectFiltro) {
            selectFiltro.innerHTML = '<option value="todas">Categorias</option>';
            
            if (categoriasData && categoriasData.length > 0) {
                categoriasData.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id; // Usa o ID como valor
                    option.textContent = cat.nome; // Usa o nome como exibição
                    selectFiltro.appendChild(option);
                });
            }
        }

        // 4. Salva os dados completos para uso na função de filtro
        window.dadosEstoqueCompleto = store.estoqueData;

        // 5. Atualiza KPIs e renderiza a tabela
        atualizarKpisEstoque();
        filtrarEstoque();
    } catch (e) {
        showToast('Erro ao carregar estoque: ' + e.message, 'error');
        document.getElementById('estoqueTableBody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--danger-text);">Erro ao carregar dados</td></tr>';
    }
}

function atualizarKpisEstoque() {
    const dados = window.dadosEstoqueCompleto || [];
    
    // 1. Total: Volume físico real (Disponível + Reservado)
    const total = dados.reduce((sum, item) => {
        const disp = parseInt(item.qtd_disponivel) || 0;
        const res = parseInt(item.qtd_reservada) || 0;
        return sum + (disp + res);
    }, 0);

    // 2. Disponível: Apenas produtos que NÃO são avaria
    const disponivel = dados
        .filter(item => (item.qualidade || '').toLowerCase() !== 'avaria')
        .reduce((sum, item) => sum + (parseInt(item.qtd_disponivel) || 0), 0);

    // 3. Reservado: Soma das unidades comprometidas
    const reservado = dados.reduce((sum, item) => sum + (parseInt(item.qtd_reservada) || 0), 0);

    // 4. Baixo Estoque: Produtos com menos de 5 unidades (incluindo 0)
    const baixo = dados.filter(item => {
        const qtd = parseInt(item.qtd_disponivel) || 0;
        return qtd < 5;
    }).length;

    const elTotal = document.getElementById('estoqueKpiTotal');
    const elDisp = document.getElementById('estoqueKpiDisponivel');
    const elRes = document.getElementById('estoqueKpiReservado');
    const elBaixo = document.getElementById('estoqueKpiBaixo');

    if (elTotal) elTotal.textContent = total;
    if (elDisp) elDisp.textContent = disponivel;
    if (elRes) elRes.textContent = reservado;
    if (elBaixo) elBaixo.textContent = baixo;
}

function filtrarEstoque() {
    store.filtroEstoqueBusca = document.getElementById('estoqueBuscaInput')?.value.toLowerCase() || '';
    store.filtroEstoqueCategoria = document.getElementById('estoqueFiltroCategoria')?.value || 'todas';
    store.filtroEstoqueQualidade = document.getElementById('estoqueFiltroQualidade')?.value || 'todas';

    // Acessando a fonte de dados original
    const dadosOriginais = window.dadosEstoqueCompleto || store.estoqueData || []; 

    const filtrados = dadosOriginais.filter(item => {
        const codigo = (item.codigo_produto || '').toLowerCase();
        const nome = (item.nome_produto || '').toLowerCase();
        const qualidade = (item.qualidade || '').toLowerCase().trim();

        const matchBusca = codigo.includes(store.filtroEstoqueBusca) || nome.includes(store.filtroEstoqueBusca);
        // Filtro por Categoria (Comparando ID)
        const matchCategoria = store.filtroEstoqueCategoria === 'todas' || String(item.categoria_id) === String(store.filtroEstoqueCategoria);
        const matchQualidade = store.filtroEstoqueQualidade === 'todas' || qualidade === store.filtroEstoqueQualidade;

        return matchBusca && matchCategoria && matchQualidade;
    });

    renderizarTabelaEstoque(filtrados);
}

function renderizarTabelaEstoque(data) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum produto encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const disponivel = item.qtd_disponivel || 0;
        const reservado = item.qtd_reservada || 0;
        const qualidade = (item.qualidade || '').toLowerCase().trim() || 'novo';

        // Pill de quantidade disponível
        let pillClass = 'pill-success';
        let pillText = 'OK';
        if (disponivel === 0) {
            pillClass = 'pill-danger';
            pillText = 'Zero';
        } else if (disponivel <= 5) {
            pillClass = 'pill-warning';
            pillText = 'Baixo';
        }

        // Tag de qualidade
        let qualidadeClass = 'tag-novo';
        let qualidadeLabel = 'Novo';
        if (qualidade === 'mostruario') {
            qualidadeClass = 'tag-mostruario';
            qualidadeLabel = 'Mostruário';
        } else if (qualidade === 'avaria') {
            qualidadeClass = 'tag-avaria';
            qualidadeLabel = 'Avaria';
        }

        return `
            <tr>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: var(--font-xs);">${escapeHtml(item.codigo_produto || '-')}</td>
                <td><strong>${escapeHtml(item.nome_produto || 'Produto não vinculado')}</strong></td>
                <td>${escapeHtml(item.categorias?.nome || '-')}</td>
                <td><span class="quality-tag ${qualidadeClass}">${qualidadeLabel}</span></td>
                <td style="text-align: center;"><span class="pill ${pillClass}">${disponivel}</span></td>
                <td style="text-align: center; color: var(--text-muted);">${reservado}</td>
                <td><span class="status-pill ${pillClass}">${pillText}</span></td>
            </tr>
        `;
    }).join('');
}

export { abrirModalNovoProduto, atualizarKpisEstoque, carregarCategoriasEstoque, carregarEstoqueComProdutos, fecharModalNovoProduto, filtrarEstoque, renderEstoque, renderizarTabelaEstoque, salvarNovoProdutoEstoque, verificarAlertasEstoque };
