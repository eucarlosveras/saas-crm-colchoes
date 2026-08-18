import { createClient } from 'jsr:@supabase/supabase-js@2';
import { authGuard } from '../_shared/auth-guard.ts';
import { getAdminClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1) Só passa quem tiver um token de sessão válido (usuário realmente logado).
    const auth = await authGuard(req);
    if (auth.error) {
      return new Response(JSON.stringify({ error: auth.error }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: auth.status,
      });
    }

    // 2) Só Administrador pode criar novos usuários — authGuard garante "logado",
    //    não garante "é admin", então essa checagem é feita à parte.
    // auth.getUser() sempre devolve o e-mail em minúsculas; a tabela usuarios não
    // normaliza o e-mail ao salvar, então a comparação precisa ser case-insensitive
    // (ilike, com escape de % e _ para não virarem curinga por acidente).
    const emailChamadorEscapado = auth.user.email.replace(/[%_\\]/g, (m) => '\\' + m);
    const guardClient = getAdminClient();
    const { data: chamador, error: chamadorError } = await guardClient
      .from('usuarios')
      .select('perfil, status')
      .ilike('email', emailChamadorEscapado)
      .single();

    if (chamadorError || !chamador || chamador.perfil !== 'Administrador' || chamador.status !== 'Ativo') {
      return new Response(JSON.stringify({ error: 'Apenas administradores ativos podem criar usuários.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const body = await req.json();
    // Nunca logar o corpo bruto: ele contém a senha em texto puro.
    console.log('Criação de usuário solicitada por', auth.user.email, '-> novo e-mail:', body.email);

    const { nome, email, loja, perfil, status, senha } = body;
    if (!nome || !email || !senha || !loja || !perfil || !status) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios ausentes.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: nome }
    });

    if (authError) throw authError;

    const { error: dbError } = await adminClient
      .from('usuarios')
      .upsert(
        {
          id_usuario: authData.user.id,
          nome: nome,
          email: email,
          id_loja: loja,
          perfil: perfil,
          status: status
        },
        { onConflict: 'id_usuario' }
      );

    if (dbError) {
      console.error("Erro do Banco:", dbError);
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw dbError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
