CREATE OR REPLACE FUNCTION public._tmp_final_rls()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT c.relname AS tabela, c.relrowsecurity AS rls,
            coalesce(json_agg(json_build_object('policy', p.polname, 'comando', p.polcmd) ORDER BY p.polcmd, p.polname)
                FILTER (WHERE p.polname IS NOT NULL), '[]') AS politicas
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        GROUP BY c.relname, c.relrowsecurity ORDER BY c.relname
    ) t;
$$;
GRANT EXECUTE ON FUNCTION public._tmp_final_rls TO service_role;
