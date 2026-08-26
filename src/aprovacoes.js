// ═══════════════════════════════════════════════════════════════
// Módulo: aprovacoes.js — "Gerenciamento de Acessos" do Gerente (aprovar/
// rejeitar vendedores da própria loja) + helpers reaproveitados pela tela
// de Admin > Usuários (usuarios.js) pra aprovar/rejeitar Gerente.
// ═══════════════════════════════════════════════════════════════
import { store } from './state.js';
import { db } from './supabaseClient.js';
import { showToast } from './ui.js';
import { escapeHtml } from './utils.js';

// Badge numérico no item de menu "Acessos" — mesma classe .notification-badge
// já usada no sino de notificações, só que contando vendedores Pendente da
// própria loja em vez de notificações não lidas.
async function atualizarBadgeAcessosPendentes() {
    const badge = document.getElementById('badgeAcessosPendentes');
    if (!badge) return;
    try {
        const { count } = await db.from('usuarios')
            .select('id_usuario', { count: 'exact', head: true })
            .eq('perfil', 'Vendedor')
            .eq('status', 'Pendente');
        badge.textContent = count > 0 ? String(count) : '';
        badge.classList.toggle('visible', count > 0);
    } catch (e) {
        console.error('Erro ao contar acessos pendentes:', e);
    }
}

const STATUS_INFO = {
    Pendente: { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', text: 'var(--status-warning-text)' },
    Ativo: { bg: 'var(--status-success-bg)', border: 'var(--status-success-border)', text: 'var(--status-success-text)' },
    Rejeitado: { bg: 'var(--status-error-bg)', border: 'var(--status-error-border)', text: 'var(--status-error-text)' },
};

function chipStatus(status) {
    const info = STATUS_INFO[status] || STATUS_INFO.Pendente;
    return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;background:${info.bg};border:1px solid ${info.border};color:${info.text};">${escapeHtml(status)}</span>`;
}

let listaVendedoresCache = [];
let filtroStatusAtual = 'Pendente';
let buscaAtual = '';

async function renderGerenciamentoAcessos() {
    const main = document.getElementById('mainContent');
    if (!main) return;

    // Código da própria loja, pra mostrar no topo (o que o Gerente repassa
    // aos vendedores). getLojasPermitidas() pode ter mais de uma loja
    // (Gerente multiloja) — mostra a base (id_loja) por simplicidade.
    const { data: loja } = await db.from('lojas').select('nome_loja, codigo').eq('id_loja', store.currentUser.id_loja).maybeSingle();

    main.innerHTML = `
        <header class="dashboard-header">
            <div style="display:flex;align-items:center;gap:12px;">
                <span class="page-icon purple" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M22 11l-2 2-1-1"/></svg></span>
                <h1 style="margin:0;">Gerenciamento de Acessos</h1>
            </div>
        </header>

        ${loja ? `
        <div class="kpi-card" style="margin-bottom:20px; flex-direction:row; align-items:center; justify-content:space-between; min-height:0; padding:18px 22px;">
            <div>
                <div class="kpi-label" style="margin-bottom:4px;">Código da loja "${escapeHtml(loja.nome_loja)}"</div>
                <div style="font-family:'JetBrains Mono',monospace; font-size:1.4rem; font-weight:800; letter-spacing:0.08em; color:var(--text-primary);" id="codigoLojaTexto">${escapeHtml(loja.codigo)}</div>
            </div>
            <button class="btn-cancelar-modal" style="flex:none; padding:9px 16px;" onclick="copiarCodigoLoja('${escapeHtml(loja.codigo)}')">Copiar código</button>
        </div>
        ` : ''}

        <div class="table-card">
            <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
                <input type="text" id="buscaAcessos" class="form-input" placeholder="Buscar por nome ou e-mail..." style="flex:1; min-width:200px;" oninput="filtrarAcessos()">
                <select id="filtroStatusAcessos" class="form-input" style="width:180px;" onchange="filtrarAcessos()">
                    <option value="Pendente">Pendentes</option>
                    <option value="Ativo">Aprovados</option>
                    <option value="Rejeitado">Rejeitados</option>
                    <option value="todos">Todos</option>
                </select>
            </div>
            <div style="overflow-x:auto;">
                <table>
                    <thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                    <tbody id="tabelaAcessos"><tr><td colspan="6" style="text-align:center; padding:40px;">Carregando...</td></tr></tbody>
                </table>
            </div>
        </div>
    `;
    document.getElementById('filtroStatusAcessos').value = filtroStatusAtual;

    await carregarVendedoresDaLoja();
}

async function carregarVendedoresDaLoja() {
    try {
        const { data, error } = await db.from('usuarios')
            .select('id_usuario, nome, email, telefone, status, motivo_rejeicao, criado_em')
            .eq('perfil', 'Vendedor')
            .order('criado_em', { ascending: false });
        if (error) throw error;
        listaVendedoresCache = data || [];
        filtrarAcessos();
    } catch (e) {
        console.error('Erro ao carregar vendedores:', e);
        const tbody = document.getElementById('tabelaAcessos');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--danger-text);">Erro ao carregar solicitações.</td></tr>`;
    }
}

