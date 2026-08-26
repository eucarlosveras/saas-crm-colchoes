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

    // 2) Quem pode criar usuário: Administrador (qualquer loja) ou Gerente
    //    (só dentro da própria loja — checado mais abaixo, depois de saber
    //    pra qual `loja` o corpo da requisição está pedindo). Gerente nunca
    //    pode criar outro Administrador — esse perfil é exclusivo do
    //    operador da plataforma, nunca atribuído por um fluxo de loja.
    // auth.getUser() sempre devolve o e-mail em minúsculas; a tabela usuarios não
    // normaliza o e-mail ao salvar, então a comparação precisa ser case-insensitive
    // (ilike, com escape de % e _ para não virarem curinga por acidente).
    const emailChamadorEscapado = auth.user.email.replace(/[%_\\]/g, (m) => '\\' + m);
    const guardClient = getAdminClient();
    const { data: chamador, error: chamadorError } = await guardClient
      .from('usuarios')
      .select('id_usuario, perfil, status, id_loja')
      .ilike('email', emailChamadorEscapado)
      .single();

    if (chamadorError || !chamador || chamador.status !== 'Ativo') {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado ou inativo.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const isAdmin = chamador.perfil === 'Administrador' || chamador.perfil === 'Admin';
    const isGerente = chamador.perfil === 'Gerente';

    if (!isAdmin && !isGerente) {
      return new Response(JSON.stringify({ error: 'Sem permissão para criar usuários.' }), {
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

    if (!isAdmin) {
      // Gerente nunca cria Administrador.
      if (perfil === 'Administrador' || perfil === 'Admin') {
        return new Response(JSON.stringify({ error: 'Gerente não pode criar um usuário Administrador.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }
      // Gerente só cria dentro de uma loja à qual está vinculado (própria
      // loja ou, se multiloja, alguma em usuario_lojas) — nunca em loja alheia.
      let autorizadoNaLoja = chamador.id_loja === loja;
      if (!autorizadoNaLoja) {
        const { data: vinculo } = await guardClient
          .from('usuario_lojas')
          .select('id_loja')
          .eq('id_usuario', chamador.id_usuario)
          .eq('id_loja', loja)
          .maybeSingle();
        autorizadoNaLoja = !!vinculo;
      }
      if (!autorizadoNaLoja) {
        return new Response(JSON.stringify({ error: 'Você só pode criar usuários na(s) sua(s) própria(s) loja(s).' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }
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
