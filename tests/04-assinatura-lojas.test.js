// Garantia central do controle manual de assinantes (Painel do Operador,
// src/lojas.js): a policy "lojas_update_gestores" já deixa um Gerente dar
// UPDATE na própria loja (pensada pra "meta da loja"), e RLS é por LINHA, não
// por coluna — sem uma trava extra, um Gerente poderia se auto-promover pra
// assinatura_status='Ativa' via uma chamada direta à API, contornando o
// controle do Administrador por completo. Este teste cobre o trigger
// trg_lojas_protege_assinatura (20260901120000_assinatura_lojas.sql) dos dois
// lados: Gerente barrado, Administrador liberado.
const { admin, assert, criarUsuarioEfemero } = require('./helpers');

const LOJA_A = '9a427fd1-b5ec-4487-863e-da519daa8fbc'; // mesma loja real usada em 03-rls-gerente-multi-tenant

module.exports = async function testAssinaturaLojas() {
    const cleanups = [];
    try {
        const { data: original, error: origErr } = await admin.from('lojas')
            .select('plano, assinatura_status, assinatura_valido_ate, assinatura_obs')
            .eq('id_loja', LOJA_A)
            .single();
        assert(!origErr, 'setup falhou ao ler estado original da loja: ' + JSON.stringify(origErr));
        cleanups.push(async () => { await admin.from('lojas').update(original).eq('id_loja', LOJA_A); });

        // Prefixo em minúsculas de propósito: current_perfil()/current_is_admin()
        // (e toda a RLS que depende delas) comparam "email = auth.email()" com
        // igualdade EXATA, e auth.email() sempre devolve minúsculas — um e-mail
        // de teste com maiúscula (ex: 'assinGer') faz o Postgres não encontrar a
        // linha em usuarios, current_perfil() vira NULL, e a RLS trata a UPDATE
        // como "0 linhas visíveis" (sucesso vazio, não erro) sem a trigger nem
        // chegar a rodar — um falso-negativo enganoso pra este teste. Bug real,
        // pré-existente e mais amplo que esta trigger (afeta toda a RLS pra
        // qualquer usuário com maiúscula no e-mail) — não corrigido aqui.
        const gerente = await criarUsuarioEfemero({ perfil: 'Gerente', idLoja: LOJA_A, prefixo: 'assinger' });
        cleanups.push(gerente.cleanup);
        const adm = await criarUsuarioEfemero({ perfil: 'Administrador', idLoja: null, prefixo: 'assinadm' });
        cleanups.push(adm.cleanup);

        // 1) Gerente tentando se auto-promover: precisa ser barrado pelo trigger,
        //    não só "sem efeito" — se não vier erro, a proteção não está ativa.
        const tentativaGerente = await gerente.client.from('lojas')
            .update({ assinatura_status: 'Ativa' })
            .eq('id_loja', LOJA_A);
        assert(!!tentativaGerente.error, 'Gerente conseguiu alterar assinatura_status da própria loja sem erro — trigger de proteção não está funcionando');

        const { data: aposGerente } = await admin.from('lojas').select('assinatura_status').eq('id_loja', LOJA_A).single();
        assert(aposGerente.assinatura_status === original.assinatura_status, 'assinatura_status mudou mesmo com o UPDATE do Gerente tendo retornado erro');

        // 2) Administrador real: a mesma operação precisa funcionar.
        const novoValidoAte = new Date(Date.now() + 30 * 86400000).toISOString();
        const tentativaAdmin = await adm.client.from('lojas')
            .update({ assinatura_status: 'Ativa', plano: 'Pro', assinatura_valido_ate: novoValidoAte, assinatura_obs: 'teste automatizado' })
            .eq('id_loja', LOJA_A);
        assert(!tentativaAdmin.error, 'Administrador não conseguiu atualizar assinatura da loja: ' + JSON.stringify(tentativaAdmin.error));

        const { data: aposAdmin } = await admin.from('lojas').select('assinatura_status, plano').eq('id_loja', LOJA_A).single();
        assert(aposAdmin.assinatura_status === 'Ativa' && aposAdmin.plano === 'Pro', 'UPDATE do Administrador não refletiu no banco');

        // 3) Gerente ainda pode dar UPDATE na loja em colunas fora do escopo de
        //    assinatura (ex: nome_loja) — o trigger só protege as 4 colunas de
        //    billing, não bloqueia toda a policy existente.
        const { data: lojaAtual } = await admin.from('lojas').select('nome_loja').eq('id_loja', LOJA_A).single();
        const tentativaNome = await gerente.client.from('lojas').update({ nome_loja: lojaAtual.nome_loja }).eq('id_loja', LOJA_A);
        assert(!tentativaNome.error, 'trigger bloqueou um UPDATE do Gerente que nem tocava colunas de assinatura — proteção passou do escopo pretendido: ' + JSON.stringify(tentativaNome.error));
    } finally {
        for (const fn of cleanups.reverse()) await fn().catch(() => {});
    }
};
