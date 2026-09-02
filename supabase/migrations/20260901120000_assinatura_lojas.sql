-- ═══════════════════════════════════════════════════════════════════════════
-- Assinatura por loja (controle manual) — base do Painel do Operador
--
-- Ainda não existe integração com gateway de pagamento (Stripe/Asaas) nem
-- com WhatsApp — fica para quando essas configurações estiverem prontas.
-- Por ora, o Administrador (único, é o operador da plataforma) controla
-- manualmente o plano e o status de pagamento de cada loja por aqui. Quando
-- o gateway for integrado, ele passa a atualizar essas mesmas colunas via
-- webhook, em vez do Admin fazer isso à mão — o resto do sistema (bloqueio
-- de acesso, painel) não muda.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lojas
    ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'Trial',
    ADD COLUMN IF NOT EXISTS assinatura_status text NOT NULL DEFAULT 'Trial',
    ADD COLUMN IF NOT EXISTS assinatura_valido_ate timestamptz,
    ADD COLUMN IF NOT EXISTS assinatura_obs text;

COMMENT ON COLUMN public.lojas.plano IS 'Texto livre por enquanto: Trial | Starter | Pro | Enterprise. Sem gateway integrado ainda — definido manualmente pelo Administrador no Painel do Operador.';
COMMENT ON COLUMN public.lojas.assinatura_status IS 'Trial | Ativa | Inadimplente | Cancelada. Inadimplente/Cancelada bloqueia o login de todos os usuários da loja (ver checkSession()/handleLogin() em auth.js) — exceto o Administrador, que não pertence a loja nenhuma.';
COMMENT ON COLUMN public.lojas.assinatura_valido_ate IS 'Data até quando a loja está paga/liberada. Puramente informativo por enquanto (não há expiração automática) — controle manual do Administrador.';
COMMENT ON COLUMN public.lojas.assinatura_obs IS 'Anotação livre do Administrador sobre a cobrança dessa loja (ex: forma de pagamento combinada, motivo de um desconto). Nunca exibido para Gerente/Vendedor.';

-- ─────────────────────────────────────────────────────────────────────────
-- Trava de coluna: a policy "lojas_update_gestores" já existente permite
-- Gerente dar UPDATE na própria loja (pensada para "Edição de meta da loja"),
-- e RLS no Postgres é por LINHA, não por coluna — sem isso, um Gerente
-- poderia se auto-promover para assinatura_status='Ativa' via uma chamada
-- direta à API REST do Supabase, contornando o controle manual do
-- Administrador por completo. Trigger cobre exatamente o que RLS não cobre.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_lojas_protege_colunas_assinatura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.current_is_admin() THEN
        IF NEW.plano IS DISTINCT FROM OLD.plano
            OR NEW.assinatura_status IS DISTINCT FROM OLD.assinatura_status
            OR NEW.assinatura_valido_ate IS DISTINCT FROM OLD.assinatura_valido_ate
            OR NEW.assinatura_obs IS DISTINCT FROM OLD.assinatura_obs
        THEN
            RAISE EXCEPTION 'Apenas o operador da plataforma pode alterar dados de assinatura.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lojas_protege_assinatura ON public.lojas;
CREATE TRIGGER trg_lojas_protege_assinatura
    BEFORE UPDATE ON public.lojas
    FOR EACH ROW EXECUTE FUNCTION public.fn_lojas_protege_colunas_assinatura();
