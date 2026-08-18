CREATE OR REPLACE FUNCTION public._tmp_check_owner()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'dono_tabela', (SELECT tableowner FROM pg_tables WHERE tablename = 'clientes'),
        'current_user_migration', current_user,
        'session_user_migration', session_user
    );
$$;
GRANT EXECUTE ON FUNCTION public._tmp_check_owner TO service_role;
