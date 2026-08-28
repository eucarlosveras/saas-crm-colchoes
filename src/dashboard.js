// ═══════════════════════════════════════════════════════════════
// Módulo: dashboard.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { STATUS } from './constants.js';
import { renderFiltrosData } from './filtros.js';
import { calcularMetaTotal, getGamifiedColors } from './metas.js';
import { buildNotifications, renderNotificationBadge, toggleNotifications } from './notificacoes.js';
import { getMeuRadarBlockHtml, initMeuRadar } from './radar.js';
import { AppState, getLojasPermitidas, store } from './state.js';
import { db } from './supabaseClient.js';
import { atualizarFab, hideLoader, showLoader } from './ui.js';
import { addDiasADataStr, addDiasBrasilia, deslocarDataEmMeses, escapeHtml, getHojeBrasilia, getInicioSemanaBrasilia, getPrimeiroDiaMes } from './utils.js';
// Chart.js (~200KB) é importado sob demanda dentro de renderizarGraficos() em vez
// de estaticamente aqui — ele só é necessário na tela de Início, então carregá-lo
// como chunk separado evita inflar o bundle principal que toda página paga.

     async function carregarKpisEDashboard() {
        // ═══════════════════════════════════════════════════════
        // NOVO: Usar Views para KPIs
        // ═══════════════════════════════════════════════════════
        
        const mesAtual = new Date().getMonth() + 1;
        const anoAtual = new Date().getFullYear();
        
        // 1. Vendas do mês (View já calcula)
        // maybeSingle (não single): num mês sem nenhuma venda ainda a view não tem
        // linha nenhuma para retornar — 0 linhas é um resultado válido, não um erro.
        const { data: vendasMes } = await db
            .from('vw_vendas_mensais')
            .select('*')
            .eq('ano', anoAtual)
            .eq('mes', mesAtual)
            .maybeSingle();

        // 2. Performance do vendedor (View já calcula)
        const { data: performance } = await db
            .from('vw_performance_vendedores')
            .select('*')
            .eq('id_usuario', store.currentUser.id_usuario)
            .eq('ano', anoAtual)
            .eq('mes', mesAtual)
            .maybeSingle();
        
        // 3. Orçamentos em risco (View já calcula)
        const { data: emRisco } = await db
            .from('vw_orcamentos_em_risco')
            .select('*')
            .eq('vendedor', store.currentUser.nome);
        
        // Atualizar DOM com dados já calculados
        atualizarKPIsDashboard(vendasMes, performance, emRisco);

        await carregarKpisMensais();
    }

    // Popula store.kpisMensais — usado por renderInicio() pra tudo que é
    // calculado no cliente (barra de meta, gráfico de rosca, % conversão,
    // ranking de vendedores na Visão Gerencial). Bug real corrigido aqui:
    // essa função nunca existiu de fato — store.kpisMensais ficava para
    // sempre no valor inicial [] (nenhum código em todo o projeto atribuía
    // a ele), e renderInicio() também lia AppState.kpisMensaisResumo, um
    // objeto de um resumo pré-calculado que igualmente nunca era escrito em
    // lugar nenhum. Resultado: a barra "Meta do mês" (e tudo mais que
    // depende de `dados` em renderInicio) sempre mostrava zero, mesmo com
    // vendas fechadas de verdade — é o que o dono do produto reportou.
    //
    // Mesma regra de período já usada (e já testada) em carteira.js: abertos
    // (Contato Inicial/Negociação/Em Fechamento) sempre visíveis, porque
    // ainda estão em tratativa; finalizados (Fechado/Perdido) só contam se a
    // CONCLUSÃO (data_fechamento) caiu no mês selecionado. Sem filtro
    // explícito de vendedor/loja aqui — RLS já escopa isso sozinho
    // (Vendedor só vê os próprios orçamentos, Gerente os da própria loja,
    // Administrador todos).
    async function carregarKpisMensais() {
        try {
            const statusAbertosIds = store.mapStatusUUID
                .filter(s => [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(s.nome))
                .map(s => s.id_status);
            const statusFinalizadosIds = store.mapStatusUUID
                .filter(s => [STATUS.FECHADO, STATUS.PERDIDO].includes(s.nome))
                .map(s => s.id_status);

            const startPeriodo = new Date(store.currentYear, store.currentMonth - 1, 1).toISOString();
            const endPeriodo = new Date(store.currentYear, store.currentMonth, 1).toISOString();

            let query = db.from('orcamentos')
                .select('id_orcamento, id_usuario, valor_orcado, data_criacao, data_fechamento, status_orcamento(nome)')
                .is('deleted_at', null);

            const orParts = [];
            if (statusAbertosIds.length) orParts.push(`id_status.in.(${statusAbertosIds.join(',')})`);
            if (statusFinalizadosIds.length) orParts.push(`and(id_status.in.(${statusFinalizadosIds.join(',')}),data_fechamento.gte.${startPeriodo},data_fechamento.lt.${endPeriodo})`);
            if (orParts.length) query = query.or(orParts.join(','));

            const { data, error } = await query.limit(2000);
            if (error) throw error;

            store.kpisMensais = (data || []).map(o => ({ ...o, status: o.status_orcamento?.nome || '' }));
        } catch (e) {
            console.error('Erro ao carregar KPIs mensais:', e);
            store.kpisMensais = [];
        }
    }

    function atualizarKPIsDashboard(vendasMes, performance, emRisco) {
        const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        // Faturamento do mês
        const elFaturamento = document.getElementById('kpiFaturamento');
        if (elFaturamento) elFaturamento.textContent = fmt(vendasMes?.faturamento_total);
        
        // Ticket médio
        const elTicket = document.getElementById('kpiTicketMedio');
        if (elTicket) elTicket.textContent = fmt(vendasMes?.ticket_medio);
        
        // Progresso da meta
        const elProgresso = document.getElementById('kpiMetaProgresso');
        if (elProgresso) {
            const progresso = performance?.progresso_meta || 0;
            elProgresso.textContent = `${progresso}%`;
        }
        
        // Orçamentos em risco
        const elRisco = document.getElementById('kpiEmRisco');
        if (elRisco) elRisco.textContent = emRisco?.length || 0;
    }

        function calcularVariacaoPercentual(atual, anterior) {
            if (anterior === 0) return atual > 0 ? 100 : 0;
            return ((atual - anterior) / anterior) * 100;
        }

        // Card compacto de "Meu Desempenho"/"Desempenho da Loja". Delta fica
        // inline ao lado do valor (.kpi-value-row), não numa linha própria —
        // ver .kpi-grid-compact .kpi-card em style.css pro dimensionamento
        // compacto (essas regras não afetam .kpi-card em outras telas, como
        // Carteira/Estoque/Admin, que também usam a classe base).
        function buildKpiCard({ cor, icone, label, valor, variacao, comparacaoLabel, destaque = false }) {
            const temVariacao = variacao !== undefined && variacao !== null;
            const positivo = temVariacao && variacao >= 0;
            const deltaHtml = temVariacao
                ? `<span class="kpi-variacao ${positivo ? 'kpi-var-up' : 'kpi-var-down'}">${positivo ? '▲' : '▼'} ${Math.abs(Math.round(variacao))}%</span>`
                : '';
            const iconeHtml = icone ? `<span class="kpi-icon ${cor}" aria-hidden="true">${icone}</span>` : '';
            return `<div class="kpi-card${destaque ? ' vendido-highlight' : ''}">
                ${iconeHtml}
                <div class="kpi-label-row"><span class="kpi-label">${label}</span></div>
                <div class="kpi-value-row"><span class="kpi-value">${valor}</span>${deltaHtml}</div>
                ${comparacaoLabel ? `<span class="kpi-comparacao-label">${comparacaoLabel}</span>` : ''}
            </div>`;
        }

        function getIntervalosPeriodoKpi(periodo) {
            const hojeStr = getHojeBrasilia();
            const amanhaStr = addDiasBrasilia(1);

            if (periodo === 'semana') {
                const inicioAtual = getInicioSemanaBrasilia(0);
                return {
                    inicioAtual, fimAtualExclusivo: amanhaStr,
                    inicioAnterior: addDiasADataStr(inicioAtual, -7),
                    fimAnteriorExclusivo: addDiasADataStr(amanhaStr, -7),
                    labelComparacao: 'vs. semana anterior'
                };
            }
            if (periodo === 'mes') {
                const inicioAtual = getPrimeiroDiaMes(hojeStr);
                const diaEquivalenteMesPassado = deslocarDataEmMeses(hojeStr, -1);
                return {
                    inicioAtual, fimAtualExclusivo: amanhaStr,
                    inicioAnterior: getPrimeiroDiaMes(diaEquivalenteMesPassado),
                    fimAnteriorExclusivo: addDiasADataStr(diaEquivalenteMesPassado, 1),
                    labelComparacao: 'vs. mês anterior'
                };
            }
            // 'hoje' (padrão)
            return {
                inicioAtual: hojeStr, fimAtualExclusivo: amanhaStr,
                inicioAnterior: addDiasBrasilia(-1), fimAnteriorExclusivo: hojeStr,
                labelComparacao: 'vs. ontem'
            };
        }

        async function carregarKpisDiariosVendedor(periodo = store.kpiPeriodoVendedor) {
            const idVendedor = AppState.usuarioLogado.id_usuario;
            const { inicioAtual, fimAtualExclusivo, inicioAnterior, fimAnteriorExclusivo, labelComparacao } = getIntervalosPeriodoKpi(periodo);

            const idsFechado = store.mapStatusUUID.filter(s => s.nome === STATUS.FECHADO).map(s => s.id_status);
            const idsFechadoSafe = idsFechado.length ? idsFechado : ['00000000-0000-0000-0000-000000000000'];

            const buscarVendasDoPeriodo = async (inicioStr, fimStr) => {
                const { data, error } = await db.from('orcamentos')
                    .select('valor_orcado, modelo_colchao')
                    .eq('id_usuario', idVendedor)
                    .in('id_status', idsFechadoSafe)
                    .gte('data_fechamento', `${inicioStr}T00:00:00`)
                    .lt('data_fechamento', `${fimStr}T00:00:00`);
                if (error) { console.error('Erro ao buscar vendas do período (KPI vendedor):', error); return []; }
                return data || [];
            };

            // "Novo cliente" = o vendedor criou um orçamento no período para um cliente que
            // NUNCA teve nenhum orçamento antes do início desse período (em todo o sistema,
            // não só com esse vendedor). Não depende de nenhuma coluna extra em 'clientes' —
            // usa só o histórico da própria tabela 'orcamentos'.
            const buscarClientesCadastradosNoPeriodo = async (inicioStr, fimStr) => {
                // 1. Clientes para quem o vendedor criou orçamento dentro do período (qualquer status).
                const { data: orcsPeriodo, error: errPeriodo } = await db.from('orcamentos')
                    .select('id_cliente')
                    .eq('id_usuario', idVendedor)
                    .gte('data_criacao', `${inicioStr}T00:00:00`)
                    .lt('data_criacao', `${fimStr}T00:00:00`);
                if (errPeriodo) { console.error('Erro ao buscar orçamentos do período (KPI novos clientes):', errPeriodo); return 0; }
                const candidatos = [...new Set((orcsPeriodo || []).map(o => o.id_cliente).filter(Boolean))];
                if (candidatos.length === 0) return 0;

                // 2. Desses, quais já tinham QUALQUER orçamento (de qualquer vendedor) antes do
                // início do período? Esses não são "novos" — já existiam antes.
                const { data: orcsAnteriores, error: errAnteriores } = await db.from('orcamentos')
                    .select('id_cliente')
                    .in('id_cliente', candidatos)
                    .lt('data_criacao', `${inicioStr}T00:00:00`);
                if (errAnteriores) { console.error('Erro ao checar histórico de clientes (KPI novos clientes):', errAnteriores); return 0; }
                const clientesComHistorico = new Set((orcsAnteriores || []).map(o => o.id_cliente));

                return candidatos.filter(id => !clientesComHistorico.has(id)).length;
            };

            const [vendasAtual, vendasAnterior, clientesAtual, clientesAnterior] = await Promise.all([
                buscarVendasDoPeriodo(inicioAtual, fimAtualExclusivo),
                buscarVendasDoPeriodo(inicioAnterior, fimAnteriorExclusivo),
                buscarClientesCadastradosNoPeriodo(inicioAtual, fimAtualExclusivo),
                buscarClientesCadastradosNoPeriodo(inicioAnterior, fimAnteriorExclusivo)
            ]);

            const somarValor = arr => arr.reduce((acc, o) => acc + parseFloat(o.valor_orcado || 0), 0);
            const contarProdutos = arr => arr.reduce((acc, o) => acc + (o.modelo_colchao ? o.modelo_colchao.split(',').map(p => p.trim()).filter(Boolean).length : 0), 0);

            const valorAtual = somarValor(vendasAtual);
            const valorAnterior = somarValor(vendasAnterior);

            AppState.kpisDiariosVendedor = {
                labelComparacao,
                vendas: { hoje: valorAtual, ontem: valorAnterior },
                ticket: {
                    hoje: vendasAtual.length ? valorAtual / vendasAtual.length : 0,
                    ontem: vendasAnterior.length ? valorAnterior / vendasAnterior.length : 0
                },
                clientes: { hoje: clientesAtual, ontem: clientesAnterior },
                produtos: { hoje: contarProdutos(vendasAtual), ontem: contarProdutos(vendasAnterior) }
            };
        }

        // Alterna a tela de Início entre "Visão Vendedor" (padrão, desempenho pessoal
        // de quem está logado) e "Visão Gerencial" (loja inteira: ranking, mais
        // vendidos, filtros de loja/vendedor). Só quem tem permissão de Gerente/Admin
        // consegue chamar isso de verdade — o próprio botão nem existe no HTML pra
        // quem não tem (ver renderInicio) — mas a checagem aqui é a que garante a
        // regra, o botão é só a forma de chegar até ela.
        async function alternarVisaoDashboard(novaVisao) {
            const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
            if (!isGerente) return;
            if (novaVisao === store.dashboardView) return;
            store.dashboardView = novaVisao;

            // A troca reescreve a tela inteira (título, KPIs, gráficos, tabela) de
            // uma vez — sem transição, isso parece uma troca abrupta ("piscando").
            // Um fade curto no conteúdo, antes de trocar o HTML, faz a troca
            // parecer intencional em vez de brusca — inclusive quando o dado já
            // está em cache e não há nenhuma espera de rede de verdade.
            const main = document.getElementById('mainContent');
            if (main) main.classList.add('dash-view-fading');

            // KPIs da Visão Gerencial só são buscados na primeira vez que alguém entra
            // nela — não no carregamento inicial da página, pra não pagar esse custo
            // por padrão (a maioria abre a tela e fica na Visão Vendedor mesmo).
            const precisaBuscar = novaVisao === 'gerencial' && !AppState.kpisDiariosGerente;
            if (precisaBuscar) showLoader();
            try {
                await Promise.all([
                    precisaBuscar ? carregarKpisDiariosGerente() : Promise.resolve(),
                    // Dá tempo do fade acontecer mesmo quando o dado já está em
                    // cache (troca instantânea, sem essa espera, pareceria um corte seco).
                    new Promise((resolve) => setTimeout(resolve, 140))
                ]);
            } finally {
                if (precisaBuscar) hideLoader();
            }

            if (store.currentView === 'inicio') {
                renderInicio();
                // FAB de "novo orçamento" liga/desliga junto com a troca de visão —
                // Gerente só vende (e só vê o botão) na Visão Vendedor, então trocar
                // pra Gerencial tem que escondê-lo na hora, sem esperar outra navegação.
                atualizarFab('inicio');
                const mainAtualizado = document.getElementById('mainContent');
                if (mainAtualizado) {
                    // Um frame pra o navegador aplicar o novo conteúdo com opacidade 0
                    // antes de tirar a classe — senão o fade-in não roda (o browser
                    // "junta" as duas mudanças de classe no mesmo frame).
                    requestAnimationFrame(() => requestAnimationFrame(() => mainAtualizado.classList.remove('dash-view-fading')));
                }
            } else if (main) {
                main.classList.remove('dash-view-fading');
            }
        }

        async function selecionarPeriodoKpiVendedor(periodo) {
            if (periodo === store.kpiPeriodoVendedor) return;
            store.kpiPeriodoVendedor = periodo;
            // Bug pré-existente corrigido aqui: decidia qual cache re-buscar só pelo
            // perfil (Vendedor vs Gerente), ignorando QUAL sub-visão da Início está
            // ativa. Um Gerente/Admin na Visão Vendedor (verGerencial em renderInicio,
            // linha ~497) mostra AppState.kpisDiariosVendedor — mas ao trocar de
            // período, o código antigo sempre re-buscava kpisDiariosGerente pra
            // qualquer perfil não-Vendedor, deixando kpisDiariosVendedor parado nos
            // valores/rótulo ("vs. ontem") do carregamento inicial. E Administrador
            // não caía em nenhum dos dois braços — nunca re-buscava nada.
            const isGerenteOuAdmin = ['Gerente', 'Administrador', 'Admin'].includes(AppState.usuarioLogado.perfil);
            const verGerencial = isGerenteOuAdmin && store.dashboardView === 'gerencial';
            if (verGerencial) {
                await carregarKpisDiariosGerente(periodo);
            } else {
                await carregarKpisDiariosVendedor(periodo);
            }
            if (store.currentView === 'inicio') renderInicio();
        }

        async function carregarKpisDiariosGerente(periodo = store.kpiPeriodoVendedor) {
            const { inicioAtual, fimAtualExclusivo, inicioAnterior, fimAnteriorExclusivo, labelComparacao } = getIntervalosPeriodoKpi(periodo);

            // Determina quais vendedores entram na agregação
            const lojasPermitidas = getLojasPermitidas();
            let vendedoresFiltrados = store.todosVendedores;

            if (store.selectedLoja !== 'todas') {
                // Uma loja específica selecionada no filtro
                vendedoresFiltrados = store.todosVendedores.filter(v => v.id_loja === store.selectedLoja);
            } else if (lojasPermitidas && lojasPermitidas.length > 0) {
                // "Todas" = todas as lojas permitidas para este gerente
                vendedoresFiltrados = store.todosVendedores.filter(v => lojasPermitidas.includes(v.id_loja));
            }

            const idsVendedores = vendedoresFiltrados.map(v => v.id_usuario);
            const idsFechado = store.mapStatusUUID.filter(s => s.nome === STATUS.FECHADO).map(s => s.id_status);
            const idsFechadoSafe = idsFechado.length ? idsFechado : ['00000000-0000-0000-0000-000000000000'];

            const buscarVendasDoPeriodo = async (inicioStr, fimStr) => {
                let query = db.from('orcamentos')
                    .select('valor_orcado, modelo_colchao, id_usuario')
                    .in('id_status', idsFechadoSafe)
                    .gte('data_fechamento', `${inicioStr}T00:00:00`)
                    .lt('data_fechamento', `${fimStr}T00:00:00`);

                if (idsVendedores.length > 0) {
                    query = query.in('id_usuario', idsVendedores);
                } else {
                    query = query.eq('id_usuario', '00000000-0000-0000-0000-000000000000');
                }

                const { data, error } = await query;
                if (error) { console.error('Erro ao buscar vendas do período (KPI gerente):', error); return []; }
                return data || [];
            };

            const buscarClientesCadastradosNoPeriodo = async (inicioStr, fimStr) => {
                let queryPeriodo = db.from('orcamentos')
                    .select('id_cliente')
                    .gte('data_criacao', `${inicioStr}T00:00:00`)
                    .lt('data_criacao', `${fimStr}T00:00:00`);

                if (idsVendedores.length > 0) {
                    queryPeriodo = queryPeriodo.in('id_usuario', idsVendedores);
                } else {
                    queryPeriodo = queryPeriodo.eq('id_usuario', '00000000-0000-0000-0000-000000000000');
                }

                const { data: orcsPeriodo, error: errPeriodo } = await queryPeriodo;
                if (errPeriodo) { console.error('Erro ao buscar orçamentos do período (KPI novos clientes gerente):', errPeriodo); return 0; }

                const candidatos = [...new Set((orcsPeriodo || []).map(o => o.id_cliente).filter(Boolean))];
                if (candidatos.length === 0) return 0;

                const { data: orcsAnteriores, error: errAnteriores } = await db.from('orcamentos')
                    .select('id_cliente')
                    .in('id_cliente', candidatos)
                    .lt('data_criacao', `${inicioStr}T00:00:00`);

                if (errAnteriores) { console.error('Erro ao checar histórico de clientes (KPI novos clientes gerente):', errAnteriores); return 0; }
                const clientesComHistorico = new Set((orcsAnteriores || []).map(o => o.id_cliente));

                return candidatos.filter(id => !clientesComHistorico.has(id)).length;
            };

            const [vendasAtual, vendasAnterior, clientesAtual, clientesAnterior] = await Promise.all([
                buscarVendasDoPeriodo(inicioAtual, fimAtualExclusivo),
                buscarVendasDoPeriodo(inicioAnterior, fimAnteriorExclusivo),
                buscarClientesCadastradosNoPeriodo(inicioAtual, fimAtualExclusivo),
                buscarClientesCadastradosNoPeriodo(inicioAnterior, fimAnteriorExclusivo)
            ]);

            const somarValor = arr => arr.reduce((acc, o) => acc + parseFloat(o.valor_orcado || 0), 0);
            const contarProdutos = arr => arr.reduce((acc, o) => acc + (o.modelo_colchao ? o.modelo_colchao.split(',').map(p => p.trim()).filter(Boolean).length : 0), 0);

            const valorAtual = somarValor(vendasAtual);
            const valorAnterior = somarValor(vendasAnterior);

            AppState.kpisDiariosGerente = {
                labelComparacao,
                vendas: { hoje: valorAtual, ontem: valorAnterior },
                ticket: {
                    hoje: vendasAtual.length ? valorAtual / vendasAtual.length : 0,
                    ontem: vendasAnterior.length ? valorAnterior / vendasAnterior.length : 0
                },
                clientes: { hoje: clientesAtual, ontem: clientesAnterior },
                produtos: { hoje: contarProdutos(vendasAtual), ontem: contarProdutos(vendasAnterior) }
            };
        }

        async function carregarHistoricoFaturamento() {
            // Roda pra qualquer perfil que passe pela tela "Início" (Vendedor, e também
            // Gerente/Admin na "Visão Vendedor", que mostra o desempenho pessoal deles).
            const perfilElegivel = ['Vendedor', 'Gerente', 'Administrador', 'Admin'].includes(store.currentUser?.perfil);
            if (!perfilElegivel) { store.historicoFaturamento = []; return; }
            const hoje = new Date(); store.historicoFaturamento = [];
            try {
                const uuidsFechados = store.mapStatusUUID.filter(s => [STATUS.FECHADO, STATUS.VENDIDO].includes(s.nome)).map(s => s.id_status);

                for (let i = 5; i >= 0; i--) {
                    const mes = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); 
                    const ano = mes.getFullYear(); 
                    const mesNum = mes.getMonth() + 1;
                    const startDate = new Date(ano, mesNum - 1, 1).toISOString(); 
                    const endDate = new Date(ano, mesNum, 0, 23, 59, 59).toISOString();
                    
                    let query = db.from('orcamentos')
                        .select('valor_orcado')
                        .eq('id_usuario', store.currentUser.id_usuario)
                        .gte('data_fechamento', startDate)
                        .lte('data_fechamento', endDate);
                    
                    if(uuidsFechados.length > 0) {
                        query = query.in('id_status', uuidsFechados);
                    }

                    const { data } = await query;
                    const total = (data || []).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
                    const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); 
                    const anoAbrev = ano.toString().slice(-2);
                    store.historicoFaturamento.push({ mes: nomeMes + '/' + anoAbrev, valor: total });
                }
            } catch(e) { }
        }

        async function renderizarGraficos(total, fechados) {
            const ctxDonut = document.getElementById('donutCanvas');
            if (!ctxDonut) return false;

            const { Chart } = await import('chart.js/auto');

            // A tela pode ter mudado enquanto o chunk do Chart.js carregava.
            if (!document.getElementById('donutCanvas')) return false;

            const orcadosCount = total - fechados;
            
            if(store.donutChartInstance) { store.donutChartInstance.destroy(); }
            store.donutChartInstance = new Chart(ctxDonut, {
                type: 'doughnut',
                data: {
                    labels: ['Orçados', 'Fechados'],
                    datasets: [{
                        data: [orcadosCount, fechados],
                        backgroundColor: [
                            getComputedStyle(document.body).getPropertyValue('--chart-blue').trim() || '#3b82f6',
                            getComputedStyle(document.body).getPropertyValue('--chart-green').trim() || '#10b981'
                        ],
                        borderColor: '#fff',
                        borderWidth: 3,
                        borderRadius: 6,
                        hoverBorderWidth: 4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true, cutout: '65%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: getComputedStyle(document.body).getPropertyValue('--tooltip-bg').trim() || '#1e293b',
                            titleColor: getComputedStyle(document.body).getPropertyValue('--tooltip-text').trim() || '#f1f5f9',
                            bodyColor: getComputedStyle(document.body).getPropertyValue('--tooltip-body').trim() || '#cbd5e1',
                            padding: 12, cornerRadius: 8,
                            callbacks: {
                                label: function(ctx) {
                                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                                    return ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
                                }
                            }
                        }
                    }
                }
            });

            const ctxBar = document.getElementById('barChartCanvas');
            if (ctxBar && store.historicoFaturamento.length > 0) {
                if(store.barChartInstance) { store.barChartInstance.destroy(); }
                store.barChartInstance = new Chart(ctxBar, {
                    type: 'bar',
                    data: {
                        labels: store.historicoFaturamento.map(h => h.mes),
                        datasets: [{
                            label: 'Vendido',
                            data: store.historicoFaturamento.map(h => h.valor),
                            backgroundColor: getComputedStyle(document.body).getPropertyValue('--chart-green').trim() || '#10b981',
                            borderRadius: 6, borderSkipped: false, maxBarThickness: 40
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: getComputedStyle(document.body).getPropertyValue('--tooltip-bg').trim() || '#1e293b',
                                titleColor: getComputedStyle(document.body).getPropertyValue('--tooltip-text').trim() || '#f1f5f9',
                                bodyColor: getComputedStyle(document.body).getPropertyValue('--tooltip-body').trim() || '#cbd5e1',
                                padding: 10, cornerRadius: 6,
                                callbacks: {
                                    label: function(ctx) { return 'R$ ' + ctx.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) { return value >= 1000 ? 'R$ ' + (value / 1000).toFixed(0) + 'k' : 'R$ ' + value; },
                                    font: { size: 10, family: 'Inter' }, maxTicksLimit: 5
                                },
                                grid: { color: '#e2e8f0' }
                            },
                            x: { grid: { display: false }, ticks: { font: { size: 10, family: 'Inter' }, maxRotation: 45, minRotation: 0 } }
                        }
                    }
                });
            }
            return true;
        }

        function tentarRenderizarGraficos(total, fechados, tentativas = 0) {
            if (tentativas > 5) return;
            const donutCanvas = document.getElementById('donutCanvas');
            if (!donutCanvas) { setTimeout(() => tentarRenderizarGraficos(total, fechados, tentativas + 1), 300); return; }
            renderizarGraficos(total, fechados);
        }

        function renderInicio() {
    const main = document.getElementById('mainContent');
    // isGerente = permissão (quem PODE ver a Visão Gerencial e o botão de trocar).
    // verGerencial = o que está sendo exibido AGORA — só é true se, além de ter
    // permissão, a pessoa também tiver escolhido a Visão Gerencial no toggle.
    // Um Vendedor nunca tem isGerente, então verGerencial nunca liga pra ele.
    const isGerente = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
    const verGerencial = isGerente && store.dashboardView === 'gerencial';

    // 1. store.kpisMensais já vem filtrado corretamente do banco:
    //    abertos (Contato Inicial/Negociação/Em Fechamento) pela data de ABERTURA (data_criacao),
    //    finalizados (Fechado/Perdido) pela data de CONCLUSÃO (data_fechamento).
    const dados = store.kpisMensais;

    // 2. CÁLCULOS — direto de `dados` (bug corrigido: isso antes lia
    // AppState.kpisMensaisResumo, um resumo pré-calculado que nenhum código
    // do projeto jamais escrevia — sempre {} , sempre zero, mesmo com
    // vendas fechadas reais. Ver comentário em carregarKpisMensais().
    const total = dados.length;
    const fechadosArr = dados.filter(o => o.status === STATUS.FECHADO || o.status === 'Vendido');
    const fechados = fechadosArr.length;
    const negociacao = dados.filter(o => ![STATUS.FECHADO, STATUS.PERDIDO, 'Vendido', 'Declinado'].includes(o.status)).length;
    const valorVendido = fechadosArr.reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
    const conversao = total ? Math.round((fechados / total) * 100) : 0;
    const metaAtual = calcularMetaTotal();
    const percMetaExato = metaAtual ? Math.round((valorVendido / metaAtual) * 100) : 0;
    const gamified = getGamifiedColors(percMetaExato);

    // 3. UI/UX: RÓTULO DE PERÍODO CLARO PARA O USUÁRIO
    // Formato enxuto ("Agosto 2026" / "21 Agosto 2026") em vez de "Resultados de
    // agosto de 2026" — mais curto e evita o "De" duplicado que o
    // text-transform:capitalize do span (abaixo) gerava em cima do "de" do
    // toLocaleDateString (ficava "Resultados De Agosto De 2026").
    const nomeMesSelecionado = new Date(store.currentYear, store.currentMonth - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    const labelPeriodo = store.currentDay ? `${store.currentDay} ${nomeMesSelecionado} ${store.currentYear}` : `${nomeMesSelecionado} ${store.currentYear}`;

    // 4. HEADER HTML BEM FECHADO E ISOLADO
    // O botão de alternar visão só existe no HTML pra quem tem permissão — pra um
    // Vendedor, essa string nem é gerada, o botão não está no DOM de jeito nenhum.
    const toggleVisaoHtml = isGerente ? `
        <div class="dash-view-toggle-group">
            <div class="dash-view-toggle" role="tablist" aria-label="Alternar entre visão do vendedor e visão gerencial">
                <button type="button" class="dash-view-btn ${!verGerencial ? 'active' : ''}" role="tab" aria-selected="${!verGerencial}" onclick="alternarVisaoDashboard('vendedor')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Visão Vendedor
                </button>
                <button type="button" class="dash-view-btn gerencial ${verGerencial ? 'active' : ''}" role="tab" aria-selected="${verGerencial}" onclick="alternarVisaoDashboard('gerencial')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                    Visão Gerencial
                </button>
            </div>
        </div>` : '';

    const headerHtml = `
    <header class="dashboard-header">
        <div style="display: flex; align-items: center; gap: 12px;">
            <span class="page-icon gold" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-7a1 1 0 00-1-1h-4a1 1 0 00-1 1v7H4a1 1 0 01-1-1V9.5z"/></svg></span>
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <h1 style="margin: 0;">${verGerencial ? 'Dashboard Vendas' : 'Dashboard do Vendedor'}</h1>
                <span style="font-size: 13px; color: var(--text-muted); font-weight: 500; text-transform: capitalize;">${labelPeriodo}</span>
            </div>
        </div>
        <div class="header-controls">
            ${toggleVisaoHtml}
            ${renderFiltrosData(verGerencial)}
            <div class="header-notification-area">
                <button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações">
                    <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    <span class="notification-badge" id="notificationBadgeCount"></span>
                </button>
            </div>
        </div>
    </header>
    ${isGerente ? `<div class="dash-context-strip ${verGerencial ? 'gerencial' : ''}"></div>` : ''}`;

    // 5. CARDS E GRÁFICOS — Seção "Meta de [mês]" (Claude Design v2: herói numérico)
    const diaAtual = new Date().getDate();
    const ultimoDiaMes = new Date(store.currentYear, store.currentMonth, 0).getDate();
    const nomeMesAbrev = new Date(store.currentYear, store.currentMonth - 1, 1)
        .toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const faltam = Math.max(0, metaAtual - valorVendido);
    const fmtMeta = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const progressHtml = `
<section class="meta-inicio-section">
    <span class="meta-section-label">Meta de ${nomeMesSelecionado}</span>
    <div class="meta-hero-card">
        <div class="meta-hero-top">
            <div class="meta-hero-left">
                <span class="meta-hero-value">R$ ${fmtMeta(valorVendido)}</span>
                <span class="meta-hero-sub">de <span class="meta-mono">${fmtMeta(metaAtual)}</span> · faltam <span class="meta-mono">${fmtMeta(faltam)}</span></span>
            </div>
            <div class="meta-hero-right">
                <span class="meta-pct-big" style="color:${gamified.motiveColor};">${percMetaExato > 100 ? '100+' : percMetaExato}%</span>
                <span class="meta-motive-label" style="color:${gamified.motiveColor};">${gamified.motive}</span>
            </div>
        </div>
        <div class="meta-bar-outer">
            <div class="meta-bar-fill" style="width:${Math.min(100, percMetaExato)}%; background:${gamified.bg};"></div>
        </div>
        <div class="meta-scale">
            <span>01 ${nomeMesAbrev}</span>
            <span class="meta-scale-today">hoje · dia ${diaAtual}</span>
            <span>${ultimoDiaMes} ${nomeMesAbrev}</span>
        </div>
    </div>
</section>`;
    
    // Monta a seção inteira (título + toolbar + grid) já pronta — junto num único
    // <section>, senão o gap:24px que .main-content dá entre TODOS os filhos de
    // topo entraria também entre o título e o painel de KPIs, brigando com o
    // respiro apertado (regra de proximidade) que .section-header pede.
    let kpiSectionHtml;

    // Verifica se deve mostrar KPIs diários (Visão Vendedor individual ou Visão Gerencial agregada)
    const mostrarKpisDiarios = store.currentUser.perfil === 'Vendedor' || isGerente;

    if (mostrarKpisDiarios) {
        // Visão Vendedor usa kpisDiariosVendedor (inclusive pra Gerente/Admin nessa
        // visão — é o desempenho PESSOAL de quem está logado), Visão Gerencial usa
        // kpisDiariosGerente (agregado da loja).
        const k = verGerencial
            ? (AppState.kpisDiariosGerente || { labelComparacao: 'vs. ontem', vendas: { hoje: 0, ontem: 0 }, ticket: { hoje: 0, ontem: 0 }, clientes: { hoje: 0, ontem: 0 }, produtos: { hoje: 0, ontem: 0 } })
            : (AppState.kpisDiariosVendedor || { labelComparacao: 'vs. ontem', vendas: { hoje: 0, ontem: 0 }, ticket: { hoje: 0, ontem: 0 }, clientes: { hoje: 0, ontem: 0 }, produtos: { hoje: 0, ontem: 0 } });

        // Label de cada card muda com o período selecionado — é a conexão semântica
        // entre o filtro (toolbar) e os números: confirma pro usuário qual período
        // está vendo, sem precisar olhar pro segmented control pra descobrir.
        const LABELS_KPI_POR_PERIODO = {
            hoje:   { vendas: 'Vendas hoje',          ticket: 'Ticket médio hoje',          clientes: 'Novos clientes hoje',          produtos: 'Produtos vendidos hoje' },
            semana: { vendas: 'Vendas na semana',     ticket: 'Ticket médio na semana',     clientes: 'Novos clientes na semana',     produtos: 'Produtos vendidos na semana' },
            mes:    { vendas: 'Vendas no mês',        ticket: 'Ticket médio no mês',         clientes: 'Novos clientes no mês',        produtos: 'Produtos vendidos no mês' }
        };
        const labelsKpi = LABELS_KPI_POR_PERIODO[store.kpiPeriodoVendedor] || LABELS_KPI_POR_PERIODO.hoje;
        const fmtMoeda = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const periodos = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']];

        // Título muda conforme a visão atual
        const tituloKpi = verGerencial ? 'Desempenho da Loja' : 'Meu Desempenho';

        const ICONE_KPI_DOLAR = '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
        const ICONE_KPI_TAG = '<svg viewBox="0 0 24 24"><path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2.83 12.83a2 2 0 010-2.83l7.17-7.17a2 2 0 012.83 0l7.76 7.76a2 2 0 010 2.83z"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>';
        const ICONE_KPI_PESSOAS = '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M1 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/><circle cx="17" cy="9" r="3"/><path d="M23 21v-2a3 3 0 00-2-2.7"/></svg>';
        const ICONE_KPI_CAIXA = '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

        const cardsKpiHtml = [
            buildKpiCard({ cor: 'green', icone: ICONE_KPI_DOLAR, label: labelsKpi.vendas, valor: `R$ ${fmtMoeda(k.vendas.hoje)}`, variacao: calcularVariacaoPercentual(k.vendas.hoje, k.vendas.ontem), comparacaoLabel: k.labelComparacao }),
            buildKpiCard({ cor: 'blue', icone: ICONE_KPI_TAG, label: labelsKpi.ticket, valor: `R$ ${fmtMoeda(k.ticket.hoje)}`, variacao: calcularVariacaoPercentual(k.ticket.hoje, k.ticket.ontem), comparacaoLabel: k.labelComparacao }),
            buildKpiCard({ cor: 'orange', icone: ICONE_KPI_PESSOAS, label: labelsKpi.clientes, valor: k.clientes.hoje, variacao: calcularVariacaoPercentual(k.clientes.hoje, k.clientes.ontem), comparacaoLabel: k.labelComparacao }),
            buildKpiCard({ cor: 'green', icone: ICONE_KPI_CAIXA, label: labelsKpi.produtos, valor: k.produtos.hoje, variacao: calcularVariacaoPercentual(k.produtos.hoje, k.produtos.ontem), comparacaoLabel: k.labelComparacao, destaque: true })
        ].join('');

        // Mesmo padrão de "Meu Radar" (.section-header/.section-title/.section-icon-badge)
        // — as duas seções da Início precisam ler como irmãs do mesmo grupo, não como
        // blocos com estilo próprio cada um. Ver comentário em style.css (MÓDULO MEU RADAR).
        // Modelo v2: o segmented control Hoje/Semana/Mês sai do .kpi-toolbar (que
        // não existe mais visualmente — display:none) e vai pro .header-actions
        // do próprio .section-header, ficando na mesma linha do rótulo da seção.
        kpiSectionHtml = `<section class="kpi-inicio-section">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="section-icon-badge">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                    </span>
                    ${tituloKpi}
                </h2>
                <div class="header-actions">
                    <div class="kpi-periodo-toggle">${periodos.map(([valor, rotulo]) =>
                        `<button type="button" class="kpi-periodo-btn ${store.kpiPeriodoVendedor === valor ? 'active' : ''}" onclick="selecionarPeriodoKpiVendedor('${valor}')">${rotulo}</button>`
                    ).join('')}</div>
                </div>
            </div>
            <div class="kpi-panel">
                <div class="kpi-grid-compact">${cardsKpiHtml}</div>
            </div>
        </section>`;
    } else {
        kpiSectionHtml = `<section class="kpi-row"><div class="kpi-card"><span class="kpi-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></span><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Oportunidades Geradas</span></div><div class="kpi-value">${total}</div></div><div class="kpi-card"><span class="kpi-icon orange" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Em Tratativa</span></div><div class="kpi-value">${negociacao}</div></div><div class="kpi-card"><span class="kpi-icon green" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Taxa de Conversão</span></div><div class="kpi-value">${conversao}%</div></div><div class="kpi-card vendido-highlight"><span class="kpi-icon green" aria-hidden="true"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></span><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Vendas Fechadas</span></div><div class="kpi-value">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div></section>`;
    }
    
    
    // "Aproveitamento" (donut) e "Evolução Mensal" (barras) só existem na Visão
    // Gerencial agora — na Visão Vendedor esse espaço virou o bloco "Meu Radar"
    // (ver chartsRowHtml mais abaixo).
    const donutHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Aproveitamento</h3><div class="donut-wrapper"><canvas id="donutCanvas" width="200" height="200"></canvas></div><div class="donut-legend"><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color orcados"></span> Orçados <strong>${total}</strong></div><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color fechados"></span> Fechados <strong>${fechados}</strong></div></div></div>`;

    let rankingHtml = '';
                if (verGerencial) {
                    let vendedoresRanking = store.todosVendedores;
                    if (store.currentUser.perfil === 'Gerente') {
                        const lojasPermitidasRanking = getLojasPermitidas();
                        vendedoresRanking = lojasPermitidasRanking
                            ? store.todosVendedores.filter(v => lojasPermitidasRanking.includes(v.id_loja))
                            : store.todosVendedores;
                        if (store.selectedLoja !== 'todas') vendedoresRanking = vendedoresRanking.filter(v => v.id_loja === store.selectedLoja);
                    } else if (store.selectedLoja !== 'todas') {
                        vendedoresRanking = store.todosVendedores.filter(v => v.id_loja === store.selectedLoja);
                    }
                
                    if (vendedoresRanking.length > 0) {
                        const ranking = vendedoresRanking.map(v => {
                            const vendido = dados.filter(o => o.id_usuario === v.id_usuario && (o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO)).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
                            const meta = parseFloat(v.meta_mensal || 0);
                            // pct = % da meta individual; se sem meta, usa ranking relativo (max=100)
                            const pct = meta > 0 ? Math.min((vendido / meta) * 100, 100) : 0;
                            return { nome: v.nome, vendido, meta, pct };
                        }).sort((a, b) => b.vendido - a.vendido);

                        // cores da barra por atingimento - usando variáveis CSS
                        const barColor = pct => {
                            if (pct >= 100) return 'linear-gradient(90deg, var(--accent-green-dark), var(--chart-green))';
                            if (pct >= 70)  return 'linear-gradient(90deg, #2563eb, var(--brand-blue))';
                            if (pct >= 40)  return 'linear-gradient(90deg, var(--accent-orange), #fbbf24)';
                            return 'linear-gradient(90deg, var(--chart-red), #f87171)';
                        };
                        const posClass = i => i === 0 ? 'pos-1' : i === 1 ? 'pos-2' : i === 2 ? 'pos-3' : '';
                        const posLabel = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;

                        rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> Top Vendedores</h3><ul class="ranking-list">${ranking.map((r, i) => `
                            <li class="ranking-item">
                                <div class="ranking-item-top">
                                    <span class="ranking-pos ${posClass(i)}">${posLabel(i)}</span>
                                    <span class="ranking-nome">${escapeHtml(r.nome)}</span>
                                    <span class="ranking-valor">R$\u00a0${r.vendido.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                    <span class="ranking-pct-label">${r.meta > 0 ? Math.round(r.pct) + '%' : '–'}</span>
                                </div>
                                <div class="ranking-bar-outer">
                                    <div class="ranking-bar-inner" style="width:${r.pct}%; background:${barColor(r.pct)};"></div>
                                </div>
                            </li>`).join('')}</ul></div>`;
                    } else {
                        rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Top Vendedores</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Nenhum vendedor encontrado para esta loja.</div></div>`;
                    }
                }

            const top5 = {};
            // Usa fechadosArr para contar apenas o que realmente foi vendido e fechado
        fechadosArr.forEach(o => {
            const modelosStr = (o.modelo_colchao || '').trim();
            if (!modelosStr || modelosStr === 'Sem modelo') return;
            
            const nomesProdutosOrc = modelosStr.split(',').map(p => p.trim()).filter(Boolean);
            nomesProdutosOrc.forEach(m => {
                if (!top5[m]) top5[m] = { nome: m, count: 0 };
                top5[m].count++;
            });
        });
        
        const top5Ordenado = Object.values(top5).sort((a, b) => b.count - a.count).slice(0, 5);
        
        // Trocado de 'orç.' para 'unid.' para fazer sentido com Vendas Fechadas
        const top5Html = top5Ordenado.map((p, i) => {
           
        // Limpa códigos numéricos ou alfanuméricos (ex: 5014020 - ou TR00107 - )
        const nomeLimpo = p.nome.replace(/^[a-zA-Z0-9]+\s*-\s*/, '').toLowerCase();
            
            return `
            <li>
                <span class="top5-rank">${i + 1}</span>
                <span style="flex:1; font-size: 13px; font-weight: 500; text-transform: capitalize; padding-right: 8px; line-height: 1.4;" title="${escapeHtml(p.nome)}">
                    ${escapeHtml(nomeLimpo)}
                </span>
                <span class="top5-count-badge">
                    ${p.count} unid.
                </span>
            </li>
        `}).join('') || '<li style="justify-content:center; color:var(--text-muted);">Nenhuma venda fechada</li>';
        
            let chartsRowHtml = '';
            if (verGerencial) {
                chartsRowHtml = `<section class="charts-row">${donutHtml}${rankingHtml}<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Mais Vendidos</h3><ul class="top5-list">${top5Html}</ul></div></section>`;
            } else {
                // Visão Vendedor: no lugar da antiga fileira de gráficos (Aproveitamento +
                // Evolução Mensal + Mais Vendidos), mostra o "Meu Radar" — os sinais e
                // alertas pessoais do vendedor logado.
                chartsRowHtml = `<section class="radar-inicio-section">${getMeuRadarBlockHtml()}</section>`;
            }

            main.innerHTML = `${headerHtml}${progressHtml}${kpiSectionHtml}${chartsRowHtml}`;

            if (verGerencial) {
                requestAnimationFrame(() => { tentarRenderizarGraficos(total, fechados); });
            } else {
                initMeuRadar();
            }

            renderNotificationBadge(buildNotifications().length);

        }

export { alternarVisaoDashboard, atualizarKPIsDashboard, buildKpiCard, calcularVariacaoPercentual, carregarHistoricoFaturamento, carregarKpisDiariosGerente, carregarKpisDiariosVendedor, carregarKpisEDashboard, getIntervalosPeriodoKpi, renderInicio, renderizarGraficos, selecionarPeriodoKpiVendedor, tentarRenderizarGraficos };
