// ═══════════════════════════════════════════════════════════════
// Módulo: usuarios.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { carregarLojasMultiplas } from './auth.js';
import { navigateTo } from './router.js';
import { store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

        async function salvarUsuarioAdmin() {
            const nome = document.getElementById('adminModNome').value.trim();
            const email = document.getElementById('adminModEmail').value.trim();
            const loja = document.getElementById('adminModLoja').value;
            const perfil = document.getElementById('adminModPerfil').value;
            const status = document.getElementById('adminModStatus').value;
            const senha = document.getElementById('adminModSenha').value;
            const err = document.getElementById('errAdminUsuario');
            const lojasMultiSel = document.getElementById('adminModLojasMultiplas');
            // Lojas adicionais selecionadas (só relevante para perfil Gerente); a Loja Base sempre entra também.
            const lojasSelecionadas = (perfil === 'Gerente' && lojasMultiSel)
                ? Array.from(lojasMultiSel.selectedOptions).map(o => o.value)
                : [];
            if (loja && !lojasSelecionadas.includes(loja)) lojasSelecionadas.push(loja);

            if (!nome || !email) {
                err.textContent = 'Preencha Nome e E-mail.';
                return;
            }
            if (!senha && !store.idUsuarioEmEdicao) {
                err.textContent = 'Defina uma senha inicial para o novo usuário.';
                return;
            }
            if (!loja) {
                err.textContent = 'Selecione a Loja Base do usuário.';
                return;
            }

            const btn = document.getElementById('btnSalvarUsuarioAdmin');
            btn.classList.add('saving'); btn.disabled = true; err.textContent = '';

            const idEmEdicaoNoMomentoDoSave = store.idUsuarioEmEdicao; // preserva antes de zerar mais abaixo
            try {
                let idUsuarioAlvo = idEmEdicaoNoMomentoDoSave;

                if (idEmEdicaoNoMomentoDoSave) {
                    // EDICAO: atualiza direto na tabela usuarios
                    const updatePayload = { nome, email, id_loja: loja, perfil, status };
                    const { error: updateError } = await db.from('usuarios')
                        .update(updatePayload)
                        .eq('id_usuario', idEmEdicaoNoMomentoDoSave);
                    if (updateError) throw updateError;
                    showToast('Usuário atualizado com sucesso!', 'success');
                } else {
                    // CRIACAO: chama Edge Function que cria no Auth + insere em usuarios
                    const payload = { nome, email, loja, perfil, status, senha };
                    const { error } = await db.functions.invoke('criar-usuario', {
                        body: payload
                    });
                    if (error) {
                        // Por padrão o supabase-js só diz "non-2xx status code"; aqui buscamos
                        // a mensagem real que a Edge Function devolveu no corpo ({ error: '...' }).
                        let mensagemDetalhada = error.message;
                        try {
                            if (error.context && typeof error.context.json === 'function') {
                                const corpoErro = await error.context.json();
                                if (corpoErro?.error) mensagemDetalhada = corpoErro.error;
                            }
                        } catch (_) { /* mantém a mensagem genérica se não der para ler o corpo */ }
                        throw new Error(mensagemDetalhada);
                    }
                    // A Edge Function 'criar-usuario' só retorna { success: true }, sem o id_usuario.
                    // Buscamos o registro recém-criado pelo e-mail (único) para poder sincronizar usuario_lojas.
                    const { data: userRecemCriado } = await db.from('usuarios').select('id_usuario').eq('email', email).single();
                    idUsuarioAlvo = userRecemCriado?.id_usuario || null;
                    showToast('Usuário criado com sucesso!', 'success');
                }

                // Sincroniza a tabela usuario_lojas (Gerente Multiloja): remove associações antigas e grava as atuais.
                if (perfil === 'Gerente') {
                    if (idUsuarioAlvo) {
                        await db.from('usuario_lojas').delete().eq('id_usuario', idUsuarioAlvo);
                        if (lojasSelecionadas.length > 0) {
                            const inserts = lojasSelecionadas.map(lojaId => ({ id_usuario: idUsuarioAlvo, id_loja: lojaId }));
                            const { error: syncError } = await db.from('usuario_lojas').insert(inserts);
                            if (syncError) console.warn('Erro ao sincronizar lojas do gerente:', syncError);
                        }
                    }
                } else if (idUsuarioAlvo) {
                    // Se o perfil deixou de ser Gerente, limpa eventuais associações antigas.
                    await db.from('usuario_lojas').delete().eq('id_usuario', idUsuarioAlvo);
                }

                store.idUsuarioEmEdicao = null;
                closeModal('modalUsuarioAdmin');

                const { data: usuarios } = await db.from('usuarios').select('*').order('nome');
                store.todosUsuarios = usuarios || [];
                store.todosVendedores = store.todosUsuarios.filter(u => u.perfil === 'Vendedor');
                renderAdminUsuarios(document.getElementById('mainContent'));

                // Se o admin acabou de editar/criar o próprio gerente logado, recarrega as lojas permitidas em sessão.
                if (store.currentUser && idUsuarioAlvo === store.currentUser.id_usuario) {
                    await carregarLojasMultiplas(store.currentUser.id_usuario);
                }

            } catch (e) {
                err.textContent = 'Erro: ' + e.message;
            } finally {
                btn.classList.remove('saving');
                btn.disabled = false;
            }
        }

        function toggleCampoLojasMultiplas() {
            const perfilSel = document.getElementById('adminModPerfil');
            const campo = document.getElementById('campoLojasMultiplas');
            if (!perfilSel || !campo) return;
            campo.style.display = (perfilSel.value === 'Gerente') ? 'block' : 'none';
        }

        function abrirModalUsuarioAdmin(id = null) {
            store.idUsuarioEmEdicao = id;
            const err = document.getElementById('errAdminUsuario'); if (err) err.textContent = '';
            const title = document.getElementById('modalUsuarioTitle');
            const nomeInput = document.getElementById('adminModNome');
            const emailInput = document.getElementById('adminModEmail');
            const lojaSel = document.getElementById('adminModLoja');
            const perfilSel = document.getElementById('adminModPerfil');
            const statusSel = document.getElementById('adminModStatus');
            const senhaInput = document.getElementById('adminModSenha');
            const lojasMultiSel = document.getElementById('adminModLojasMultiplas');

            lojaSel.innerHTML = '<option value="">Selecione a loja...</option>';
            store.listaLojas.forEach(l => { lojaSel.innerHTML += `<option value="${l.id_loja}">${escapeHtml(l.nome_loja)}</option>`; });

            // Popula o multiselect de lojas adicionais (usado só quando perfil = Gerente)
            if (lojasMultiSel) {
                lojasMultiSel.innerHTML = '';
                store.listaLojas.slice().sort((a, b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
                    const opt = document.createElement('option');
                    opt.value = l.id_loja;
                    opt.textContent = l.nome_loja;
                    lojasMultiSel.appendChild(opt);
                });
            }

            if (id) {
                const user = store.todosUsuarios.find(u => u.id_usuario === id);
                title.textContent = 'Editar Usuário';
                nomeInput.value = user.nome || ''; emailInput.value = user.email || '';
                lojaSel.value = user.id_loja || ''; perfilSel.value = user.perfil || 'Vendedor'; statusSel.value = user.status || 'Ativo';
                senhaInput.value = '';

                // Se for Gerente, busca as lojas já associadas (tabela usuario_lojas) e pré-seleciona
                if (user.perfil === 'Gerente' && lojasMultiSel) {
                    db.from('usuario_lojas').select('id_loja').eq('id_usuario', id).then(({ data, error }) => {
                        if (error) { console.warn('Erro ao carregar lojas associadas:', error); return; }
                        const idsAssociadas = (data || []).map(r => r.id_loja);
                        Array.from(lojasMultiSel.options).forEach(opt => {
                            opt.selected = idsAssociadas.includes(opt.value);
                        });
                    });
                }
            } else {
                title.textContent = 'Novo Usuário';
                nomeInput.value = ''; emailInput.value = ''; lojaSel.value = ''; perfilSel.value = 'Vendedor'; statusSel.value = 'Ativo';
                senhaInput.value = '';
                if (lojasMultiSel) Array.from(lojasMultiSel.options).forEach(opt => { opt.selected = false; });
            }
            toggleCampoLojasMultiplas();
            openModal('modalUsuarioAdmin');
        }

        function toggleSenhaAdmin() {
            const input = document.getElementById('adminModSenha');
            const icon = document.getElementById('eyeIconAdmin');
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            icon.innerHTML = isHidden
                ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }

        function renderAdminInicio(main) {
            const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
            if (!isGerente) return;
            const totalUsuarios = store.todosUsuarios.length; const ativos = store.todosUsuarios.filter(u => u.status === 'Ativo').length; const totalVendedores = store.todosVendedores.length;
            main.innerHTML = `<header class="dashboard-header"><div style="display:flex;align-items:center;gap:12px;"><span class="page-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg></span><h1 style="margin:0;">Painel Administrativo</h1></div></header>
            <div class="action-grid" style="margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="action-btn-card" onclick="navigateTo('admin_usuarios')" style="background: var(--card-bg); border: 1px solid var(--border-light); padding: 24px; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;"><span class="page-icon blue" aria-hidden="true" style="margin-bottom: 12px;"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/></svg></span><h4 style="font-weight: 700; margin-bottom: 4px;">Gerenciar Usuários</h4><p style="font-size: var(--font-sm); color: var(--text-muted);">Adicionar, editar ou inativar acessos</p></div>
                <div class="action-btn-card" onclick="navigateTo('metas')" style="background: var(--card-bg); border: 1px solid var(--border-light); padding: 24px; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;"><span class="page-icon gold" aria-hidden="true" style="margin-bottom: 12px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg></span><h4 style="font-weight: 700; margin-bottom: 4px;">Gestão de Metas</h4><p style="font-size: var(--font-sm); color: var(--text-muted);">Definir metas mensais por vendedor</p></div>
            </div>
            <div class="kpi-row">
                <div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Total de Usuários</span></div><div class="kpi-value">${totalUsuarios}</div></div>
                <div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Usuários Ativos</span></div><div class="kpi-value">${ativos}</div></div>
                <div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Vendedores</span></div><div class="kpi-value">${totalVendedores}</div></div>
            </div>`;
        }

        function renderAdminUsuarios(main) {
            let html = `<header class="dashboard-header"><div style="display:flex; align-items:center; gap:16px;"><span class="page-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/></svg></span><button class="btn-voltar" onclick="navigateTo('admin_inicio')">← Voltar</button><h1>Gerenciar Usuários</h1></div><button class="btn-primary-action" onclick="abrirModalUsuarioAdmin()"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Novo Usuário</button></header><div class="table-card"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
            if (store.todosUsuarios.length === 0) {
                html += `<tr><td colspan="5" style="text-align:center; padding:24px;">Nenhum usuário encontrado.</td></tr>`;
            } else {
                store.todosUsuarios.forEach(u => {
                    const statusClass = u.status === 'Ativo' ? 'status-tag vendido' : 'status-tag perdido';
                    html += `<tr>
                        <td><strong>${escapeHtml(u.nome)}</strong></td>
                        <td>${escapeHtml(u.email || '-')}</td>
                        <td>${escapeHtml(u.perfil)}</td>
                        <td><span class="${statusClass}">${escapeHtml(u.status || 'Ativo')}</span></td>
                        <td><div style="display:flex; gap:8px;">
                            <button class="btn-salvar-modal" style="padding:6px 12px; font-size:11px; background:var(--card-bg); border:1px solid var(--border-light); color:var(--text-primary);" onclick="abrirModalUsuarioAdmin('${u.id_usuario}')">Editar</button>
                            ${u.id_usuario !== store.currentUser.id_usuario ? `<button class="btn-danger-ghost" style="padding:6px 12px; font-size:11px;" onclick="abrirModalExcluirUsuarioAdmin('${u.id_usuario}', '${escapeHtml(u.nome)}')">Excluir</button>` : ''}
                        </div></td>
                    </tr>`;
                });
            }
            html += `</tbody></table></div>`;
            main.innerHTML = html;
        }

        function abrirModalExcluirUsuarioAdmin(id, nome) {
            store.idUsuarioEmEdicao = id;
            document.getElementById('nomeUsuarioExcluir').innerText = nome;
            openModal('modalExcluirUsuarioAdmin');
        }

        async function confirmarExclusaoUsuario() {
            if (!store.idUsuarioEmEdicao) return;
            const btn = document.getElementById('btnConfirmarExclusaoUsuario');
            btn.classList.add('saving'); btn.disabled = true;
            try {
                const { count, error: countError } = await db.from('orcamentos')
                    .select('*', { count: 'exact', head: true })
                    .eq('id_usuario', store.idUsuarioEmEdicao);
                if (countError) throw countError;
                if (count > 0) {
                    showToast(`Não é possível excluir: usuário possui ${count} orçamento(s). Inative-o em vez disso.`, 'error');
                    closeModal('modalExcluirUsuarioAdmin');
                    return;
                }
                const { error } = await db.from('usuarios').delete().eq('id_usuario', store.idUsuarioEmEdicao);
                if (error) throw error;
                showToast('Usuário excluído com sucesso.', 'success');
                closeModal('modalExcluirUsuarioAdmin');
                const { data: usuarios } = await db.from('usuarios').select('*').order('nome');
                store.todosUsuarios = usuarios || [];
                store.todosVendedores = store.todosUsuarios.filter(u => u.perfil === 'Vendedor');
                renderAdminUsuarios(document.getElementById('mainContent'));
            } catch (e) {
                showToast('Erro ao excluir: ' + e.message, 'error');
            } finally {
                btn.classList.remove('saving'); btn.disabled = false;
                store.idUsuarioEmEdicao = null;
            }
        }

export { abrirModalExcluirUsuarioAdmin, abrirModalUsuarioAdmin, confirmarExclusaoUsuario, renderAdminInicio, renderAdminUsuarios, salvarUsuarioAdmin, toggleCampoLojasMultiplas, toggleSenhaAdmin };
