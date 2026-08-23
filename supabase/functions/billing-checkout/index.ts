// billing-checkout — cria (ou reaproveita) o cliente e a assinatura no Asaas
// pra uma loja, e devolve a URL de pagamento (invoiceUrl) pra redirecionar
// o Gerente. Segue o checklist de docs/AUTORIZACAO.md: authGuard primeiro,
// depois checagem explícita de permissão (Gerente da própria loja ou
// Administrador) — "logado" não é "autorizado".
//
// ATENÇÃO: escrito contra a API v3 documentada do Asaas (asaas.com/api-docs).
// Não testado contra uma conta real — validar o shape exato da resposta
// (em especial `invoiceUrl` do primeiro pagamento) antes de ir pra produção.
import { authGuard } from '../_shared/auth-guard.ts';
import { getAdminClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLANOS: Record<string, number> = {
  essencial: 97,
  profissional: 247,
  empresarial: 597,
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
    // 1) Logado?
    const auth = await authGuard(req);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const body = await req.json();
    // Nunca logar o corpo bruto: pode conter cpfCnpj.
    console.log('Checkout de assinatura solicitado por', auth.user.email, '-> loja:', body.id_loja, 'plano:', body.plano);

    const { id_loja, plano, nome, email, cpfCnpj } = body;
    if (!id_loja || !plano || !PLANOS[plano]) {
      return json({ error: 'Plano inválido ou id_loja ausente.' }, 400);
    }
    if (!nome || !email || !cpfCnpj) {
      return json({ error: 'Nome, e-mail e CPF/CNPJ são obrigatórios para gerar a cobrança.' }, 400);
    }

    // 2) Tem permissão? — precisa ser Gerente vinculado a ESSA loja, ou Administrador.
    // Comparação de e-mail sempre case-insensitive (ver docs/AUTORIZACAO.md).
    const emailEscapado = auth.user.email.replace(/[%_\\]/g, (m: string) => '\\' + m);
    const admin = getAdminClient();

    const { data: chamador, error: erroChamador } = await admin
      .from('usuarios')
      .select('id_usuario, perfil, status, id_loja')
      .ilike('email', emailEscapado)
      .single();

    if (erroChamador || !chamador || chamador.status !== 'Ativo') {
      return json({ error: 'Usuário não encontrado ou inativo.' }, 403);
    }

    const isAdmin = chamador.perfil === 'Administrador' || chamador.perfil === 'Admin';
    let autorizado = isAdmin;
    if (!autorizado && chamador.perfil === 'Gerente') {
      if (chamador.id_loja === id_loja) {
        autorizado = true;
      } else {
        const { data: vinculo } = await admin
          .from('usuario_lojas')
          .select('id_loja')
          .eq('id_usuario', chamador.id_usuario)
          .eq('id_loja', id_loja)
          .maybeSingle();
        autorizado = !!vinculo;
      }
    }
    if (!autorizado) {
      return json({ error: 'Sem permissão para gerenciar a assinatura desta loja.' }, 403);
    }

    const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
    const ASAAS_BASE_URL = Deno.env.get('ASAAS_BASE_URL') || 'https://api.asaas.com/v3';
    if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada.');

    const asaasHeaders = {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
    };

    // 3) Assinatura já existe pra essa loja? Reaproveita o gateway_customer_id
    // se já tiver sido criado antes (evita duplicar cliente no Asaas).
    const { data: subExistente } = await admin
      .from('subscriptions')
      .select('id, gateway_customer_id')
      .eq('id_loja', id_loja)
      .maybeSingle();

    let customerId = subExistente?.gateway_customer_id;

    if (!customerId) {
      const resCustomer = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: 'POST',
        headers: asaasHeaders,
        body: JSON.stringify({ name: nome, email, cpfCnpj, externalReference: id_loja }),
      });
      const customer = await resCustomer.json();
      if (!resCustomer.ok) throw new Error('Erro ao criar cliente no Asaas: ' + JSON.stringify(customer));
      customerId = customer.id;
    }

    // 4) Cria a assinatura recorrente. billingType UNDEFINED deixa o cliente
    // escolher PIX/boleto/cartão na página de cobrança do Asaas.
    const hoje = new Date().toISOString().slice(0, 10);
    const resSub = await fetch(`${ASAAS_BASE_URL}/subscriptions`, {
      method: 'POST',
      headers: asaasHeaders,
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED',
        cycle: 'MONTHLY',
        value: PLANOS[plano],
        nextDueDate: hoje,
        description: `Assinatura CV CRM — plano ${plano}`,
        externalReference: id_loja,
      }),
    });
    const assinaturaAsaas = await resSub.json();
    if (!resSub.ok) throw new Error('Erro ao criar assinatura no Asaas: ' + JSON.stringify(assinaturaAsaas));

    // 5) Busca o primeiro pagamento gerado pra pegar o link de cobrança.
    const resPagamentos = await fetch(
      `${ASAAS_BASE_URL}/payments?subscription=${assinaturaAsaas.id}&limit=1`,
      { headers: asaasHeaders }
    );
    const pagamentos = await resPagamentos.json();
    const invoiceUrl = pagamentos?.data?.[0]?.invoiceUrl || null;

    // 6) Grava/atualiza subscriptions (upsert por id_loja).
    const { error: erroUpsert } = await admin.from('subscriptions').upsert(
      {
        id_loja,
        plano,
        status: 'trialing', // vira 'active' quando o billing-webhook confirmar o 1º pagamento
        gateway_customer_id: customerId,
        gateway_sub_id: assinaturaAsaas.id,
      },
      { onConflict: 'id_loja' }
    );
    if (erroUpsert) throw erroUpsert;

    return json({ success: true, checkoutUrl: invoiceUrl, subscriptionId: assinaturaAsaas.id });
  } catch (err) {
    console.error('Erro em billing-checkout:', err);
    return json({ error: err.message }, 400);
  }
});
