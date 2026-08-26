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
// atribuído por um fluxo público). O Gerente fica status='Pendente' até o
// Administrador aprovar (ver Edge Function aprovar-usuario) — só depois
// disso consegue logar (checkSession()/handleLogin() já bloqueiam qualquer
// status != 'Ativo').
import { getAdminClient } from '../_shared/supabase-client.ts';
import { enviarEmail } from '../_shared/enviar-email.ts';

const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I — evita ambiguidade visual

function gerarCodigoLoja(): string {
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)];
  return codigo;
}

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
    const telefone = String(body.telefone || '').trim();
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

    // 2) Cria a loja, com um código único pra vendedores se vincularem depois.
    let novaLoja: { id_loja: string } | null = null;
    let lojaError: unknown = null;
    for (let tentativa = 0; tentativa < 5 && !novaLoja; tentativa++) {
      const resultado = await admin
        .from('lojas')
        .insert([{ nome_loja: nomeLoja, codigo: gerarCodigoLoja(), status: 'Ativo' }])
        .select('id_loja')
        .single();
      if (!resultado.error) { novaLoja = resultado.data; break; }
      lojaError = resultado.error;
      // 23505 = colisão de código (raríssima, 6 chars em ~33^6 combinações) — tenta de novo com outro.
      if ((resultado.error as { code?: string })?.code !== '23505') break;
    }
    if (!novaLoja) {
      await admin.auth.admin.deleteUser(authData.user.id);
      throw lojaError;
    }

    // 3) Cria o usuário da aplicação (perfil sempre 'Gerente' — nunca
    // 'Administrador' num fluxo público). Status 'Pendente': só entra depois
    // que o Administrador aprovar.
    const { error: usuarioError } = await admin.from('usuarios').upsert(
      {
        id_usuario: authData.user.id,
        nome: nomeResponsavel,
        email,
        telefone: telefone || null,
        id_loja: novaLoja.id_loja,
        perfil: 'Gerente',
        status: 'Pendente',
      },
      { onConflict: 'id_usuario' }
    );

    if (usuarioError) {
      // Desfaz a loja e o usuário do Auth — não deixa lixo órfão pra trás.
      await admin.from('lojas').delete().eq('id_loja', novaLoja.id_loja);
      await admin.auth.admin.deleteUser(authData.user.id);
      throw usuarioError;
    }

    // 3.5) Notifica o(s) Administrador(es) da plataforma (in-app + e-mail
    // best-effort) — só ele aprova Gerente.
    const { data: administradores } = await admin
      .from('usuarios')
      .select('id_usuario, email')
      .in('perfil', ['Administrador', 'Admin'])
      .eq('status', 'Ativo');

    for (const adm of administradores || []) {
      // id_referencia NÃO entra aqui: é foreign key pra orcamentos nesta
      // tabela (fk_notificacao_orcamento) — um id_usuario ali viola a
      // constraint e falha silenciosamente sem checar o erro do insert.
      const { error: erroNotif } = await admin.from('notificacoes').insert([{
        id_usuario: adm.id_usuario,
        texto: `${nomeResponsavel} cadastrou a loja "${nomeLoja}" e aguarda sua aprovação como Gerente.`,
        tipo: 'gerente_pendente',
        lida: false,
      }]);
      if (erroNotif) console.error('Falha ao gravar notificação pro administrador:', erroNotif.message);
      await enviarEmail({
        to: adm.email,
        subject: `Nova loja aguardando aprovação — ${nomeLoja}`,
        html: `<p><strong>${nomeResponsavel}</strong> (${email}) cadastrou a loja <strong>${nomeLoja}</strong> e aguarda sua aprovação como Gerente.</p><p>Acesse Admin &gt; Usuários no CV CRM pra revisar.</p>`,
      });
    }

    // 4) Dispara o e-mail de confirmação explicitamente. createUser() com
    // email_confirm:false NÃO garante o envio de forma confiável — é uma
    // chamada administrativa (efeito colateral, não o mecanismo pensado pra
    // isso); resend() é a chamada feita especificamente pra enviar/reenviar
    // esse e-mail, e é a que funciona de forma consistente. Best-effort: a
    // conta já foi criada com sucesso, uma falha aqui não desfaz o cadastro
    // (o usuário sempre pode pedir reenvio pela tela de confirmação).
    const { error: resendError } = await admin.auth.resend({ type: 'signup', email });
    if (resendError) {
      console.error('Falha ao disparar e-mail de confirmação (conta já criada):', resendError.message);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Erro em criar-loja:', err);
    return json({ error: err.message || 'Erro ao criar conta.' }, 400);
  }
});
