// billing-webhook — recebe eventos de pagamento do Asaas e atualiza
// subscriptions.status. Chamado pelo Asaas, não por um usuário logado do
// app — não existe Bearer token de sessão aqui, então authGuard não se
// aplica. A autenticação é o token de webhook configurado no painel Asaas,
// devolvido no header `asaas-access-token` a cada chamada (mesmo princípio
// de "secret compartilhado" usado no webhook do WhatsApp).
//
// ATENÇÃO: escrito contra o formato de webhook documentado do Asaas
// (asaas.com/api-docs — seção Webhooks). Os nomes de evento e o shape exato
// do payload precisam ser confirmados contra uma conta real antes de ir pra
// produção — não há como testar isso sem uma conta Asaas ativa.
import { getAdminClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

// Eventos que confirmam pagamento (loja volta a ficar ativa).
const EVENTOS_ATIVA = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
// Eventos que indicam inadimplência (loja é bloqueada pelo RLS no próximo acesso).
const EVENTOS_ATRASADA = new Set(['PAYMENT_OVERDUE']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
    if (!WEBHOOK_TOKEN) throw new Error('ASAAS_WEBHOOK_TOKEN não configurada.');

    const tokenRecebido = req.headers.get('asaas-access-token');
    if (!tokenRecebido || tokenRecebido !== WEBHOOK_TOKEN) {
      // Não vaza detalhe nenhum sobre por que falhou.
      return json({ error: 'unauthorized' }, 401);
    }

    const body = await req.json();
    // Corpo de webhook de pagamento não tem dado sensível de pessoa física
    // (é o Asaas notificando o próprio sistema), mas evita logar tudo mesmo assim.
    const evento = body?.event;
    const pagamento = body?.payment;
    console.log('billing-webhook recebido:', evento, '- subscription:', pagamento?.subscription);

    if (!evento || !pagamento?.subscription) {
      // Evento que não é de pagamento de assinatura (ex.: cobrança avulsa) — ignora.
      return json({ received: true, ignored: true });
    }

    const admin = getAdminClient();

    let novoStatus: string | null = null;
    if (EVENTOS_ATIVA.has(evento)) novoStatus = 'active';
    else if (EVENTOS_ATRASADA.has(evento)) novoStatus = 'past_due';

    if (!novoStatus) {
      // Evento reconhecido mas sem ação definida ainda (ex.: cancelamento) —
      // loga e responde 200 pra não entrar em retry-loop do lado do Asaas.
      return json({ received: true, handled: false, event: evento });
    }

    const { data: atualizado, error } = await admin
      .from('subscriptions')
      .update({
        status: novoStatus,
        current_period_end: pagamento?.nextDueDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq('gateway_sub_id', pagamento.subscription)
      .select('id_loja')
      .maybeSingle();

    if (error) throw error;
    if (!atualizado) {
      console.warn('billing-webhook: nenhuma subscription encontrada para gateway_sub_id', pagamento.subscription);
    }

    return json({ received: true, handled: true, status: novoStatus });
  } catch (err) {
    console.error('Erro em billing-webhook:', err);
    // Responde 200 mesmo em erro interno pra evitar retry-storm do Asaas;
    // o erro já foi logado acima pra investigação manual.
    return json({ received: true, error: 'internal' }, 200);
  }
});