function filtrarAcessos() {
    filtroStatusAtual = document.getElementById('filtroStatusAcessos')?.value || 'Pendente';
    buscaAtual = (document.getElementById('buscaAcessos')?.value || '').trim().toLowerCase();

    let lista = listaVendedoresCache;
    if (filtroStatusAtual !== 'todos') lista = lista.filter(u => u.status === filtroStatusAtual);
    if (buscaAtual) {
        lista = lista.filter(u =>
            (u.nome || '').toLowerCase().includes(buscaAtual) ||
            (u.email || '').toLowerCase().includes(buscaAtual)
        );
    }

    const tbody = document.getElementById('tabelaAcessos');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">Nenhuma solicitação encontrada.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(u => `
        <tr>
            <td>${escapeHtml(u.nome || '-')}</td>
            <td>${escapeHtml(u.email || '-')}</td>
            <td>${escapeHtml(u.telefone || '-')}</td>
            <td>
                ${chipStatus(u.status)}
                ${u.status === 'Rejeitado' && u.motivo_rejeicao ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${escapeHtml(u.motivo_rejeicao)}</div>` : ''}
            </td>
            <td style="font-size:12px; color:var(--text-muted);">${u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '-'}</td>
            <td>
                ${u.status === 'Pendente' ? `
                    <div style="display:flex; gap:6px;">
                        <button class="btn-salvar-modal" style="margin-top:0; padding:6px 12px; font-size:11px;" onclick="decidirAcesso('${u.id_usuario}', 'aprovar')">Aprovar</button>
                        <button class="btn-cancelar-modal" style="padding:6px 12px; font-size:11px; color:var(--danger-text);" onclick="decidirAcesso('${u.id_usuario}', 'rejeitar')">Rejeitar</button>
                    </div>
                ` : '—'}
            </td>
        </tr>
    `).join('');
}

// Reaproveitado por usuarios.js (Admin aprovando Gerente) — decide via a
// mesma Edge Function, só muda de onde é chamado e o que recarrega depois.
async function decidirAcesso(idUsuarioAlvo, decisao, aoConcluir) {
    let motivo = null;
    if (decisao === 'rejeitar') {
        motivo = prompt('Motivo da rejeição (opcional):') || null;
        if (motivo === null) return; // cancelou o prompt
    } else if (!confirm('Aprovar este acesso?')) {
        return;
    }

    try {
        const { data, error } = await db.functions.invoke('aprovar-usuario', {
            body: { idUsuarioAlvo, decisao, motivo },
        });
        if (error || data?.error) {
            let mensagem = data?.error;
            if (!mensagem && error?.context?.json) {
                try { mensagem = (await error.context.json())?.error; } catch (_) { /* ignora */ }
            }
            showToast(mensagem || 'Não foi possível processar a decisão.', 'error');
            return;
        }
        showToast(decisao === 'aprovar' ? 'Acesso aprovado!' : 'Solicitação rejeitada.', 'success');
        if (aoConcluir) await aoConcluir();
        else { await carregarVendedoresDaLoja(); await atualizarBadgeAcessosPendentes(); }
    } catch (e) {
        showToast('Erro: ' + e.message, 'error');
    }
}

function copiarCodigoLoja(codigo) {
    navigator.clipboard?.writeText(codigo).then(
        () => showToast('Código copiado!', 'success'),
        () => showToast('Não foi possível copiar automaticamente. Copie manualmente: ' + codigo, 'info')
    );
}

export { atualizarBadgeAcessosPendentes, chipStatus, copiarCodigoLoja, decidirAcesso, filtrarAcessos, renderGerenciamentoAcessos };
