-- ═══════════════════════════════════════════════════════════════════════════
-- Fix #2 do dia na mesma trigger (20260901120000 → 20260901121500 → esta):
-- a correção anterior (current_is_admin() IS NOT TRUE, em vez de NOT
-- current_is_admin()) fechou o bypass do Gerente, mas como efeito colateral
-- passou a bloquear também a service_role — que não tem e-mail/perfil
-- nenhum (current_is_admin() é sempre NULL pra ela, nunca TRUE). Isso
-- quebraria qualquer Edge Function com service role que precise tocar
-- nessas colunas no futuro (ex: um webhook de billing de verdade), e já
-- quebra scripts administrativos/backend que usem a service role hoje.
--
-- service_role é, por definição, mais confiável que "ser Administrador" —
-- é a chave que já ignora RLS de propósito. Não faz sentido a trigger
-- barrar quem já tem acesso irrestrito ao banco por fora dela. auth.role()
-- devolve 'service_role' pra chamadas via PostgREST com a service key, e
-- NULL pra conexões diretas ao Postgres sem contexto de JWT nenhum (ex:
-- migration/SQL direto) — ambos os casos devem passar.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_lojas_protege_colunas_assinatura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF COALESCE(auth.role(), 'service_role') = 'service_role' OR public.current_is_admin() IS TRUE THEN
        RETURN NEW;
    END IF;

    IF NEW.plano IS DISTINCT FROM OLD.plano
        OR NEW.assinatura_status IS DISTINCT FROM OLD.assinatura_status
        OR NEW.assinatura_valido_ate IS DISTINCT FROM OLD.assinatura_valido_ate
        OR NEW.assinatura_obs IS DISTINCT FROM OLD.assinatura_obs
    THEN
        RAISE EXCEPTION 'Apenas o operador da plataforma pode alterar dados de assinatura.';
    END IF;
    RETURN NEW;
END;
$$;
