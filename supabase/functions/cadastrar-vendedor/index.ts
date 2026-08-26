// cadastrar-vendedor — cadastro self-service de Vendedor, vinculado a uma
// loja JÁ EXISTENTE via código (fornecido pelo Gerente daquela loja). Não
// cria loja nenhuma — só criar-loja (fluxo do Gerente) faz isso.
//
// SEM authGuard, igual criar-loja: quem chama ainda não tem conta. Seguro
// pelo mesmo motivo — só cria um Vendedor 'Pendente', nunca lê/altera dado
// de terceiro, e o código da loja é o único jeito de vincular (não dá pra
// escolher a loja livremente).
import { getAdminClient } from '../_shared/supabase-client.ts';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    console.log('Cadastro de vendedor solicitado, código:', body.codigoLoja, '- e-mail:', body.email);

    // Honeypot — mesmo padrão de criar-loja.
    if (body.website) return json({ success: true });

    const nome = String(body.nome || '').trim();
    const email = String(body.email || '').trim();
    const senha = String(body.senha || '');
    const telefone = String(body.telefone || '').trim();
    const codigoLoja = String(body.codigoLoja || '').trim().toUpperCase();
    const aceiteTermos = body.aceiteTermos === true;

    if (!nome || !email || !senha || !codigoLoja) {
      return json({ error: 'Preencha todos os campos.' }, 400);
    }
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido.' }, 400);
    if (senha.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    if (!aceiteTermos) return json({ error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.' }, 400);

    const admin = getAdminClient();

    // 1) Valida o código: precisa existir E a loja estar ativa.
    const { data: loja, error: lojaError } = await admin
      .from('lojas')
      .select('id_loja, nome_loja, status')
      .eq('codigo', codigoLoja)
      .maybeSingle();

    if (lojaError) throw lojaError;
    if (!loja || loja.status !== 'Ativo') {
      return json({ error: 'Código de loja inválido. Confira com seu gerente e tente de novo.' }, 400);
    }

    // 2) Cria o usuário no Auth (mesmo fluxo de confirmação por e-mail de criar-loja).
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: false,
      user_metadata: { nome },
    });
    if (authError) {
      const msg = /already registered|already exists/i.test(authError.message || '')
        ? 'Este e-mail já está cadastrado.'
        : 'Não foi possível criar a conta: ' + authError.message;
      return json({ error: msg }, 400);
    }

    // 3) Cria o registro em `usuarios` como Vendedor PENDENTE (aguarda
    // aprovação do Gerente da loja — nunca fica Ativo direto).
    const { error: usuarioError } = await admin.from('usuarios').upsert(
      {
        id_usuario: authData.user.id,
        nome,
        email,
        telefone: telefone || null,
        id_loja: loja.id_loja,
        perfil: 'Vendedor',
        status: 'Pendente',
      },
      { onConflict: 'id_usuario' }
    );
    if (usuarioError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      throw usuarioError;
    }

    // 4) Dispara o e-mail de confirmação explicitamente (ver mesmo
    // comentário em criar-loja — createUser sozinho não garante o envio).
    const { error: resendError } = await admin.auth.resend({ type: 'signup', email });
    if (resendError) console.error('Falha ao disparar e-mail de confirmação:', resendError.message);

    // 5) Notifica o(s) Gerente(s) da loja (in-app, tempo real — já existe a
    // infra) e por e-mail (best-effort, sandbox só entrega pro dono da
    // conta Resend até haver domínio verificado).
    const { data: gerentes } = await admin
      .from('usuarios')
      .select('id_usuario, email')
      .eq('id_loja', loja.id_loja)
      .eq('perfil', 'Gerente')
      .eq('status', 'Ativo');

    for (const gerente of gerentes || []) {
      // id_referencia NÃO entra aqui: é uma foreign key pra orcamentos
      // nesta tabela (fk_notificacao_orcamento) — colocar um id_usuario ali
      // viola a constraint e falha (silenciosamente, se ninguém checar o
      // erro do insert — por isso o log abaixo).
      const { error: erroNotif } = await admin.from('notificacoes').insert([{
        id_usuario: gerente.id_usuario,
        texto: `${nome} pediu acesso como vendedor(a) da sua loja. Revise em Gerenciamento de Acessos.`,
        tipo: 'vendedor_pendente',
        lida: false,
      }]);
      if (erroNotif) console.error('Falha ao gravar notificação pro gerente:', erroNotif.message);
      await enviarEmail({
        to: gerente.email,
        subject: `Nova solicitação de acesso — ${nome}`,
        html: `<p><strong>${nome}</strong> (${email}) pediu acesso como vendedor(a) da loja <strong>${loja.nome_loja}</strong>.</p><p>Acesse "Gerenciamento de Acessos" no CV CRM pra aprovar ou rejeitar.</p>`,
      });
    }

    return json({ success: true });
  } catch (err) {
    console.error('Erro em cadastrar-vendedor:', err);
    return json({ error: err.message || 'Erro ao criar conta.' }, 400);
  }
});
