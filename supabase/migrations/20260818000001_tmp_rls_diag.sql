-- Função TEMPORÁRIA de diagnóstico: lista o estado atual de RLS e políticas
-- de todas as tabelas do schema public. Será removida assim que o
-- levantamento para o projeto de RLS multi-tenant terminar.
CREATE OR REPLACE FUNCTION public._tmp_rls_diag()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT
            c.relname AS tabela,
            c.relrowsecurity AS rls_habilitado,
            c.relforcerowsecurity AS rls_forcado,
            coalesce(json_agg(json_build_object(
                'policy', p.polname,
                'comando', p.polcmd,
                'permissiva', p.polpermissive,
                'roles', p.polroles::regrole[]::text[],
                'using', pg_get_expr(p.polqual, p.polrelid),
                'with_check', pg_get_expr(p.polwithcheck, p.polrelid)
            ) ORDER BY p.polname) FILTER (WHERE p.polname IS NOT NULL), '[]') AS politicas
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
        ORDER BY c.relname
    ) t;
$$;

GRANT EXECUTE ON FUNCTION public._tmp_rls_diag TO service_role;
