// ═══════════════════════════════════════════════════════════════
// Módulo: metas.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { META_PADRAO, STATUS } from './constants.js';
import { navigateTo } from './router.js';
import { AppState, getLojasPermitidas, store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { escapeHtml, formatCurrency, parseCurrency } from './utils.js';

        function getMetaVendedor(idVendedor) {
            const user = (store.todosUsuarios && store.todosUsuarios.length > 0 ? store.todosUsuarios : store.todosVendedores).find(u => u.id_usuario === idVendedor);
            return user && user.meta_mensal ? parseFloat(user.meta_mensal) : META_PADRAO;
        }

       function calcularMetaTotal() {
            if (store.currentUser.perfil === 'Vendedor') return getMetaVendedor(store.currentUser.id_usuario);

            let filtrados = store.todosVendedores;
            if (store.currentUser.perfil === 'Gerente') {
                const lojasPermitidasMeta = getLojasPermitidas();
                filtrados = lojasPermitidasMeta
                    ? store.todosVendedores.filter(v => lojasPermitidasMeta.includes(v.id_loja))
                    : store.todosVendedores;
                if (store.selectedVendedor !== 'todos') filtrados = filtrados.filter(v => v.id_usuario === store.selectedVendedor);
            } else {
                if (store.selectedVendedor !== 'todos') {
                    filtrados = store.todosVendedores.filter(v => v.id_usuario === store.selectedVendedor);
                } else if (store.selectedLoja !== 'todas') {
                    filtrados = store.todosVendedores.filter(v => v.id_loja === store.selectedLoja);
                }
            }
            
            return filtrados.reduce((s, v) => s + getMetaVendedor(v.id_usuario), 0);
        }

        function getGamifiedColors(perc) {
            const chartBlue = getComputedStyle(document.body).getPropertyValue('--chart-blue').trim() || '#6366f1';
            const chartGreen = getComputedStyle(document.body).getPropertyValue('--chart-green').trim() || '#10b981';
            const chartOrange = getComputedStyle(document.body).getPropertyValue('--chart-orange').trim() || '#f59e0b';
            const chartRed = getComputedStyle(document.body).getPropertyValue('--chart-red').trim() || '#ef4444';
            const accentPurple = getComputedStyle(document.body).getPropertyValue('--accent-purple').trim() || '#8b5cf6';
            
            if (perc > 100) return { bg: `linear-gradient(90deg, ${chartBlue}, ${accentPurple})`, shadow: '0 0 12px var(--brand-blue-glow)', iconBg: chartBlue, iconSvg: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>', motive: 'Performance extraordinária!', motiveColor: chartBlue };
            if (perc >= 100) return { bg: `linear-gradient(90deg, ${chartGreen}, var(--accent-green-dark))`, shadow: '0 0 8px rgba(16,185,129,0.3)', iconBg: chartGreen, iconSvg: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', motive: 'Meta batida!', motiveColor: chartGreen };
            if (perc >= 80) return { bg: `linear-gradient(90deg, ${chartGreen}, var(--accent-green-dark))`, shadow: '0 0 6px rgba(16,185,129,0.2)', iconBg: chartGreen, iconSvg: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', motive: 'Quase lá!', motiveColor: chartGreen };
            if (perc >= 50) return { bg: `linear-gradient(90deg, ${chartOrange}, #eab308)`, shadow: '0 0 6px rgba(245,158,11,0.25)', iconBg: chartOrange, iconSvg: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>', motive: 'Em tração, continue!', motiveColor: chartOrange };
            return { bg: `linear-gradient(90deg, ${chartRed}, #f97316)`, shadow: '0 0 8px rgba(239,68,68,0.3)', iconBg: chartRed, iconSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', motive: 'Hora de acelerar!', motiveColor: chartRed };
        }

        function renderMetas() {
            // Cruza vendedores com lojas via id_loja (FK correcta)
            const lojaMap = {};
            store.listaLojas.forEach(l => { lojaMap[l.id_loja] = l; });

            // Calcula realizado por vendedor a partir de store.kpisMensais
            const realizadoPorVendedor = {};
            store.kpisMensais.forEach(o => {
                if (o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO) {
                    realizadoPorVendedor[o.id_usuario] = (realizadoPorVendedor[o.id_usuario] || 0) + parseFloat(o.valor_orcado || 0);
                }
            });

            // Agrupa vendedores por id_loja
            const porLoja = {};
            store.todosVendedores.forEach(v => {
                const idL = v.id_loja || '__sem_loja__';
                if (!porLoja[idL]) porLoja[idL] = [];
                porLoja[idL].push(v);
            });

            const fmt = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const pct = (real, meta) => meta > 0 ? Math.min(Math.round((real / meta) * 100), 100) : 0;
            const barColor = (p) => p >= 100 ? '#10b981' : p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';

            function progressBar(real, meta) {
                const p = pct(real, meta);
                return `<div style="margin-top:6px;">
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-bottom:3px;">
                        <span>Realizado: <strong style="color:var(--text-primary);">R$ ${fmt(real)}</strong></span>
                        <span style="font-weight:700; color:${barColor(p)}">${p}%</span>
                    </div>
                    <div style="background:var(--border-light); border-radius:99px; height:6px; overflow:hidden;">
                        <div style="width:${p}%; height:100%; background:${barColor(p)}; border-radius:99px; transition:width 0.4s ease;"></div>
                    </div>
                </div>`;
            }

            let sections = '';
            let lojaIds = Object.keys(porLoja).sort((a, b) => {
                const nA = lojaMap[a]?.nome_loja || 'Sem Loja';
                const nB = lojaMap[b]?.nome_loja || 'Sem Loja';
                return nA.localeCompare(nB);
            });

            if (store.currentUser.perfil === 'Gerente') {
                const lojasPermitidasMetas = getLojasPermitidas();
                lojaIds = lojasPermitidasMetas
                    ? lojaIds.filter(idL => lojasPermitidasMetas.includes(idL))
                    : lojaIds.filter(idL => idL === store.currentUser.id_loja);
            }

            lojaIds.forEach(idL => {
                const vendedores = porLoja[idL];
                const loja = lojaMap[idL];
                const nomeLoja = loja?.nome_loja || 'Sem Loja';
                const metaLoja = parseFloat(loja?.meta_mensal || 0);
                const somaVendedores = vendedores.reduce((s, v) => s + getMetaVendedor(v.id_usuario), 0);
                const realizadoLoja = vendedores.reduce((s, v) => s + (realizadoPorVendedor[v.id_usuario] || 0), 0);
                const metaExibida = metaLoja > 0 ? metaLoja : somaVendedores;

                // Cabeçalho da loja
                sections += `
                <div style="margin-bottom:28px; border:1.5px solid var(--border-light); border-radius:var(--radius-md); overflow:hidden;">
                    <div style="background:var(--bg-body); padding:16px 20px; border-bottom:1.5px solid var(--border-light);">
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--brand-blue-dark)" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                <span style="font-weight:800; font-size:var(--font-md); color:var(--brand-blue-dark);">${escapeHtml(nomeLoja)}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <span style="font-size:var(--font-xs); color:var(--text-muted);">Meta da loja:</span>
                                <input type="text" id="metaLoja_${idL}" value="R$ ${fmt(metaExibida)}"
                                    onfocus="this.select()"
                                    oninput="this.value = formatCurrency(this.value)"
                                    style="width:160px; padding:6px 10px; border-radius:8px; border:1.5px solid var(--border-light); font-size:var(--font-sm); font-weight:700; text-align:right; background:var(--card-bg); color:var(--text-primary);">
                                <button onclick="salvarMetaLoja('${idL}')"
                                    style="padding:6px 14px; border-radius:8px; background:var(--brand-blue); color:#fff; border:none; cursor:pointer; font-size:var(--font-xs); font-weight:600;">
                                    Salvar
                                </button>
                                ${metaLoja === 0 ? `<span style="font-size:10px; color:var(--text-muted); font-style:italic;">(usando soma dos vendedores)</span>` : ''}
                            </div>
                        </div>
                        ${progressBar(realizadoLoja, metaExibida)}
                    </div>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-body); border-bottom:1px solid var(--border-light);">
                                <th style="padding:10px 20px 10px 36px; text-align:left; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Vendedor</th>
                                <th style="padding:10px 20px; text-align:left; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Meta Individual</th>
                                <th style="padding:10px 20px; text-align:left; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; min-width:200px;">Progresso</th>
                                <th style="padding:10px 20px; text-align:right; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Ação</th>
                            </tr>
                        </thead>
                        <tbody>`;

                vendedores.forEach((v, idx) => {
                    const meta = getMetaVendedor(v.id_usuario);
                    const real = realizadoPorVendedor[v.id_usuario] || 0;
                    const p = pct(real, meta);
                    const cor = barColor(p);
                    const bg = idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg-body)';
                    sections += `
                            <tr style="background:${bg}; border-bottom:1px solid var(--border-light);">
                                <td style="padding:14px 20px 14px 36px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="width:28px; height:28px; border-radius:50%; background:var(--brand-blue); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;">${escapeHtml(v.nome.charAt(0).toUpperCase())}</div>
                                        <strong style="font-size:var(--font-sm);">${escapeHtml(v.nome)}</strong>
                                    </div>
                                </td>
                                <td style="padding:14px 20px; font-weight:700; font-size:var(--font-sm);">R$ ${fmt(meta)}</td>
                                <td style="padding:14px 20px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="flex:1; background:var(--border-light); border-radius:99px; height:8px; overflow:hidden; min-width:80px;">
                                            <div style="width:${p}%; height:100%; background:${cor}; border-radius:99px;"></div>
                                        </div>
                                        <span style="font-size:11px; font-weight:700; color:${cor}; min-width:36px;">${p}%</span>
                                        <span style="font-size:11px; color:var(--text-muted);">R$ ${fmt(real)}</span>
                                    </div>
                                </td>
                                <td style="padding:14px 20px; text-align:right;">
                                    <button class="btn-salvar-modal" style="padding:6px 14px; font-size:11px; background:var(--card-bg); border:1px solid var(--border-light); color:var(--text-primary); border-radius:8px;"
                                        onclick="abrirModalMeta('${v.id_usuario}', '${escapeHtml(v.nome)}', ${meta})">Editar Meta</button>
                                </td>
                            </tr>`;
                });

                sections += `</tbody></table></div>`;
            });
            
            const btnVoltarHtml = (store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin') 
                ? `<button class="btn-voltar" onclick="navigateTo('admin_inicio')">← Voltar</button>` 
                : '';

            document.getElementById('mainContent').innerHTML = `
                <header class="dashboard-header">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <span class="page-icon gold" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg></span>
                        ${btnVoltarHtml}
                        <h1>Gestão de Metas</h1>
                    </div>
                    <span style="font-size:var(--font-xs); color:var(--text-muted);">Mês atual · dados em tempo real</span>
                </header>
                <div style="padding:0 0 32px;">${sections || '<p style="color:var(--text-muted); padding:24px;">Nenhum vendedor cadastrado.</p>'}</div>`;
        }

        async function salvarMetaLoja(idLoja) {
            const input = document.getElementById(`metaLoja_${idLoja}`);
            if (!input) return;
            const valor = parseCurrency(input.value);
            if (valor < 0) { showToast('Valor inválido.', 'error'); return; }
            try {
                const { error } = await db.from('lojas').update({ meta_mensal: Math.round(valor) }).eq('id_loja', idLoja);
                if (error) throw error;
                const idx = store.listaLojas.findIndex(l => l.id_loja === idLoja);
                if (idx > -1) store.listaLojas[idx].meta_mensal = Math.round(valor);
                showToast('Meta da loja salva!', 'success');
                renderMetas();
            } catch (e) { showToast('Erro ao salvar meta da loja: ' + e.message, 'error'); }
        }

        function abrirModalMeta(id, nome, valorAtual) {
            store.idMetaEdicao = id; document.getElementById('inputMetaValor').value = 'R$ ' + valorAtual.toLocaleString('pt-BR');
            document.getElementById('errMeta').textContent = ''; openModal('modalEditarMeta'); document.getElementById('inputMetaValor').focus();
        }

        async function salvarNovaMeta() {
            const raw = document.getElementById('inputMetaValor').value.replace(/[^\d,]/g, '').replace(',', '.'); const valor = parseFloat(raw);
            if (!valor || valor <= 0) { document.getElementById('errMeta').textContent = 'Valor inválido.'; return; }
            const btn = document.getElementById('btnSalvarMeta'); btn.classList.add('saving'); btn.disabled = true;
            try {
                const { error } = await db.from('usuarios').update({ meta_mensal: Math.round(valor) }).eq('id_usuario', store.idMetaEdicao);
                if (error) throw new Error(error.message);
                const userIndex = store.todosUsuarios.findIndex(u => u.id_usuario === store.idMetaEdicao); if (userIndex > -1) store.todosUsuarios[userIndex].meta_mensal = Math.round(valor);
                const vendIndex = store.todosVendedores.findIndex(v => v.id_usuario === store.idMetaEdicao); if (vendIndex > -1) store.todosVendedores[vendIndex].meta_mensal = Math.round(valor);
                if (store.idMetaEdicao === AppState.usuarioLogado.id_usuario) AppState.usuarioLogado.meta_mensal = Math.round(valor);
                closeModal('modalEditarMeta'); showToast('Meta atualizada com sucesso', 'success'); renderMetas();
            } catch (e) { document.getElementById('errMeta').textContent = 'Erro ao salvar: ' + e.message; } 
            finally { btn.classList.remove('saving'); btn.disabled = false; }
        }

export { abrirModalMeta, calcularMetaTotal, getGamifiedColors, getMetaVendedor, renderMetas, salvarMetaLoja, salvarNovaMeta };
