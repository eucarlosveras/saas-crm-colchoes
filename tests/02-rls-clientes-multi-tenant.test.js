// Sanidade do RLS multi-tenant: um Vendedor de uma loja não pode enxergar,
// via PostgREST, um cliente cadastrado em outra loja.
const { admin, MARCA, assert, criarUsuarioEfemero } = require('./helpers');

const LOJA_A = '9a427fd1-b5ec-4487-863e-da519daa8fbc';
const LOJA_B = '0037a4c2-6732-4006-a1ee-a408332492fb'; // 010140 - MOOCA PLAZA

module.exports = async function testRlsMultiTenant() {
    const cleanups = [];
    try {
        const vendedorB = await criarUsuarioEfemero({ perfil: 'Vendedor', idLoja: LOJA_B, prefixo: 'rlsB' });
        cleanups.push(vendedorB.cleanup);
        const vendedorA = await criarUsuarioEfemero({ perfil: 'Vendedor', idLoja: LOJA_A, prefixo: 'rlsA' });
        cleanups.push(vendedorA.cleanup);

        const { data: statusRow } = await admin.from('status_orcamento').select('id_status').limit(1).single();

        // VendedorB cria um cliente/orçamento na loja dele (loja B).
        const salvar = await vendedorB.client.rpc('rpc_salvar_orcamento', {
            p_id_cliente: null,
            p_nome_cliente: MARCA + 'cliente_lojaB',
            p_cpf: '52998224725',
            p_whatsapp: '11987654321',
            p_email: null,
            p_id_usuario_cadastro: vendedorB.usuarioId,
            p_id_usuario: vendedorB.usuarioId,
            p_id_status: statusRow.id_status,
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
        assert(!salvar.error, 'setup falhou ao criar cliente/orçamento de teste: ' + JSON.stringify(salvar.error));
        const { id_cliente: clienteId, id_orcamento: orcamentoId } = salvar.data[0];
        cleanups.push(async () => {
            await admin.from('comentarios').delete().eq('id_orcamento', orcamentoId);
            await admin.from('orcamentos').delete().eq('id_orcamento', orcamentoId);
            await admin.from('clientes').delete().eq('id_cliente', clienteId);
        });

        // Controle positivo: o próprio VendedorB precisa continuar enxergando o cliente dele.
        const { data: proprioCliente } = await vendedorB.client.from('clientes').select('id_cliente').eq('id_cliente', clienteId).maybeSingle();
        assert(!!proprioCliente, 'RLS bloqueou o próprio dono do cliente de vê-lo — regressão grave, RLS mais restritiva do que deveria');

        // Teste real: VendedorA (loja diferente) não pode ver o cliente da loja B.
        const { data: vazamento } = await vendedorA.client.from('clientes').select('id_cliente').eq('id_cliente', clienteId).maybeSingle();
        assert(!vazamento, 'RLS vazou: Vendedor da loja A conseguiu ler um cliente da loja B');
    } finally {
        for (const fn of cleanups.reverse()) await fn().catch(() => {});
    }
};
