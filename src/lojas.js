// ═══════════════════════════════════════════════════════════════
// Módulo: lojas.js — Painel do Operador > Assinantes.
//
// Controle 100% manual por enquanto: sem gateway de pagamento integrado
// (Stripe/Asaas) e sem WhatsApp — fica para quando essas configurações
// estiverem prontas. O Administrador (único da plataforma) atualiza aqui o
// plano e o status de pagamento de cada loja; o bloqueio de acesso de quem
// não paga é reforçado em auth.js (checkSession()/handleLogin()).
// ═══════════════════════════════════════════════════════════════
import { navigateTo } from './router.js';
import { store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

const ASSINATURA_INFO = {
    Trial: { bg: 'var(--status-info-bg)', border: 'var(--status-info-border)', text: 'var(--status-info-text)' },
    Ativa: { bg: 'var(--status-success-bg)', border: 'var(--status-success-border)', text: 'var(--status-success-text)' },
    Inadimplente: { bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)', text: 'var(--status-warning-text)' },
    Cancelada: { bg: 'var(--status-error-bg)', border: 'var(--status-error-border)', text: 'var(--status-error-text)' },
};

function chipAssinatura(status) {
    const info = ASSINATURA_INFO[status] || ASSINATURA_INFO.Trial;
    return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:700;background:${info.bg};border:1px solid ${info.border};color:${info.text};">${escapeHtml(status)}</span>`;
}

function souAdministrador() {
    return store.currentUser?.perfil === 'Administrador' || store.currentUser?.perfil === 'Admin';
}

// Conta usuários ativos por loja a partir do cache já carregado em
// configurarPermissoes() (auth.js) — evita mais uma query. Só conta a loja
// "base" do usuário (usuarios.id_loja); um franqueado com lojas adicionais
// via usuario_lojas não é contado nas lojas extras — simplificação
// consciente, mesma da tela de Usuários.
function contarUsuariosAtivos(idLoja) {
    return store.todosUsuarios.filter(u => u.id_loja === idLoja && u.status === 'Ativo').length;
}

async function renderAdminLojas(main) {
    if (!souAdministrador()) { navigateTo('inicio'); return; }

    if (!store.listaLojas || store.listaLojas.length === 0) {
        const { data } = await db.from('lojas').select('*').order('nome_loja');
        store.listaLojas = data || [];
    }

    const total = store.listaLojas.length;
    const emDia = store.listaLojas.filter(l => ['Trial', 'Ativa'].includes(l.assinatura_status || 'Trial')).length;
    const inadimplentes = store.listaLojas.filter(l => l.assinatura_status === 'Inadimplente').length;
    const canceladas = store.listaLojas.filter(l => l.assinatura_status === 'Cancelada').length;

    main.innerHTML = `<header class="dashboard-header">
            <div style="display:flex; align-items:center; gap:16px;">
                <span class="page-icon green" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span>
                <button class="btn-voltar" onclick="navigateTo('admin_inicio')">← Voltar</button>
                <h1>Assinantes</h1>
            </div>
        </header>
        <div class="kpi-row" style="margin-bottom:20px;">
            <div class="kpi-card"><span class="kpi-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Total de Lojas</span></div><div class="kpi-value">${total}</div></div>
            <div class="kpi-card"><span class="kpi-icon green" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></span><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Em dia (Trial + Ativa)</span></div><div class="kpi-value">${emDia}</div></div>
            <div class="kpi-card"><span class="kpi-icon orange" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></span><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Inadimplentes</span></div><div class="kpi-value">${inadimplentes}</div></div>
            <div class="kpi-card"><span class="kpi-icon" style="background:var(--status-error-bg); color:var(--status-error-text);" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span><div class="kpi-label-row"><span class="kpi-dot" style="background:var(--status-error-text);"></span><span class="kpi-label">Canceladas</span></div><div class="kpi-value">${canceladas}</div></div>
        </div>
        <div class="table-card">
            <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
                <input type="text" id="buscaLojasAdmin" class="form-input" placeholder="Buscar por nome ou código..." style="flex:1; min-width:200px;" oninput="filtrarLojasAdmin()">
                <select id="filtroAssinaturaAdmin" class="form-input" style="width:180px;" onchange="filtrarLojasAdmin()">
                    <option value="todos">Todos os status</option>
                    <option value="Trial">Trial</option>
                    <option value="Ativa">Ativa</option>
                    <option value="Inadimplente">Inadimplente</option>
                    <option value="Cancelada">Cancelada</option>
                </select>
            </div>
            <div style="overflow-x:auto;">
                <table><thead><tr><th>Loja</th><th>Código</th><th>Usuários</th><th>Plano</th><th>Assinatura</th><th>Válido até</th><th>Ações</th></tr></thead><tbody id="tabelaLojasAdmin"></tbody></table>
            </div>
        </div>`;
    filtrarLojasAdmin();
}

function filtrarLojasAdmin() {
    const busca = (document.getElementById('buscaLojasAdmin')?.value || '').trim().toLowerCase();
    const statusSel = document.getElementById('filtroAssinaturaAdmin')?.value || 'todos';

    let lista = store.listaLojas || [];
    if (statusSel !== 'todos') lista = lista.filter(l => (l.assinatura_status || 'Trial') === statusSel);
    if (busca) {
        lista = lista.filter(l =>
            (l.nome_loja || '').toLowerCase().includes(busca) ||
            (l.codigo || '').toLowerCase().includes(busca)
        );
    }
    renderLinhasLojasAdmin(lista);
}

function renderLinhasLojasAdmin(lista) {
    const tbody = document.getElementById('tabelaLojasAdmin');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px;">Nenhuma loja encontrada.</td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map(l => `<tr>
            <td><strong>${escapeHtml(l.nome_loja)}</strong></td>
            <td style="font-family:'JetBrains Mono',monospace;">${escapeHtml(l.codigo || '-')}</td>
            <td>${contarUsuariosAtivos(l.id_loja)}</td>
            <td>${escapeHtml(l.plano || 'Trial')}</td>
            <td>${chipAssinatura(l.assinatura_status || 'Trial')}${l.assinatura_obs ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${escapeHtml(l.assinatura_obs)}</div>` : ''}</td>
            <td style="font-size:12px; color:var(--text-muted);">${l.assinatura_valido_ate ? new Date(l.assinatura_valido_ate).toLocaleDateString('pt-BR') : '-'}</td>
            <td><button class="btn-salvar-modal" style="margin-top:0; padding:6px 12px; font-size:11px; background:var(--card-bg); border:1px solid var(--border-light); color:var(--text-primary);" onclick="abrirModalAssinaturaLoja('${l.id_loja}')">Editar</button></td>
        </tr>`).join('');
}

function abrirModalAssinaturaLoja(id) {
    const loja = store.listaLojas.find(l => l.id_loja === id);
    if (!loja) return;
    store.idLojaEmEdicaoAssinatura = id;

    document.getElementById('assinaturaModLojaNome').textContent = loja.nome_loja;
    document.getElementById('assinaturaModPlano').value = loja.plano || 'Trial';
    document.getElementById('assinaturaModStatus').value = loja.assinatura_status || 'Trial';
    document.getElementById('assinaturaModValidoAte').value = loja.assinatura_valido_ate
        ? new Date(loja.assinatura_valido_ate).toISOString().slice(0, 10)
        : '';
    document.getElementById('assinaturaModObs').value = loja.assinatura_obs || '';
    document.getElementById('errAssinaturaLoja').textContent = '';
    openModal('modalAssinaturaLoja');
}

async function salvarAssinaturaLoja() {
    const id = store.idLojaEmEdicaoAssinatura;
    if (!id) return;
    const err = document.getElementById('errAssinaturaLoja');
    const btn = document.getElementById('btnSalvarAssinaturaLoja');

    const plano = document.getElementById('assinaturaModPlano').value;
    const assinatura_status = document.getElementById('assinaturaModStatus').value;
    const validoAteInput = document.getElementById('assinaturaModValidoAte').value;
    const assinatura_obs = document.getElementById('assinaturaModObs').value.trim() || null;

    btn.classList.add('saving'); btn.disabled = true; err.textContent = '';
    try {
        const { error } = await db.from('lojas').update({
            plano,
            assinatura_status,
            assinatura_valido_ate: validoAteInput ? new Date(validoAteInput).toISOString() : null,
            assinatura_obs,
        }).eq('id_loja', id);
        if (error) throw error;

        showToast('Assinatura atualizada com sucesso!', 'success');
        closeModal('modalAssinaturaLoja');
        store.idLojaEmEdicaoAssinatura = null;

        const { data } = await db.from('lojas').select('*').order('nome_loja');
        store.listaLojas = data || [];
        renderAdminLojas(document.getElementById('mainContent'));
    } catch (e) {
        err.textContent = 'Erro: ' + e.message;
    } finally {
        btn.classList.remove('saving'); btn.disabled = false;
    }
}

export { abrirModalAssinaturaLoja, filtrarLojasAdmin, renderAdminLojas, salvarAssinaturaLoja };
