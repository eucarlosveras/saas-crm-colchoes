// criar-loja — cadastro self-service de uma loja nova (item #03 do plano de
// comercialização). ÚNICA Edge Function do projeto que roda SEM authGuard
// de propósito: quem chama ainda não tem conta nenhuma, então não existe
// sessão pra validar. Isso é seguro porque a function só faz UMA coisa —
// criar uma loja + um usuário Gerente vinculado a ela — e nunca lê ou toca
// em nenhum dado que já exista. Ainda assim passa pelo gateway do Supabase
// com a chave anon (verify_jwt continua ligado; é isso que barra requisição
// totalmente aleatória sem apikey nenhuma).
//
// Quem se cadastra por aqui SEMPRE vira perfil 'Gerente' da loja nova —
// nunca 'Administrador' (reservado ao operador da plataforma, nunca
// atribuído por um fluxo público).
import { getAdminClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    // Nunca logar o corpo bruto: contém a senha em texto puro.
    console.log('Cadastro self-service solicitado para loja:', body.nomeLoja, '- e-mail:', body.email);

    // Honeypot: campo escondido no form que só um bot preenche. Se veio
    // preenchido, finge sucesso (não dá dica de que foi filtrado) e não
    // grava nada.
    if (body.website) {
      return json({ success: true });
    }

    const nomeLoja = String(body.nomeLoja || '').trim();
    const nomeResponsavel = String(body.nomeResponsavel || '').trim();
    const email = String(body.email || '').trim();
    const senha = String(body.senha || '');
    const aceiteTermos = body.aceiteTermos === true;

    if (!nomeLoja || !nomeResponsavel || !email || !senha) {
      return json({ error: 'Preencha todos os campos.' }, 400);
    }
    if (!EMAIL_RE.test(email)) {
      return json({ error: 'E-mail inválido.' }, 400);
    }
    if (senha.length < 8) {
      return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    }
    if (!aceiteTermos) {
      return json({ error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' }, 400);
    }

    const admin = getAdminClient();

    // 1) Cria o usuário no Supabase Auth. email_confirm:false → dispara o
    // e-mail de confirmação nativo do Supabase (Auth > Email Templates). O
    // destino do link de confirmação é o "Site URL" configurado em Auth >
    // URL Configuration no painel — confirme que aponta pro domínio real
    // (idealmente /app/) antes de divulgar o cadastro. O aviso de boas-vindas
    // do primeiro acesso não depende dessa URL (ver localStorage em
    // src/cadastro.js), só a página de pouso depois de confirmar depende.
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: false,
      user_metadata: { nome: nomeResponsavel },
    });

    if (authError) {
      // E-mail já cadastrado é o erro mais comum aqui — devolve mensagem clara.
      const msg = /already registered|already exists/i.test(authError.message || '')
        ? 'Este e-mail já está cadastrado.'
        : 'Não foi possível criar a conta: ' + authError.message;
      return json({ error: msg }, 400);
    }

    // 2) Cria a loja.
    const { data: novaLoja, error: lojaError } = await admin
      .from('lojas')
      .insert([{ nome_loja: nomeLoja }])
      .select('id_loja')
      .single();

    if (lojaError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      throw lojaError;
    }

    // 3) Cria o usuário da aplicação (perfil sempre 'Gerente' — nunca
    // 'Administrador' num fluxo público).
    const { error: usuarioError } = await admin.from('usuarios').upsert(
      {
        id_usuario: authData.user.id,
        nome: nomeResponsavel,
        email,
        id_loja: novaLoja.id_loja,
        perfil: 'Gerente',
        status: 'Ativo',
      },
      { onConflict: 'id_usuario' }
    );

    if (usuarioError) {
      // Desfaz a loja e o usuário do Auth — não deixa lixo órfão pra trás.
      await admin.from('lojas').delete().eq('id_loja', novaLoja.id_loja);
      await admin.auth.admin.deleteUser(authData.user.id);
      throw usuarioError;
    }

    return json({ success: true });
  } catch (err) {
    console.error('Erro em criar-loja:', err);
    return json({ error: err.message || 'Erro ao criar conta.' }, 400);
  }
});
