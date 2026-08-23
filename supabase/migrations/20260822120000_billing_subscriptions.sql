-- ═══════════════════════════════════════════════════════════════════════════
-- Sistema de cobrança — assinatura POR LOJA (não por empresa: cada loja é o
-- tenant e paga a própria assinatura, conforme decisão de modelo de negócio).
--
-- Gateway: Asaas (PIX/boleto/cartão nativos, mercado BR — ver
-- billing-checkout e billing-webhook em supabase/functions/).
--
-- O bloqueio de inadimplente é reforçado no PRÓPRIO RLS, não só na tela de
-- login: current_lojas_permitidas() (usada por toda política do banco) passa
-- a excluir lojas sem assinatura trialing/active. Administrador nunca é
-- afetado — o bypass dele já vem antes dessa checagem em todas as políticas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.subscriptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_loja             uuid NOT NULL UNIQUE REFERENCES public.lojas(id_loja) ON DELETE CASCADE,
    plano               text NOT NULL DEFAULT 'trial',       -- trial | essencial | profissional | empresarial
    status              text NOT NULL DEFAULT 'trialing',    -- trialing | active | past_due | canceled
    gateway_customer_id text,                                -- id do cliente no Asaas
    gateway_sub_id      text,                                -- id da assinatura no Asaas
    trial_ends_at       timestamptz,
    current_period_end  timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS
    'Assinatura por loja (tenant = loja). Escrita só via Edge Function (billing-checkout / billing-webhook) — nunca update direto do front-end, pra não dessincronizar do estado real no gateway.';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Backfill: toda loja já existente vira assinatura 'active' legada (sem
-- gateway) — ANTES de ligar o bloqueio, senão o deploy tranca todo mundo.
INSERT INTO public.subscriptions (id_loja, plano, status)
SELECT id_loja, 'legado', 'active' FROM public.lojas
ON CONFLICT (id_loja) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS de subscriptions
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT usa o vínculo BRUTO (usuario_lojas / usuarios.id_loja), não
-- current_lojas_permitidas() — de propósito: se a leitura dependesse da
-- assinatura estar ativa, um Gerente/Vendedor bloqueado não conseguiria nem
-- ver que está bloqueado nem por quê. Vendedor também enxerga (só leitura,
-- nada sensível na tabela) pra a tela de "assinatura pendente" funcionar
-- pra qualquer perfil, não só Gerente.
CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_loja IN (
        SELECT ul.id_loja FROM public.usuario_lojas ul WHERE ul.id_usuario = public.current_id_usuario()
        UNION
        SELECT u.id_loja FROM public.usuarios u WHERE u.id_usuario = public.current_id_usuario() AND u.id_loja IS NOT NULL
    )
);

-- Sem policy de INSERT/UPDATE/DELETE para `authenticated` — só as Edge
-- Functions (service role, ignora RLS) escrevem nesta tabela.

-- ═══════════════════════════════════════════════════════════════════════════
-- O bloqueio de verdade: current_lojas_permitidas() passa a excluir lojas
-- sem assinatura trialing/active. Toda política do banco que já usa essa
-- função (lojas, clientes, orçamentos, estoque, comentários, ...) herda o
-- bloqueio automaticamente, sem precisar tocar em cada uma.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.current_lojas_permitidas()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE
        WHEN u.perfil IN ('Administrador', 'Admin') THEN NULL
        ELSE (
            SELECT array_agg(DISTINCT t.loja) FROM (
                SELECT id_loja AS loja FROM usuario_lojas WHERE id_usuario = u.id_usuario
                UNION
                SELECT u.id_loja WHERE u.id_loja IS NOT NULL
            ) t
            WHERE EXISTS (
                SELECT 1 FROM public.subscriptions s
                WHERE s.id_loja = t.loja AND s.status IN ('trialing', 'active')
            )
        )
    END
    FROM usuarios u
    WHERE u.email = auth.email() AND u.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.current_lojas_permitidas IS
    'Array de id_loja que o usuário logado pode acessar, já excluindo lojas sem assinatura ativa/trial. NULL = sem restrição (Admin, nunca bloqueado).';
