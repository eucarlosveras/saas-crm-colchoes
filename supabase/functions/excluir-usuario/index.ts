// excluir-usuario — exclusão de verdade (usuarios + auth.users juntos).
//
// Bug que essa function corrige: a tela "Gerenciar Usuários" excluía só a
// linha de `usuarios` via delete direto do cliente (RLS-scoped) — o login
// em auth.users NUNCA saía (só service role consegue apagar de lá, e o
// cliente nunca tem essa chave). Resultado: usuário some da tela, mas o
// e-mail fica pra sempre "ocupado" no Auth, bloqueando qualquer cadastro
// novo com ele — sem nenhum jeito de perceber isso pela interface.
//
// Segue o checklist de docs/AUTORIZACAO.md: authGuard + checagem explícita
// de permissão, e-mail case-insensitive.
import { authGuard } from '../_shared/auth-guard.ts';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await authGuard(req);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const body = await req.json();
    console.log('Exclusão de usuário solicitada por', auth.user.email, '-> alvo:', body.idUsuarioAlvo);

    const { idUsuarioAlvo } = body;
    if (!idUsuarioAlvo) return json({ error: 'idUsuarioAlvo obrigatório.' }, 400);

    const admin = getAdminClient();
    const emailChamadorEscapado = auth.user.email.replace(/[%_\\]/g, (m: string) => '\\' + m);

    const { data: chamador, error: erroChamador } = await admin
      .from('usuarios')
      .select('id_usuario, perfil, status, id_loja')
      .ilike('email', emailChamadorEscapado)
      .single();

    if (erroChamador || !chamador || chamador.status !== 'Ativo') {
      return json({ error: 'Usuário não encontrado ou inativo.' }, 403);
    }

    const isAdmin = chamador.perfil === 'Administrador' || chamador.perfil === 'Admin';
    const isGerente = chamador.perfil === 'Gerente';
    if (!isAdmin && !isGerente) {
      return json({ error: 'Sem permissão para excluir usuários.' }, 403);
    }

    if (idUsuarioAlvo === chamador.id_usuario) {
      return json({ error: 'Você não pode excluir a própria conta por aqui.' }, 403);
    }

    const { data: alvo, error: erroAlvo } = await admin
      .from('usuarios')
      .select('id_usuario, perfil, id_loja')
      .eq('id_usuario', idUsuarioAlvo)
      .single();
    if (erroAlvo || !alvo) return json({ error: 'Usuário não encontrado.' }, 404);

    if (!isAdmin) {
      // Gerente só exclui dentro da própria loja, e nunca um Administrador.
      if (alvo.perfil === 'Administrador' || alvo.perfil === 'Admin') {
        return json({ error: 'Gerente não pode excluir um Administrador.' }, 403);
      }
      let autorizadoNaLoja = chamador.id_loja === alvo.id_loja;
      if (!autorizadoNaLoja) {
        const { data: vinculo } = await admin
          .from('usuario_lojas')
          .select('id_loja')
          .eq('id_usuario', chamador.id_usuario)
          .eq('id_loja', alvo.id_loja)
          .maybeSingle();
        autorizadoNaLoja = !!vinculo;
      }
      if (!autorizadoNaLoja) {
        return json({ error: 'Você só pode excluir usuários da(s) sua(s) própria(s) loja(s).' }, 403);
      }
    }

    // Mesma regra que já existia no front-end (não excluir quem tem
    // orçamento) — reforçada aqui porque essa function passa a ser o
    // caminho de verdade, o client-side já não é mais autoritativo.
    const { count, error: erroContagem } = await admin
      .from('orcamentos')
      .select('*', { count: 'exact', head: true })
      .eq('id_usuario', idUsuarioAlvo);
    if (erroContagem) throw erroContagem;
    if (count && count > 0) {
      return json({ error: `Não é possível excluir: usuário possui ${count} orçamento(s). Inative-o em vez disso.` }, 400);
    }

    const { error: erroDeleteUsuario } = await admin.from('usuarios').delete().eq('id_usuario', idUsuarioAlvo);
    if (erroDeleteUsuario) throw erroDeleteUsuario;

    // O passo que faltava: sem isso, o e-mail fica preso no Auth pra sempre.
    const { error: erroDeleteAuth } = await admin.auth.admin.deleteUser(idUsuarioAlvo);
    if (erroDeleteAuth) {
      // A linha de usuarios já foi embora — loga mas não falha a operação
      // toda por causa disso (o usuário já não tem mais acesso ao app).
      console.error('Falha ao apagar do Auth (usuarios já foi removido):', erroDeleteAuth.message);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Erro em excluir-usuario:', err);
    return json({ error: err.message || 'Erro ao excluir usuário.' }, 400);
  }
});
