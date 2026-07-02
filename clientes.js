// ═══════════════════════════════════════════════════════════════
// MÓDULO DE GESTÃO DE CLIENTES
// Gerencia lista, ficha, edição e exclusão de clientes
// ═══════════════════════════════════════════════════════════════

import {
    getClienteSelecionadoParaAcaoState,
    setClienteSelecionadoParaAcaoState,
    getClienteParaOrcamentoState,
    setClienteParaOrcamentoState,
    getViewAtualState,
    setCurrentViewState,
    getPreviousViewState,
    setPreviousViewState
} from './state.js';

export function createClientesModule(dependencies) {
    const {
        db,
        currentUser,
        STATUS,
        navigateTo,
        showToast,
        escapeHtml,
        renderNotificationBadge,
        buildNotifications,
        todosVendedores,
        listaLojas,
        classToFormatStatus,
        formatarProdutos
    } = dependencies;

    // Estado interno do módulo
    const _clientes = {
        todos: [],
        cursor: 0,
        pageSize: 30,
        loading: false,
        observer: null,
        isGerente: false,
        isVendedor: false,
        pk: null
    };

    /**
     * Detecta a chave primária da tabela clientes
     */
    async function detectClientePK() {
        if (window._clientePK) return window._clientePK;
        
        const { data, error } = await db.from('clientes').select('*').limit(1);
        if (error || !data || data.length === 0) {
            for (const candidate of ['id_cliente', 'id', 'uuid']) {
                const probe = await db.from('clientes').select(candidate).limit(1);
                if (!probe.error) { 
                    window._clientePK = candidate; 
                    return candidate; 
                }
            }
            return 'id';
        }
        
        const row = data[0];
        for (const candidate of ['id_cliente', 'id', 'uuid']) {
            if (candidate in row) { 
                window._clientePK = candidate; 
                return candidate; 
            }
        }
        
        const pk = Object.keys(row).find(k => k.toLowerCase().includes('id')) || Object.keys(row)[0];
        window._clientePK = pk;
        return pk;
    }

    /**
     * Renderiza a página de lista de clientes
     */
    async function renderClientesLista() {
        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Carregando clientes...</div>';
        
        try {
            const pk = _clientes.pk || (await detectClientePK());
            _clientes.pk = pk;
            
            const isVendedor = currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal';
            const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            
            _clientes.isVendedor = isVendedor;
            _clientes.isGerente = isGerente;

            let query = db.from('clientes')
                .select(`${pk}, nome_cliente, whatsapp, cpf, email, id_cliente_codigo, orcamentos(id_orcamento, data_criacao, id_usuario, usuarios(nome))`)
                .order('nome_cliente');

            if (isVendedor) {
                const { data: orcsV } = await db.from('orcamentos').select('id_cliente').eq('id_usuario', currentUser.id_usuario);
                const ids = [...new Set((orcsV || []).map(o => o.id_cliente).filter(Boolean))];
                query = query.in(pk, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
            } else if (currentUser.perfil === 'Gerente') {
                const { data: usrs } = await db.from('usuarios').select('id_usuario').eq('id_loja', currentUser.id_loja);
                const idsU = (usrs || []).map(u => u.id_usuario);
                const { data: orcsL } = idsU.length
                    ? await db.from('orcamentos').select('id_cliente').in('id_usuario', idsU)
                    : { data: [] };
                const ids = [...new Set((orcsL || []).map(o => o.id_cliente).filter(Boolean))];
                query = query.in(pk, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
            }

            const { data: clientes, error } = await query;
            if (error) throw error;
            
            (clientes || []).forEach(c => { c._pk = c[pk]; });
            window._clientesCache = clientes || [];
            
            _aplicarFiltroClientes();

            if (typeof renderNotificationBadge === 'function') {
                renderNotificationBadge(buildNotifications().length);
            }
        } catch(e) {
            main.innerHTML = `<div class="error-empty-state">Erro ao carregar clientes: ${escapeHtml(e.message)}</div>`;
        }
    }

    /**
     * Aplica filtro de busca na lista de clientes
     */
    function _aplicarFiltroClientes() {
        if (_clientes.observer) { 
            _clientes.observer.disconnect(); 
            _clientes.observer = null; 
        }

        const busca = (window._clienteBusca || '').toLowerCase().trim();
        const todos = window._clientesCache || [];
        
        _clientes.todos = busca ? todos.filter(c =>
            (c.nome_cliente || '').toLowerCase().includes(busca) ||
            (c.cpf || '').includes(busca) ||
            (c.email || '').toLowerCase().includes(busca) ||
            (c.whatsapp || '').includes(busca) ||
            (c.id_cliente_codigo || '').toLowerCase().includes(busca)
        ) : todos;
        
        _clientes.cursor = 0;

        const main = document.getElementById('mainContent');
        const { isGerente, isVendedor } = _clientes;
        const colspan = isGerente ? 7 : 6;

        main.innerHTML = `
            <header class="dashboard-header">
                <h1>Clientes</h1>
                <div class="header-controls">
                    <div class="header-notification-area">
                        <button class="btn-notification" onclick="event.stopPropagation();toggleNotifications();" aria-label="Notificações">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                            <span class="notification-badge" id="notificationBadgeCount"></span>
                        </button>
                    </div>
                </div>
            </header>
            <div class="table-card">
                <div class="clientes-header-bar">
                    <div class="clientes-search-row">
                        <input type="text" class="search-input" placeholder="Buscar por nome, CPF, e-mail..." id="inputBuscaClientes"
                            value="${escapeHtml(window._clienteBusca || '')}"
                            oninput="filtrarClientesLista(this.value)" style="width:260px;">
                    </div>
                    <span id="clientesCount" style="font-size:var(--font-xs);color:var(--text-muted);">
                        ${_clientes.todos.length} cliente${_clientes.todos.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div style="overflow-x:auto;">
                    <table>
                        <thead><tr>
                            <th style="width:100px;">ID</th>
                            <th>Nome / Razão Social</th>
                            <th>E-mail</th>
                            <th>Telefone</th>
                            ${isGerente ? '<th>Vendedor</th>' : ''}
                            <th>Último Contato</th>
                            <th style="width:130px;">Ações</th>
                        </tr></thead>
                        <tbody id="clientesTbody">
                            ${_clientes.todos.length === 0
                                ? `<tr><td colspan="${colspan}" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum cliente encontrado.</td></tr>`
                                : ''}
                        </tbody>
                    </table>
                    <div id="clientesSentinel" style="height:1px;"></div>
                </div>
            </div>`;

        if (_clientes.todos.length > 0) {
            _renderLoteClientes();
            _setupInfiniteScroll();
        }
    }

    /**
     * Cria uma linha de cliente para a tabela
     */
    function _rowCliente(c) {
        const { isGerente, isVendedor } = _clientes;
        const orcs = c.orcamentos || [];
        orcs.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
        const ultimoOrc = orcs[0];
        const ultimoContato = ultimoOrc ? new Date(ultimoOrc.data_criacao).toLocaleDateString('pt-BR') : '-';
        const vendedor = ultimoOrc?.usuarios?.nome || '-';
        const codigo = c.id_cliente_codigo || String(c._pk || '').slice(0, 8) || '-';

        const tr = document.createElement('tr');

        // Código
        const tdCod = document.createElement('td');
        const spanCod = document.createElement('span');
        spanCod.className = 'cliente-id-badge';
        spanCod.textContent = codigo;
        tdCod.appendChild(spanCod);

        // Nome
        const tdNome = document.createElement('td');
        const spanNome = document.createElement('span');
        spanNome.className = 'client-name';
        spanNome.style.cursor = 'pointer';
        spanNome.textContent = c.nome_cliente || '-';
        spanNome.addEventListener('click', () => abrirFichaCliente(c._pk));
        tdNome.appendChild(spanNome);

        // Email
        const tdEmail = document.createElement('td');
        tdEmail.style.color = 'var(--text-secondary)';
        tdEmail.textContent = c.email || '-';

        // WhatsApp
        const tdWpp = document.createElement('td');
        tdWpp.textContent = c.whatsapp || '-';

        // Vendedor (só gerente)
        const tdVend = document.createElement('td');
        if (isGerente) tdVend.textContent = vendedor;

        // Último contato
        const tdContato = document.createElement('td');
        tdContato.textContent = ultimoContato;

        // Ações
        const tdAcoes = document.createElement('td');
        const divAcoes = document.createElement('div');
        divAcoes.style.cssText = 'display:flex; gap:4px; align-items:center;';

        const btnVer = document.createElement('button');
        btnVer.className = 'btn-action-icon';
        btnVer.title = 'Ver ficha';
        btnVer.innerHTML = `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        btnVer.addEventListener('click', () => abrirFichaCliente(c._pk));

        const btnEditar = document.createElement('button');
        btnEditar.className = 'btn-action-icon';
        btnEditar.title = 'Editar';
        btnEditar.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        btnEditar.addEventListener('click', () => abrirModalEditarCliente(c._pk));

        divAcoes.appendChild(btnVer);
        divAcoes.appendChild(btnEditar);

        if (!isVendedor) {
            const btnExcluir = document.createElement('button');
            btnExcluir.className = 'btn-action-icon danger';
            btnExcluir.title = 'Excluir';
            btnExcluir.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
            btnExcluir.addEventListener('click', () => abrirModalExcluirCliente(c._pk, c.nome_cliente || ''));
            divAcoes.appendChild(btnExcluir);
        }

        tdAcoes.appendChild(divAcoes);

        tr.appendChild(tdCod);
        tr.appendChild(tdNome);
        tr.appendChild(tdEmail);
        tr.appendChild(tdWpp);
        if (isGerente) tr.appendChild(tdVend);
        tr.appendChild(tdContato);
        tr.appendChild(tdAcoes);

        return tr;
    }

    /**
     * Renderiza um lote de clientes (rolagem infinita)
     */
    function _renderLoteClientes() {
        if (_clientes.loading) return;
        const tbody = document.getElementById('clientesTbody');
        if (!tbody) return;
        const { todos, cursor, pageSize } = _clientes;
        if (cursor >= todos.length) return;
        
        _clientes.loading = true;
        const lote = todos.slice(cursor, cursor + pageSize);
        const frag = document.createDocumentFragment();
        lote.forEach(c => frag.appendChild(_rowCliente(c)));
        tbody.appendChild(frag);
        _clientes.cursor += lote.length;
        _clientes.loading = false;
    }

    /**
     * Configura observer para rolagem infinita
     */
    function _setupInfiniteScroll() {
        const sentinel = document.getElementById('clientesSentinel');
        if (!sentinel) return;
        
        _clientes.observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && _clientes.cursor < _clientes.todos.length) {
                _renderLoteClientes();
            }
        }, { rootMargin: '200px' });
        
        _clientes.observer.observe(sentinel);
    }

    /**
     * Filtra clientes por busca
     */
    function filtrarClientesLista(val) {
        window._clienteBusca = val;
        if (window._clientesCache) {
            _aplicarFiltroClientes();
        } else {
            renderClientesLista();
        }
    }

    /**
     * Abre ficha do cliente
     */
    async function abrirFichaCliente(idCliente) {
        setClienteSelecionadoParaAcaoState(idCliente);
        const previousView = getViewAtualState();
        setPreviousViewState(previousView);
        setCurrentViewState('ficha_cliente');
        await renderFichaCliente();
    }

    /**
     * Renderiza ficha completa do cliente
     */
    async function renderFichaCliente() {
        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Carregando ficha...</div>';
        
        try {
            const pk = await detectClientePK();
            const { data: c, error } = await db.from('clientes')
                .select('*')
                .eq(pk, getClienteSelecionadoParaAcaoState())
                .single();
                
            if (error || !c) throw new Error('Cliente não encontrado');
            c._pk = c[pk];

            const { data: orcs } = await db.from('orcamentos')
                .select('id_orcamento, protocolo, data_criacao, valor_orcado, modelo_colchao, status_orcamento(nome), usuarios(nome)')
                .eq('id_cliente', c._pk)
                .order('data_criacao', { ascending: false })
                .limit(20);

            const codigo = escapeHtml(c.id_cliente_codigo || String(c._pk || '').slice(0,8) || '-');
            
            const orcsHtml = (orcs || []).length === 0
                ? '<p style="color:var(--text-muted);padding:16px 0;">Nenhum orçamento vinculado.</p>'
                : (orcs || []).map(o => {
                    const st = o.status_orcamento?.nome || '-';
                    const stClass = classToFormatStatus(st);
                    const idNum = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || o.id_orcamento?.slice(0,8));
                    return `<div class="orc-mini-card" onclick="abrirDetalhesCliente('${o.id_orcamento}')">
                        <span class="orc-mini-num">${escapeHtml(String(idNum))}</span>
                        <div class="orc-mini-info">
                            <div style="font-weight:600;font-size:var(--font-sm);margin-bottom:2px;line-height:1.6;">${formatarProdutos(o.modelo_colchao)}</div>
                            <div style="font-size:var(--font-xs);color:var(--text-muted);">${new Date(o.data_criacao).toLocaleDateString('pt-BR')} · ${escapeHtml(o.usuarios?.nome || '-')}</div>
                        </div>
                        <span class="status-tag ${stClass}" style="font-size:10px;">${escapeHtml(st)}</span>
                        <span class="orc-mini-valor">R$ ${parseFloat(o.valor_orcado||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                    </div>`;
                }).join('');

            main.innerHTML = `
                <header class="dashboard-header">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <button class="btn-voltar" onclick="navigateTo('clientes_lista')">← Voltar</button>
                        <h1>${escapeHtml(c.nome_cliente || 'Cliente')}</h1>
                        <span class="cliente-id-badge">${codigo}</span>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button class="btn-primary-action" onclick="abrirModalEditarCliente('${c._pk}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Editar
                        </button>
                        ${currentUser.perfil !== 'Vendedor' ? `<button class="btn-danger-ghost" onclick="abrirModalExcluirCliente('${c._pk}','${escapeHtml(c.nome_cliente||'')}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                            Excluir
                        </button>` : ''}
                    </div>
                </header>
                <div class="ficha-grid">
                    <aside class="ficha-side">
                        <div class="info-card">
                            <h4 class="info-card-title">
                                <svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                Dados do Cliente
                            </h4>
                            <div class="ficha-data-row"><span class="ficha-label">ID</span><span class="ficha-value"><span class="cliente-id-badge">${codigo}</span></span></div>
                            <div class="ficha-data-row"><span class="ficha-label">Nome</span><span class="ficha-value">${escapeHtml(c.nome_cliente||'-')}</span></div>
                            <div class="ficha-data-row"><span class="ficha-label">CPF / CNPJ</span><span class="ficha-value">${escapeHtml(c.cpf||'-')}</span></div>
                            <div class="ficha-data-row"><span class="ficha-label">E-mail</span><span class="ficha-value">${escapeHtml(c.email||'-')}</span></div>
                            <div class="ficha-data-row"><span class="ficha-label">WhatsApp</span><span class="ficha-value">${escapeHtml(c.whatsapp||'-')}</span></div>
                            <div class="ficha-data-row"><span class="ficha-label">Orçamentos</span><span class="ficha-value" style="font-weight:700;">${(orcs||[]).length}</span></div>
                        </div>
                        ${c.whatsapp ? `<a href="https://wa.me/55${(c.whatsapp||'').replace(/\D/g,'')}" target="_blank" class="btn-whatsapp-full">
                            <svg class="btn-whatsapp-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            Iniciar Conversa WhatsApp
                        </a>` : ''}
                    </aside>
                    <div class="info-card">
                        <h4 class="info-card-title" style="margin-bottom:16px;">
                            <svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Últimos Orçamentos
                        </h4>
                        <div style="display:flex;flex-direction:column;gap:10px;">${orcsHtml}</div>
                    </div>
                </div>`;
        } catch(e) {
            main.innerHTML = `<div class="error-empty-state">Erro ao carregar ficha: ${escapeHtml(e.message)}</div>`;
        }
    }

    /**
     * Abre modal de edição de cliente
     */
    function abrirModalEditarCliente(idCliente) {
        document.getElementById('editClienteId').value = idCliente;
        document.getElementById('errEditNome').textContent = '';
        document.getElementById('errEditCpf').textContent = '';
        document.getElementById('errEditTel').textContent = '';
        document.getElementById('errEditEmail').textContent = '';

        const avisoAnterior = document.getElementById('avisoEdicaoCliente');
        if (avisoAnterior) avisoAnterior.remove();

        const isVendedor = currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal';
        const isGerenteOuAdmin = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

        const campoTransferencia = document.getElementById('campoTransferenciaCarteira');
        const selectVendedor = document.getElementById('editClienteVendedor');
        
        if (isGerenteOuAdmin && campoTransferencia && selectVendedor) {
            let optsVendedor = '<option value="">— Manter vendedor atual —</option>';
            const listaFiltrada = currentUser.perfil === 'Gerente'
                ? todosVendedores.filter(v => v.id_loja === currentUser.id_loja)
                : todosVendedores;

            if (currentUser.perfil !== 'Gerente') {
                const lojaMap = {};
                listaLojas.forEach(l => { lojaMap[l.id_loja] = l.nome_loja; });
                const porLoja = {};
                listaFiltrada.forEach(v => {
                    const nomeLoja = lojaMap[v.id_loja] || 'Sem Loja';
                    if (!porLoja[nomeLoja]) porLoja[nomeLoja] = [];
                    porLoja[nomeLoja].push(v);
                });
                Object.keys(porLoja).sort().forEach(nomeLoja => {
                    optsVendedor += `<optgroup label="${escapeHtml(nomeLoja)}">`;
                    porLoja[nomeLoja].forEach(v => {
                        optsVendedor += `<option value="${v.id_usuario}">${escapeHtml(v.nome)}</option>`;
                    });
                    optsVendedor += '</optgroup>';
                });
            } else {
                listaFiltrada.forEach(v => {
                    optsVendedor += `<option value="${v.id_usuario}">${escapeHtml(v.nome)}</option>`;
                });
            }

            selectVendedor.innerHTML = optsVendedor;
            campoTransferencia.style.display = 'block';
        } else if (campoTransferencia) {
            campoTransferencia.style.display = 'none';
        }

        detectClientePK().then(pk => db.from('clientes').select('*').eq(pk, idCliente).single()).then(({data, error}) => {
            if (error || !data) { 
                showToast('Erro ao carregar cliente.', 'error'); 
                return; 
            }
            
            const campoNome = document.getElementById('editClienteNome');
            const campoCpf = document.getElementById('editClienteCpf');
            campoNome.value = data.nome_cliente || '';
            campoCpf.value = data.cpf || '';
            document.getElementById('editClienteTel').value = data.whatsapp || '';
            document.getElementById('editClienteEmail').value = data.email || '';
            
            if (isVendedor) {
                campoNome.disabled = true;
                campoCpf.disabled = true;
                const aviso = document.createElement('div');
                aviso.id = 'avisoEdicaoCliente';
                aviso.className = 'warning-notice';
                aviso.innerHTML = '<svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>Você só pode editar e-mail e telefone. Nome e CPF estão bloqueados.</span>';
                document.getElementById('modalEditarCliente').querySelector('.modal-btns').before(aviso);
            } else {
                campoNome.disabled = false;
                campoCpf.disabled = false;
            }
            
            openModal('modalEditarCliente');
        });
    }

    /**
     * Salva edição de cliente
     */
    async function salvarEdicaoCliente() {
        const id = document.getElementById('editClienteId').value;
        const isVendedor = currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal';
        const isGerenteOuAdmin = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
        
        const nome = document.getElementById('editClienteNome').value.trim();
        const cpfRaw = document.getElementById('editClienteCpf').value.replace(/\D/g,'');
        const tel = document.getElementById('editClienteTel').value.trim();
        const email = document.getElementById('editClienteEmail').value.trim();
        const novoVendedorId = isGerenteOuAdmin ? (document.getElementById('editClienteVendedor')?.value || '') : '';
        
        let valid = true;
        document.getElementById('errEditNome').textContent = '';
        document.getElementById('errEditCpf').textContent = '';
        document.getElementById('errEditTel').textContent = '';
        
        if (!isVendedor && !nome) { 
            document.getElementById('errEditNome').textContent = 'Obrigatório'; 
            valid = false; 
        }
        if (!isVendedor && !cpfRaw) { 
            document.getElementById('errEditCpf').textContent = 'Obrigatório'; 
            valid = false; 
        }
        if (!tel) { 
            document.getElementById('errEditTel').textContent = 'Obrigatório'; 
            valid = false; 
        }
        
        if (!valid) return;

        const pk = await detectClientePK();
        let updatePayload = { whatsapp: tel, email };

        if (!isVendedor) {
            const { data: dup } = await db.from('clientes').select(pk).eq('cpf', cpfRaw).neq(pk, id).maybeSingle();
            if (dup) { 
                document.getElementById('errEditCpf').textContent = 'CPF/CNPJ já pertence a outro cliente.'; 
                return; 
            }
            updatePayload.nome_cliente = nome;
            updatePayload.cpf = cpfRaw;
        }

        const btn = document.getElementById('btnSalvarEditCliente');
        btn.classList.add('saving'); 
        btn.disabled = true;
        
        try {
            const { error } = await db.from('clientes').update(updatePayload).eq(pk, id);
            if (error) throw error;

            if (isGerenteOuAdmin && novoVendedorId) {
                const { error: errTransf } = await db.from('orcamentos')
                    .update({ id_usuario: novoVendedorId })
                    .eq('id_cliente', id);
                if (errTransf) throw new Error('Dados salvos, mas erro na transferência: ' + errTransf.message);

                const vendedor = todosVendedores.find(v => v.id_usuario === novoVendedorId);
                showToast(`Cliente transferido para ${vendedor?.nome || 'novo vendedor'} com sucesso!`, 'success');
            } else {
                showToast('Cliente atualizado com sucesso!', 'success');
            }

            closeModal('modalEditarCliente');
            
            const currentView = getViewAtualState();
            if (currentView === 'ficha_cliente') await renderFichaCliente();
            else await renderClientesLista();
        } catch(e) { 
            showToast('Erro ao salvar: ' + e.message, 'error'); 
        } finally { 
            btn.classList.remove('saving'); 
            btn.disabled = false; 
        }
    }

    /**
     * Abre modal de exclusão de cliente
     */
    function abrirModalExcluirCliente(idCliente, nomeCliente) {
        setClienteSelecionadoParaAcaoState(idCliente);
        document.getElementById('nomeClienteExcluir').textContent = nomeCliente;
        document.getElementById('errExcluirCliente').textContent = '';
        document.getElementById('avisoExcluirCliente').textContent = 'Atenção: se este cliente possuir orçamentos vinculados, a exclusão será bloqueada. Considere apenas editar o cadastro.';
        openModal('modalExcluirCliente');
    }

    /**
     * Confirma exclusão de cliente
     */
    async function confirmarExcluirCliente() {
        if (currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal') {
            showToast('Você não tem permissão para excluir clientes.', 'error');
            closeModal('modalExcluirCliente');
            return;
        }
        
        const id = getClienteSelecionadoParaAcaoState();
        if (!id) return;
        
        const btn = document.getElementById('btnConfirmarExcluirCliente');
        btn.classList.add('saving'); 
        btn.disabled = true;
        
        try {
            const pk = await detectClientePK();
            const { count, error: ce } = await db.from('orcamentos').select('*', {count:'exact',head:true}).eq('id_cliente', id);
            
            if (ce) throw ce;
            if (count > 0) {
                document.getElementById('errExcluirCliente').textContent = `Não é possível excluir: cliente possui ${count} orçamento(s) vinculado(s).`;
                return;
            }
            
            const { error } = await db.from('clientes').delete().eq(pk, id);
            if (error) throw error;
            
            showToast('Cliente excluído com sucesso.', 'success');
            closeModal('modalExcluirCliente');
            setClienteSelecionadoParaAcaoState(null);
            await renderClientesLista();
        } catch(e) { 
            showToast('Erro ao excluir: ' + e.message, 'error'); 
        } finally { 
            btn.classList.remove('saving'); 
            btn.disabled = false; 
        }
    }

    /**
     * Navega para novo orçamento com cliente pré-selecionado
     */
    function irParaNovoOrcamentoComCliente() {
        navigateTo('novo_orcamento');
        setTimeout(() => {
            if (!getClienteParaOrcamentoState()) return;
            const nome = document.getElementById('modNome');
            const cpf = document.getElementById('modCpf');
            const tel = document.getElementById('modWhats');
            if (nome) nome.value = getClienteParaOrcamentoState().nome || '';
            if (cpf) cpf.value = getClienteParaOrcamentoState().cpf || '';
            if (tel) tel.value = getClienteParaOrcamentoState().tel || '';
            setClienteParaOrcamentoState(null);
        }, 300);
    }

    // Expõe funções públicas
    return {
        renderClientesLista,
        filtrarClientesLista,
        abrirFichaCliente,
        renderFichaCliente,
        abrirModalEditarCliente,
        salvarEdicaoCliente,
        abrirModalExcluirCliente,
        confirmarExcluirCliente,
        irParaNovoOrcamentoComCliente,
        detectClientePK,
        // Exporta estado interno para compatibilidade
        getClientesState: () => _clientes
    };
}
