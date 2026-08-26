// alterar-status-vendedor — poder do Gerente sobre a própria loja: inativar
// ou reativar um Vendedor. É a ÚNICA ação de gestão de usuário que o Gerente
// tem fora de aprovar/rejeitar acesso (aprovar-usuario) — a tela completa de
// Administração (criar, editar perfil/loja, excluir) é exclusiva do
// Administrador; o front-end já não mostra mais esse menu pro Gerente, e
// esta function reforça a mesma regra do lado do servidor.
//
// Por que precisa de function (e não dá pra fazer com update direto do
// client): a policy "usuarios_update_admin" só libera UPDATE pra
// current_is_admin() — de propósito, pra Gerente não poder alterar perfil,
// loja ou qualquer outro campo sensível de ninguém. Essa function usa a
// service_role só pra esse UPDATE pontual, depois de validar a autorização
// aqui, igual excluir-usuario/aprovar-usuario já fazem.
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
    console.log('Alteração de status solicitada por', auth.user.email, '-> alvo:', body.idUsuarioAlvo, 'novoStatus:', body.novoStatus);

    const { idUsuarioAlvo, novoStatus } = body;
    if (!idUsuarioAlvo || !['Ativo', 'Inativo'].includes(novoStatus)) {
      return json({ error: 'Parâmetros inválidos.' }, 400);
    }

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

    // Só Gerente usa este caminho — Administrador já tem UPDATE direto
    // liberado por RLS na tela de Administração.
    if (chamador.perfil !== 'Gerente') {
      return json({ error: 'Sem permissão para alterar status de usuários.' }, 403);
    }

    if (idUsuarioAlvo === chamador.id_usuario) {
      return json({ error: 'Você não pode alterar o próprio status por aqui.' }, 403);
    }

    const { data: alvo, error: erroAlvo } = await admin
      .from('usuarios')
      .select('id_usuario, perfil, status, id_loja')
      .eq('id_usuario', idUsuarioAlvo)
      .single();
    if (erroAlvo || !alvo) return json({ error: 'Usuário não encontrado.' }, 404);

    // Gerente só mexe em Vendedor da própria loja.
    if (alvo.perfil !== 'Vendedor') {
      return json({ error: 'Gerente só pode alterar status de vendedores.' }, 403);
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
      return json({ error: 'Você só pode alterar status de vendedores da sua própria loja.' }, 403);
    }

    // Só faz sentido alternar entre Ativo/Inativo — Pendente/Rejeitado passam
    // pelo fluxo de aprovação (aprovar-usuario), não por aqui.
    if (!['Ativo', 'Inativo'].includes(alvo.status)) {
      return json({ error: 'Este usuário ainda não teve o acesso aprovado.' }, 400);
    }
    if (alvo.status === novoStatus) {
      return json({ error: `Usuário já está ${novoStatus}.` }, 400);
    }

    const { error: erroUpdate } = await admin
      .from('usuarios')
      .update({ status: novoStatus })
      .eq('id_usuario', idUsuarioAlvo);
    if (erroUpdate) throw erroUpdate;

    if (novoStatus === 'Inativo') {
      // id_referencia NÃO entra aqui: é foreign key pra orcamentos nesta
      // tabela (fk_notificacao_orcamento) — um id_usuario ali viola a
      // constraint e falha silenciosamente sem checar o erro do insert.
      const { error: erroNotif } = await admin.from('notificacoes').insert([{
        id_usuario: alvo.id_usuario,
        texto: 'Seu acesso foi inativado pelo gerente da loja.',
        tipo: 'acesso_inativado',
        lida: false,
      }]);
      if (erroNotif) console.error('Falha ao gravar notificação de inativação:', erroNotif.message);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Erro em alterar-status-vendedor:', err);
    return json({ error: err.message || 'Erro ao alterar status.' }, 400);
  }
});
