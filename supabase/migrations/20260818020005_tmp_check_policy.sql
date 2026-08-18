CREATE OR REPLACE FUNCTION public._tmp_check_policy()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'policy', p.polname, 'comando', p.polcmd,
        'using', pg_get_expr(p.polqual, p.polrelid),
        'with_check', pg_get_expr(p.polwithcheck, p.polrelid)
    )), '[]'::jsonb)
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'clientes';
$$;
GRANT EXECUTE ON FUNCTION public._tmp_check_policy TO service_role;
