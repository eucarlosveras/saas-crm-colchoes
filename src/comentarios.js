// ═══════════════════════════════════════════════════════════════
// Módulo: comentarios.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { renderDetalhesClientePage } from './orcamentos.js';
import { AppState, store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { getDateLabel, isCommentNew } from './utils.js';

        function renderComentariosHtml(comentarios, clienteId) {
            // REMOVIDO O FILTRO QUE BARRAVA O TIPO 'SISTEMA'
            const listaComentarios = comentarios || [];
            const frag = document.createDocumentFragment();

            if (listaComentarios.length === 0) {
                const p = document.createElement('p');
                p.style.color = 'var(--text-muted)';
                p.textContent = 'Nenhum comentário registrado.';
                frag.appendChild(p);
                return frag;
            }

            const grupos = {};
            listaComentarios.forEach(c => {
                const label = getDateLabel(c.data_criacao);
                if (!grupos[label]) grupos[label] = [];
                grupos[label].push(c);
            });

            Object.keys(grupos).forEach(label => {
                // Header do grupo (data)
                const groupHeader = document.createElement('div');
                groupHeader.className = 'timeline-group-header';
                groupHeader.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
                groupHeader.appendChild(document.createTextNode(' ' + label));
                frag.appendChild(groupHeader);

                grupos[label].forEach(c => {
                    const isNew = isCommentNew(c.data_criacao, clienteId);
                    const tipoLabel = c.tipo === 'Sistema' ? 'Sistema' : c.tipo === 'Perda' ? 'Perda' : 'Comentário';
                    const autorNome = c.autor || 'Sistema';
                    const autorInicial = autorNome.charAt(0).toUpperCase();
                    const podeEditar = (c.tipo === 'Comentário' || c.tipo === 'Perda') && c.autor === store.currentUser?.nome;
                    const horaMinuto = new Date(c.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    const item = document.createElement('div');
                    item.className = `comment-item${isNew ? ' is-new' : ''}`;

                    if (isNew) {
                        const badge = document.createElement('span');
                        badge.className = 'comment-badge-new';
                        badge.textContent = 'Novo';
                        item.appendChild(badge);
                    }

                    if (c._editando) {
                        // Modo edição
                        const header = document.createElement('div');
                        header.className = 'comment-header';
                        const avatar = document.createElement('div');
                        avatar.className = 'comment-avatar';
                        avatar.textContent = autorInicial;
                        const spanAutor = document.createElement('span');
                        spanAutor.className = 'comment-author';
                        spanAutor.textContent = autorNome;
                        const spanTipo = document.createElement('span');
                        spanTipo.className = 'comment-tipo';
                        spanTipo.textContent = tipoLabel;
                        header.appendChild(avatar);
                        header.appendChild(spanAutor);
                        header.appendChild(spanTipo);

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'comment-edit-input';
                        input.id = `editInput_${c.id_comentario}`;
                        input.value = c.texto;

                        const editActions = document.createElement('div');
                        editActions.className = 'comment-edit-actions';
                        const btnCancel = document.createElement('button');
                        btnCancel.className = 'btn-cancel';
                        btnCancel.textContent = 'Cancelar';
                        btnCancel.addEventListener('click', cancelarEdicao);
                        const btnSave = document.createElement('button');
                        btnSave.className = 'btn-save';
                        btnSave.textContent = 'Salvar';
                        btnSave.addEventListener('click', e => salvarEdicao(e, c.id_comentario));
                        editActions.appendChild(btnCancel);
                        editActions.appendChild(btnSave);

                        item.appendChild(header);
                        item.appendChild(input);
                        item.appendChild(editActions);
                    } else {
                        // Modo leitura
                        if (podeEditar) {
                            const actions = document.createElement('div');
                            actions.className = 'comment-actions';
                            const btnEdit = document.createElement('button');
                            btnEdit.className = 'btn-edit';
                            btnEdit.title = 'Editar';
                            btnEdit.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
                            btnEdit.addEventListener('click', () => editarComentario(c.id_comentario));
                            const btnDel = document.createElement('button');
                            btnDel.className = 'btn-delete';
                            btnDel.title = 'Excluir';
                            btnDel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 01-2-2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
                            btnDel.addEventListener('click', () => abrirModalExcluirComentario(c.id_comentario));
                            actions.appendChild(btnEdit);
                            actions.appendChild(btnDel);
                            item.appendChild(actions);
                        }

                        const header = document.createElement('div');
                        header.className = 'comment-header';
                        const avatar = document.createElement('div');
                        avatar.className = 'comment-avatar';
                        avatar.textContent = autorInicial;
                        const spanAutor = document.createElement('span');
                        spanAutor.className = 'comment-author';
                        spanAutor.textContent = autorNome;
                        const spanTipo = document.createElement('span');
                        spanTipo.className = 'comment-tipo';
                        spanTipo.textContent = tipoLabel;
                        header.appendChild(avatar);
                        header.appendChild(spanAutor);
                        header.appendChild(spanTipo);

                        const body = document.createElement('div');
                        body.className = 'comment-body';
                        body.textContent = c.texto; // .textContent = zero risco XSS

                        const time = document.createElement('div');
                        time.className = 'comment-time';
                        time.textContent = horaMinuto;

                        item.appendChild(header);
                        item.appendChild(body);
                        item.appendChild(time);
                    }

                    frag.appendChild(item);
                });
            });

            return frag;
        }

        function editarComentario(id_comentario) {
            const com = AppState.contextoVenda.clienteAtual.comentarios;
            com.forEach(c => delete c._editando);
            const index = com.findIndex(c => String(c.id_comentario) === String(id_comentario));
            if (index < 0) return;
            com[index]._editando = true;
            renderDetalhesClientePage();
            setTimeout(() => { const input = document.getElementById('editInput_' + id_comentario); if (input) input.focus(); }, 100);
        }

        function cancelarEdicao() {
            AppState.contextoVenda.clienteAtual.comentarios.forEach(c => delete c._editando);
            renderDetalhesClientePage();
        }

        async function salvarEdicao(event, id_comentario) {
            event.preventDefault();
            const input = document.getElementById('editInput_' + id_comentario);
            if (!input) return;
            const novoTexto = input.value.trim();
            const btn = event.currentTarget;
            btn.classList.add('saving'); btn.disabled = true;
            try {
                const { error } = await db.from('comentarios').update({ texto: novoTexto }).eq('id_comentario', id_comentario);
                if (error) throw error;
                const index = AppState.contextoVenda.clienteAtual.comentarios.findIndex(c => String(c.id_comentario) === String(id_comentario));
                if (index > -1) { AppState.contextoVenda.clienteAtual.comentarios[index].texto = novoTexto; delete AppState.contextoVenda.clienteAtual.comentarios[index]._editando; }
                showToast('Comentário editado', 'success');
                renderDetalhesClientePage();
            } catch (e) {
                showToast('Erro ao editar comentário.', 'error');
                btn.classList.remove('saving'); btn.disabled = false;
            }
        }

        function abrirModalExcluirComentario(id_comentario) {
            store.comentarioParaExcluir = id_comentario;
            openModal('modalExcluirComentario');
        }

        async function confirmarExclusaoComentario() {
            if (!store.comentarioParaExcluir) return;
            const btn = document.getElementById('btnConfirmarExclusao');
            btn.classList.add('saving'); btn.disabled = true;
            try {
                const { error } = await db.from('comentarios').delete().eq('id_comentario', store.comentarioParaExcluir);
                if (error) throw error;
                AppState.contextoVenda.clienteAtual.comentarios = AppState.contextoVenda.clienteAtual.comentarios.filter(c => String(c.id_comentario) !== String(store.comentarioParaExcluir));
                closeModal('modalExcluirComentario');
                showToast('Comentário excluído', 'success');
                renderDetalhesClientePage();
            } catch (e) { showToast('Erro ao excluir comentário.', 'error'); } 
            finally { btn.classList.remove('saving'); btn.disabled = false; }
        }

        function atualizarIndicadorDigitacao() {
            const texto = document.getElementById('novoComentario')?.value || '';
            const indicator = document.getElementById('typingIndicator');
            if (indicator) indicator.classList.toggle('visible', texto.length > 0);
        }

        async function salvarComentario() {
            if (store.isSavingComment) return;
            const texto = document.getElementById('novoComentario').value.trim();
            const msg = document.getElementById('comentarioMsg');

            if (!texto) {
                msg.textContent = 'Digite um comentário.';
                msg.className = 'field-error';
                return;
            }

            store.isSavingComment = true;
            const btn = document.getElementById('btnSalvarTimeline');
            btn.querySelector('.btn-spinner').style.display = 'inline-block';
            btn.querySelector('.btn-text').textContent = 'Salvando...';
            btn.disabled = true; msg.textContent = '';

            try {
                // 1. Salva o comentário no banco
                const { error } = await db.from('comentarios').insert([{
                    id_orcamento: AppState.contextoVenda.clienteAtual.id_orcamento,
                    texto: texto, tipo: 'Comentário', autor: store.currentUser.nome
                }]);

                if (error) throw error;

                // --- INÍCIO DA MELHORIA: NOTIFICAÇÃO DO GERENTE/ADMIN ---
                // Antes só disparava para perfil 'Gerente'; Administrador/Admin comentando
                // não gerava notificação nenhuma para o vendedor responsável.
                if (['Gerente', 'Administrador', 'Admin'].includes(store.currentUser.perfil)) {
                    try {
                        const orcamento = AppState.contextoVenda.clienteAtual;
                        
                        // Garante que quem comentou não está disparando alerta para si mesmo
                        if (orcamento && orcamento.id_usuario !== store.currentUser.id_usuario) {
                            
                            // Grava o alerta na tabela 'notificacoes'
                            // IMPORTANTE: o cliente Supabase NÃO lança exceção em erro de insert,
                            // ele retorna { error }. Sem checar isso, um bloqueio de RLS falha
                            // em silêncio e o catch abaixo nunca é acionado.
                            const { error: errNotif } = await db.from('notificacoes').insert([{
                                id_usuario: orcamento.id_usuario, // Destinatário: Vendedor
                                texto: `${store.currentUser.nome} fez um comentário`,
                                tipo: 'comentario_gerente',
                                id_referencia: orcamento.id_orcamento,
                                id_cliente: orcamento.id_cliente,
                                lida: false
                            }]);
                            if (errNotif) {
                                console.error('Erro ao gravar notificação de comentário (possível bloqueio de RLS na tabela notificacoes):', errNotif);
                                showToast('Comentário salvo, mas a notificação ao vendedor falhou.', 'error');
                            }
                        }
                    } catch (e) {
                        console.error('Erro ao gerar notificação de comentário do gerente:', e);
                    }
                }
                // --- FIM DA MELHORIA ---

                document.getElementById('novoComentario').value = '';
                atualizarIndicadorDigitacao();
                showToast('Histórico registrado!', 'success');

                // Recarrega apenas os comentários do banco para atualizar a timeline
                // sem bloquear toda a interface (evita congelamento do botão Voltar)
                try {
                    const { data: novosComentarios } = await db.from('comentarios')
                        .select('*')
                        .eq('id_orcamento', AppState.contextoVenda.clienteAtual.id_orcamento)
                        .order('data_criacao', { ascending: true });
                    if (novosComentarios) {
                        AppState.contextoVenda.clienteAtual.comentarios = novosComentarios;
                    }
                } catch (_) { /* se falhar, mantém o estado anterior */ }
                renderDetalhesClientePage();
            } catch (e) {
                msg.textContent = 'Erro ao salvar: ' + e.message;
                msg.className = 'field-error';
            } finally {
                store.isSavingComment = false;
                btn.querySelector('.btn-spinner').style.display = 'none';
                btn.querySelector('.btn-text').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Registrar Histórico';
                btn.disabled = false;
            }
        }

        async function salvarObservacaoFixa(id) {
            const texto = document.getElementById('obsFixaCliente').value.trim();
            const loader = document.getElementById('obsSalvaLoader');
            try {
                const { error } = await db.from('orcamentos').update({ observacoes: texto }).eq('id_orcamento', id);
                if (error) throw error;
                
                if (loader) {
                    loader.textContent = '✓ Salvo'; loader.style.color = 'var(--accent-green)'; loader.classList.add('visible');
                    setTimeout(() => loader.classList.remove('visible'), 2500);
                }
                if (AppState.contextoVenda.clienteAtual && String(AppState.contextoVenda.clienteAtual.id_orcamento) === String(id)) {
                    AppState.contextoVenda.clienteAtual.observacoes = texto;
                }
            } catch (e) {
                if (loader) {
                    loader.textContent = 'Erro ao salvar'; loader.className = 'field-error visible';
                    setTimeout(() => loader.classList.remove('visible'), 3000);
                }
            }
        }

export { abrirModalExcluirComentario, atualizarIndicadorDigitacao, cancelarEdicao, confirmarExclusaoComentario, editarComentario, renderComentariosHtml, salvarComentario, salvarEdicao, salvarObservacaoFixa };
