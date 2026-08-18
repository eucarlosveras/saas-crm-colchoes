// ═══════════════════════════════════════════════════════════════
// Módulo: notificacoes.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { STATUS } from './constants.js';
import { abrirDetalhesCliente } from './orcamentos.js';
import { store } from './state.js';
import { db } from './supabaseClient.js';
import { escapeHtml, getHojeBrasilia } from './utils.js';

        function carregarNotificacoesLidas() { const stored = localStorage.getItem('store.notificacoesLidas'); if (stored) { try { store.notificacoesLidas = new Set(JSON.parse(stored)); } catch(e) { } } }

        function salvarNotificacoesLidas() { localStorage.setItem('store.notificacoesLidas', JSON.stringify(Array.from(store.notificacoesLidas))); }

        function marcarTodasNotificacoesLidas(ids) { let altered = false; ids.forEach(id => { if (id && !store.notificacoesLidas.has(id)) { store.notificacoesLidas.add(id); altered = true; } }); if (altered) salvarNotificacoesLidas(); }

        function iniciarSubscriptionNotificacoes() {
            // Destrói canal anterior se houver (ex: re-login sem reload)
            if (store._notifChannel) { db.removeChannel(store._notifChannel); store._notifChannel = null; }

            store._notifChannel = db
                .channel('notificacoes-realtime-' + store.currentUser.id_usuario)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notificacoes',
                        filter: `id_usuario=eq.${store.currentUser.id_usuario}`
                    },
                    (payload) => {
                        // Só processa se a notificação ainda não estiver na lista (idempotência)
                        const jaExiste = store.notificacoesBanco.some(n => String(n.id) === String(payload.new.id));
                        if (jaExiste) return;

                        store.notificacoesBanco.push(payload.new);
                        const notificacoes = buildNotifications();
                        renderNotificationBadge(notificacoes.length);

                        // Atualiza o dropdown se ele estiver aberto no momento
                        const dropdown = document.getElementById('notificationDropdown');
                        if (dropdown && dropdown.classList.contains('open')) {
                            renderNotificationsDropdown();
                        }
                    }
                )
                .subscribe();
        }

        function buildNotifications() {
            const hoje = getHojeBrasilia();
            const notificacoes = [];
            const isEmAberto = (s) => ![STATUS.PERDIDO, STATUS.DECLINADO].includes(s);
            
            const agendadosHoje = store.kpisMensais.filter(o => o.data_contato === hoje && isEmAberto(o.status));
                        
            // Notificações de agenda
            agendadosHoje.forEach(o => notificacoes.push({ tipo: 'info', texto: `Contato agendado hoje: <strong>${escapeHtml(o.clientes?.nome_cliente || 'Cliente')}</strong>`, id: o.id_orcamento, data: o.hora_contato || 'horário não definido' }));
            
            
            // --- INÍCIO DA MELHORIA: INJETAR ALERTAS DO BANCO ---
            store.notificacoesBanco.forEach(n => {
                notificacoes.push({
                    tipo: 'comentario_gerente',
                    texto: n.texto,
                    id: n.id_referencia, // ID do orçamento para redirecionar
                    id_notif: n.id,      // ID da notificação para marcar como lida
                    data: 'Novo comentário' // Genérico: pode vir de Gerente, Administrador ou Admin
                });
            });
            // --- FIM DA MELHORIA ---

            // Filtra as não lidas (somente notificações com id real)
            const naoLidas = notificacoes.filter(n => { 
                if (n.id === null || n.id === undefined) return false; 
                if (n.tipo === 'comentario_gerente') return true; // Já vêm filtradas como lida=false do banco
                return !store.notificacoesLidas.has(n.id); 
            });

            // Retorna as não lidas reais; o dropdown trata a lista vazia separadamente
            return naoLidas;
        }

        function renderNotificationBadge(count) {
            const badge = document.getElementById('notificationBadgeCount');
            if (!badge) return;
            if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.add('visible'); }
            else { badge.classList.remove('visible'); }
        }

        function toggleNotifications() {
            const dropdown = document.getElementById('notificationDropdown');
            const notificacoes = buildNotifications(); 
            // Marca como lidas as notificações de agenda (localStorage) ao abrir
            const idsAgenda = notificacoes.filter(n => n.tipo !== 'comentario_gerente' && n.id).map(n => n.id);
            if (idsAgenda.length > 0) {
                marcarTodasNotificacoesLidas(idsAgenda);
            }
            // Renderiza com a lista atual (antes de marcar, para mostrar o que havia)
            renderizarDropdownNotificacoes(notificacoes);
            // Após marcar, zera o badge das notificações de agenda
            const restantes = buildNotifications();
            renderNotificationBadge(restantes.length);

            dropdown.classList.toggle('open');
            if (dropdown.classList.contains('open')) {
                document.addEventListener('click', function closeNotif(e) {
                    const btn = document.getElementById('btnNotification');
                    const dd = document.getElementById('notificationDropdown');
                    if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) {
                        dd.classList.remove('open'); document.removeEventListener('click', closeNotif);
                    }
                }, { once: true });
            }
        }

        function renderizarDropdownNotificacoes(notificacoes) {
            const dropdown = document.getElementById('notificationDropdown');
            let html = '<div class="notif-header">Central de Alertas</div>';

            if (!notificacoes || notificacoes.length === 0) {
                html += '<div class="notif-empty">✓ Nenhum alerta no momento.</div>';
                dropdown.innerHTML = html;
                return;
            }
            
            notificacoes.forEach(n => {
                let dotClass = 'info';
                let onclick = '';
                
                if (n.tipo === 'critical') dotClass = 'critical';
                else if (n.tipo === 'warning') dotClass = 'warning';
                else if (n.tipo === 'comentario_gerente') dotClass = 'warning';

                if (n.tipo === 'comentario_gerente') {
                    onclick = `onclick="marcarNotificacaoBancoLida('${n.id_notif}', '${n.id}'); document.getElementById('notificationDropdown').classList.remove('open');"`;
                } else if (n.id) {
                    onclick = `onclick="marcarNotificacaoLida('${n.id}'); abrirDetalhesCliente('${n.id}'); document.getElementById('notificationDropdown').classList.remove('open');"`;
                }

                html += `<div class="notif-item" ${onclick} style="cursor:pointer;">
                            <span class="notif-dot ${dotClass}"></span>
                            <div style="flex:1;">
                                <div>${n.texto}</div>
                                <div style="font-size:10px; color:var(--text-muted);">${escapeHtml(n.data)}</div>
                            </div>
                         </div>`;
            });
            dropdown.innerHTML = html;
        }

        async function marcarNotificacaoBancoLida(idNotif, idOrcamento) {
            try {
                // Atualiza o status no banco de dados
                await db.from('notificacoes').update({ lida: true }).eq('id', idNotif);
                
                // Remove da lista local para atualizar o badge sem precisar de F5
                store.notificacoesBanco = store.notificacoesBanco.filter(n => String(n.id) !== String(idNotif));
                
                // Recalcula o badge de notificações
                const novasNotifs = buildNotifications();
                renderNotificationBadge(novasNotifs.length);
                
                // Abre a tela do orçamento
                abrirDetalhesCliente(idOrcamento);
            } catch (e) {
                console.error('Erro ao processar notificação:', e);
                // Se der erro no banco, abre o orçamento mesmo assim (fallback)
                abrirDetalhesCliente(idOrcamento);
            }
        }

        function marcarNotificacaoLida(id) {
            if (id && !store.notificacoesLidas.has(id)) {
                store.notificacoesLidas.add(id);
                salvarNotificacoesLidas();
                renderNotificationBadge(buildNotifications().length);
            }
        }

export { buildNotifications, carregarNotificacoesLidas, iniciarSubscriptionNotificacoes, marcarNotificacaoBancoLida, marcarNotificacaoLida, marcarTodasNotificacoesLidas, renderNotificationBadge, renderizarDropdownNotificacoes, salvarNotificacoesLidas, toggleNotifications };
