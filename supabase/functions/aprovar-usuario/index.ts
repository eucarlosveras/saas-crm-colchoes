// aprovar-usuario — aprova ou rejeita uma solicitação de acesso pendente.
// Dois níveis, cada um só mexe no que é seu:
//   - Gerente aprova/rejeita Vendedor PENDENTE da PRÓPRIA loja.
//   - Administrador aprova/rejeita Gerente PENDENTE (qualquer loja — é o
//     único nível acima do Gerente). Nunca mexe em Vendedor — a aprovação
//     de Vendedor é exclusiva do Gerente da loja dele.
// Segue o checklist de docs/AUTORIZACAO.md: authGuard + checagem explícita
// de permissão, e-mail case-insensitive.
import { getAdminClient } from '../_shared/supabase-client.ts';
import { authGuard } from '../_shared/auth-guard.ts';
import { enviarEmail } from '../_shared/enviar-email.ts';

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
    console.log('Aprovação solicitada por', auth.user.email, '-> alvo:', body.idUsuarioAlvo, 'decisao:', body.decisao);

    const { idUsuarioAlvo, decisao, motivo } = body;
    if (!idUsuarioAlvo || !['aprovar', 'rejeitar'].includes(decisao)) {
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

    const isAdmin = chamador.perfil === 'Administrador' || chamador.perfil === 'Admin';
    const isGerente = chamador.perfil === 'Gerente';
    if (!isAdmin && !isGerente) {
      return json({ error: 'Sem permissão para aprovar/rejeitar usuários.' }, 403);
    }

    // Não pode aprovar a si mesmo (regra explícita, ainda que hoje nenhum
    // dos dois papéis se auto-aprovaria pelas checagens abaixo mesmo assim).
    if (idUsuarioAlvo === chamador.id_usuario) {
      return json({ error: 'Você não pode aprovar a si mesmo.' }, 403);
    }

    const { data: alvo, error: erroAlvo } = await admin
      .from('usuarios')
      .select('id_usuario, nome, email, perfil, status, id_loja')
      .eq('id_usuario', idUsuarioAlvo)
      .single();

    if (erroAlvo || !alvo) return json({ error: 'Usuário não encontrado.' }, 404);
    if (alvo.status !== 'Pendente') {
      return json({ error: 'Esta solicitação já foi decidida.' }, 400);
    }

    if (isGerente) {
      // Gerente só mexe em Vendedor da própria loja.
      if (alvo.perfil !== 'Vendedor') {
        return json({ error: 'Gerente só pode aprovar/rejeitar vendedores.' }, 403);
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
        return json({ error: 'Você só pode decidir sobre vendedores da sua própria loja.' }, 403);
      }
    } else {
      // Administrador só mexe em Gerente — vendedor é decisão exclusiva do Gerente.
      if (alvo.perfil !== 'Gerente') {
        return json({ error: 'Administrador só aprova/rejeita gerentes. Vendedores são decisão do gerente da loja.' }, 403);
      }
    }

    const novoStatus = decisao === 'aprovar' ? 'Ativo' : 'Rejeitado';
    const { error: erroUpdate } = await admin
      .from('usuarios')
      .update({
        status: novoStatus,
        motivo_rejeicao: decisao === 'rejeitar' ? (motivo || null) : null,
      })
      .eq('id_usuario', idUsuarioAlvo);

    if (erroUpdate) throw erroUpdate;

    // Notifica quem foi decidido — in-app (tela de login não tem canal
    // in-app óbvio pra quem não conseguiu entrar ainda, então o texto da
    // notificação existe pra quando ele tentar logar depois de aprovado
    // vir preenchido; e-mail é o canal que realmente alcança quem ainda
    // está de fora).
    const textoNotif = decisao === 'aprovar'
      ? 'Seu acesso foi aprovado! Você já pode entrar no sistema.'
      : `Sua solicitação de acesso foi rejeitada.${motivo ? ' Motivo: ' + motivo : ''}`;

    // id_referencia NÃO entra aqui: é foreign key pra orcamentos nesta
    // tabela (fk_notificacao_orcamento) — um id_usuario ali viola a
    // constraint e falha silenciosamente sem checar o erro do insert.
    const { error: erroNotif } = await admin.from('notificacoes').insert([{
      id_usuario: alvo.id_usuario,
      texto: textoNotif,
      tipo: decisao === 'aprovar' ? 'acesso_aprovado' : 'acesso_rejeitado',
      lida: false,
    }]);
    if (erroNotif) console.error('Falha ao gravar notificação da decisão:', erroNotif.message);

    await enviarEmail({
      to: alvo.email,
      subject: decisao === 'aprovar' ? 'Seu acesso foi aprovado' : 'Sua solicitação de acesso',
      html: `<p>Olá, ${alvo.nome}.</p><p>${textoNotif}</p>`,
    });

    return json({ success: true });
  } catch (err) {
    console.error('Erro em aprovar-usuario:', err);
    return json({ error: err.message || 'Erro ao processar a decisão.' }, 400);
  }
});
