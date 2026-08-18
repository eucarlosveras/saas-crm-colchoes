require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_KEY) {
    console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY precisam estar em .env para rodar os testes de integração.');
    process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const MARCA = '_teste_' + Date.now() + '_'; // minúsculo de propósito: auth normaliza e-mail em minúsculas
const SENHA_TESTE = 'Teste!2026#xk9';

function assert(cond, msg) {
    if (!cond) throw new Error('Assertion falhou: ' + msg);
}

/** Cria um usuário real (Auth + tabela usuarios), loga de verdade e devolve um client autenticado com o token dele. */
async function criarUsuarioEfemero({ perfil, idLoja, prefixo }) {
    const email = MARCA + prefixo + '@teste.local';
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({ email, password: SENHA_TESTE, email_confirm: true });
    if (authErr) throw authErr;

    const { data: usuario, error: usrErr } = await admin
        .from('usuarios')
        .insert({ nome: MARCA + prefixo, email, perfil, id_loja: idLoja, status: 'Ativo' })
        .select('id_usuario')
        .single();
    if (usrErr) { await admin.auth.admin.deleteUser(authData.user.id); throw usrErr; }

    const loginClient = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sess, error: signErr } = await loginClient.auth.signInWithPassword({ email, password: SENHA_TESTE });
    if (signErr) throw signErr;

    const authedClient = createClient(URL, ANON_KEY, {
        global: { headers: { Authorization: 'Bearer ' + sess.session.access_token } },
        auth: { persistSession: false, autoRefreshToken: false }
    });

    return {
        email,
        authId: authData.user.id,
        usuarioId: usuario.id_usuario,
        client: authedClient,
        async cleanup() {
            await admin.from('usuarios').delete().eq('id_usuario', usuario.id_usuario);
            await admin.auth.admin.deleteUser(authData.user.id);
        }
    };
}

module.exports = { admin, URL, ANON_KEY, MARCA, SENHA_TESTE, assert, criarUsuarioEfemero };
