// A fronteira que realmente protege o modelo de franquia: um Gerente
// (franqueado) só pode enxergar, via PostgREST, clientes das lojas que ele
// possui — e um franqueado pode ter mais de uma loja (tabela usuario_lojas).
// Este teste cobre os dois lados dessa regra:
//   1) um franqueado multi-loja enxerga uma loja adicional dele via
//      usuario_lojas (não só a loja "base" da tabela usuarios);
//   2) mesmo assim, ele continua sem enxergar a loja de OUTRO franqueado.
// A regra em si é current_perfil() = 'Gerente' AND ou.id_loja = ANY(current_lojas_permitidas()),
// onde current_lojas_permitidas() faz union de usuario_lojas com o
// usuarios.id_loja "base" (ver 20260818000003_rls_multi_tenant.sql).
const { admin, MARCA, assert, criarUsuarioEfemero } = require('./helpers');

const LOJA_A = '9a427fd1-b5ec-4487-863e-da519daa8fbc';
const LOJA_B = '0037a4c2-6732-4006-a1ee-a408332492fb'; // 010140 - MOOCA PLAZA (outro franqueado)
const LOJA_C = '4f82e8a3-d0f6-42cf-b775-35d703d35dfa'; // 010901 - LORENA (2ª loja do MESMO franqueado)

async function criarClienteNaLoja(vendedor, sufixo, statusId, cpf) {
    const salvar = await vendedor.client.rpc('rpc_salvar_orcamento', {
        p_id_cliente: null,
        p_nome_cliente: MARCA + 'cliente_' + sufixo,
        p_cpf: cpf,
        p_whatsapp: '11987654321',
        p_email: null,
        p_id_usuario_cadastro: vendedor.usuarioId,
        p_id_usuario: vendedor.usuarioId,
        p_id_status: statusId,
        p_id_nivel_interesse: null,
        p_valor_orcado: 1000,
        p_modelo_colchao: MARCA + 'produto',
        p_data_criacao: new Date().toISOString(),
        p_data_contato: null,
        p_hora_contato: null,
        p_observacao_agendamento: null,
        p_observacoes: null,
        p_origem: 'teste'
    });
    assert(!salvar.error, `setup falhou ao criar cliente/orçamento em ${sufixo}: ` + JSON.stringify(salvar.error));
    return salvar.data[0]; // { id_cliente, id_orcamento }
}

module.exports = async function testRlsGerenteMultiTenant() {
    const cleanups = [];
    try {
        const { data: statusRow } = await admin.from('status_orcamento').select('id_status').limit(1).single();

        // Vendedor da loja B (outro franqueado) e vendedor da loja C (2ª loja do
        // franqueado que estamos testando) — cada um "dono" de um cliente na
        // própria loja, para servir de dado de teste.
        const vendedorB = await criarUsuarioEfemero({ perfil: 'Vendedor', idLoja: LOJA_B, prefixo: 'rlsGerVendB' });
        cleanups.push(vendedorB.cleanup);
        const vendedorC = await criarUsuarioEfemero({ perfil: 'Vendedor', idLoja: LOJA_C, prefixo: 'rlsGerVendC' });
        cleanups.push(vendedorC.cleanup);

        // GerenteA: franqueado dono da loja A (base, em usuarios.id_loja) E da
        // loja C (adicional, via usuario_lojas — igual ao fluxo real de "Gerente
        // Multiloja" em usuarios.js).
        const gerenteA = await criarUsuarioEfemero({ perfil: 'Gerente', idLoja: LOJA_A, prefixo: 'rlsGerA' });
        cleanups.push(gerenteA.cleanup);
        const { error: multilojaError } = await admin.from('usuario_lojas').insert({ id_usuario: gerenteA.usuarioId, id_loja: LOJA_C });
        assert(!multilojaError, 'setup falhou ao associar loja adicional ao franqueado: ' + JSON.stringify(multilojaError));
        cleanups.push(async () => { await admin.from('usuario_lojas').delete().eq('id_usuario', gerenteA.usuarioId).eq('id_loja', LOJA_C); });

        // GerenteB: franqueado dono só da loja B — o "outro franqueado" nesse cenário.
        const gerenteB = await criarUsuarioEfemero({ perfil: 'Gerente', idLoja: LOJA_B, prefixo: 'rlsGerB' });
        cleanups.push(gerenteB.cleanup);

        const clienteLojaB = await criarClienteNaLoja(vendedorB, 'lojaB', statusRow.id_status, '52998224725');
        cleanups.push(async () => {
            await admin.from('comentarios').delete().eq('id_orcamento', clienteLojaB.id_orcamento);
            await admin.from('orcamentos').delete().eq('id_orcamento', clienteLojaB.id_orcamento);
            await admin.from('clientes').delete().eq('id_cliente', clienteLojaB.id_cliente);
        });

        const clienteLojaC = await criarClienteNaLoja(vendedorC, 'lojaC', statusRow.id_status, '11144477735');
        cleanups.push(async () => {
            await admin.from('comentarios').delete().eq('id_orcamento', clienteLojaC.id_orcamento);
            await admin.from('orcamentos').delete().eq('id_orcamento', clienteLojaC.id_orcamento);
            await admin.from('clientes').delete().eq('id_cliente', clienteLojaC.id_cliente);
        });

        // 1) Franqueado multi-loja: GerenteA precisa enxergar o cliente da loja C,
        //    que não é a loja "base" dele, mas é uma loja adicional que ele possui.
        const { data: clienteMultiloja } = await gerenteA.client.from('clientes').select('id_cliente').eq('id_cliente', clienteLojaC.id_cliente).maybeSingle();
        assert(!!clienteMultiloja, 'franqueado multi-loja não conseguiu ver cliente de uma loja adicional dele (usuario_lojas) — regressão no suporte a Gerente Multiloja');

        // 2) Isolamento entre franqueados: mesmo sendo multi-loja, GerenteA
        //    continua sem poder ver o cliente da loja B, de OUTRO franqueado.
        const { data: vazamento } = await gerenteA.client.from('clientes').select('id_cliente').eq('id_cliente', clienteLojaB.id_cliente).maybeSingle();
        assert(!vazamento, 'RLS vazou: um franqueado multi-loja conseguiu ler um cliente da loja de OUTRO franqueado');

        // 3) Controle simétrico: GerenteB (o outro franqueado) não vê nada das
        //    lojas do primeiro franqueado, nem a base (A) nem a adicional (C).
        const { data: vazamentoB1 } = await gerenteB.client.from('clientes').select('id_cliente').eq('id_cliente', clienteLojaC.id_cliente).maybeSingle();
        assert(!vazamentoB1, 'RLS vazou: GerenteB conseguiu ler um cliente da loja C de outro franqueado');

        // Mesma checagem na listagem de orçamentos (carteira), não só na ficha do cliente.
        const { data: orcamentosVazados } = await gerenteA.client.from('orcamentos').select('id_orcamento').eq('id_orcamento', clienteLojaB.id_orcamento);
        assert(!orcamentosVazados || orcamentosVazados.length === 0, 'RLS vazou: franqueado conseguiu ler um orçamento da loja de outro franqueado');
    } finally {
        for (const fn of cleanups.reverse()) await fn().catch(() => {});
    }
};
