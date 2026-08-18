// Cobre o achado crítico corrigido em 93d736a: criar-usuario não podia mais
// ser chamada sem autenticação, nem por alguém que não seja Administrador.
const { createClient } = require('@supabase/supabase-js');
const { admin, URL, ANON_KEY, MARCA, SENHA_TESTE, assert, criarUsuarioEfemero } = require('./helpers');

const LOJA_A = '9a427fd1-b5ec-4487-863e-da519daa8fbc';

module.exports = async function testCriarUsuario() {
    const cleanups = [];
    try {
        // Caso 1: sem autenticação nenhuma (só a anon key pública) — deve ser rejeitado.
        const anon = createClient(URL, ANON_KEY);
        const semAuth = await anon.functions.invoke('criar-usuario', {
            body: { nome: 'x', email: MARCA + 'invasor1@teste.local', senha: SENHA_TESTE, loja: LOJA_A, perfil: 'Administrador', status: 'Ativo' }
        });
        assert(!!semAuth.error, 'chamada sem autenticação deveria ser rejeitada, mas foi aceita');

        // Caso 2: usuário logado, mas Vendedor (não-admin) — deve ser rejeitado.
        const vendedor = await criarUsuarioEfemero({ perfil: 'Vendedor', idLoja: LOJA_A, prefixo: 'vend' });
        cleanups.push(vendedor.cleanup);
        const vendTentativa = await vendedor.client.functions.invoke('criar-usuario', {
            body: { nome: 'x', email: MARCA + 'invasor2@teste.local', senha: SENHA_TESTE, loja: LOJA_A, perfil: 'Administrador', status: 'Ativo' }
        });
        assert(!!vendTentativa.error, 'Vendedor conseguiu criar Administrador — checagem de perfil não está funcionando');

        // Caso 3: Administrador real criando um Vendedor — deve funcionar de ponta a ponta.
        const adminUser = await criarUsuarioEfemero({ perfil: 'Administrador', idLoja: LOJA_A, prefixo: 'admin' });
        cleanups.push(adminUser.cleanup);
        const emailNovo = MARCA + 'novo@teste.local';
        const criacao = await adminUser.client.functions.invoke('criar-usuario', {
            body: { nome: 'Novo Vendedor', email: emailNovo, senha: SENHA_TESTE, loja: LOJA_A, perfil: 'Vendedor', status: 'Ativo' }
        });
        assert(!criacao.error, 'Administrador real deveria conseguir criar usuário, mas foi rejeitado: ' + JSON.stringify(criacao.error));

        const { data: criado } = await admin.from('usuarios').select('id_usuario, perfil').eq('email', emailNovo).single();
        assert(!!criado, 'usuário criado por um admin deveria existir na tabela usuarios');
        assert(criado.perfil === 'Vendedor', 'perfil do usuário criado deveria ser Vendedor, veio ' + criado?.perfil);

        cleanups.push(async () => {
            await admin.from('usuarios').delete().eq('id_usuario', criado.id_usuario);
            const list = await admin.auth.admin.listUsers();
            const u = list.data.users.find((x) => x.email === emailNovo);
            if (u) await admin.auth.admin.deleteUser(u.id);
        });
    } finally {
        for (const fn of cleanups.reverse()) await fn().catch(() => {});
    }
};
