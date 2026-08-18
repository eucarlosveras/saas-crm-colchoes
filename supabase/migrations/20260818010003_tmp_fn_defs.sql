CREATE OR REPLACE FUNCTION public._tmp_fn_defs()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_agg(jsonb_build_object(
        'nome', p.proname,
        'security', CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
        'definicao', pg_get_functiondef(p.oid)
    ) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname NOT LIKE '\_tmp\_%'
      AND p.proname NOT IN ('current_id_usuario','current_perfil','current_is_admin','current_lojas_permitidas','rpc_salvar_orcamento','rpc_confirmar_fechamento_orcamento','rpc_confirmar_perda_orcamento');
$$;
GRANT EXECUTE ON FUNCTION public._tmp_fn_defs TO service_role;

CREATE OR REPLACE FUNCTION public._tmp_triggers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_agg(jsonb_build_object(
        'tabela', c.relname,
        'trigger', t.tgname,
        'funcao', p.proname,
        'timing', CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END,
        'evento', t.tgtype
    ))
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal;
$$;
GRANT EXECUTE ON FUNCTION public._tmp_triggers TO service_role;
