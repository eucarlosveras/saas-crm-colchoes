-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: trg_lojas_protege_assinatura (20260901120000_assinatura_lojas.sql)
-- tinha um bypass sério — achado empiricamente por tests/04-assinatura-lojas.test.js
-- ao usar um e-mail de teste com maiúscula no prefixo (comportamento real:
-- qualquer usuário cujo usuarios.email tenha letra maiúscula cai nesse caso).
--
-- Causa raiz: current_perfil()/current_is_admin() comparam
-- "email = auth.email()" com igualdade EXATA (case-sensitive). auth.email()
-- sempre devolve minúsculas; usuarios.email não é normalizado (mesma
-- característica já documentada em 20260818000006_fix_email_case_insensitive.sql,
-- que corrigiu isso só dentro da Edge Function criar-usuario, não nessas
-- funções SQL). Quando o e-mail do usuário tem maiúscula, a busca não acha
-- a linha e current_perfil() retorna NULL, não FALSE.
--
-- Isso por si só é seguro em toda política RLS existente (USING/WITH CHECK
-- com NULL = nega acesso, o padrão do Postgres). O problema é exclusivo do
-- padrão "IF NOT current_is_admin() THEN RAISE EXCEPTION" que a migration
-- anterior introduziu: NOT NULL também é NULL, e "IF NULL THEN" em plpgsql
-- NÃO executa o bloco — ou seja, um Gerente com e-mail de maiúscula
-- conseguia alterar a própria assinatura sem erro nenhum. Fail-open
-- clássico. Troca para "IS NOT TRUE", que trata NULL como "não é admin"
-- (nega), igual ao resto do sistema.
--
-- A causa raiz mais ampla (case-sensitivity nessas 4 funções auxiliares,
-- usadas por praticamente toda política RLS do banco) continua sem
-- correção — é um escopo bem maior que essa trigger isolada e merece
-- revisão própria; não foi resolvida aqui de propósito.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_lojas_protege_colunas_assinatura()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF public.current_is_admin() IS NOT TRUE THEN
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
