CREATE OR REPLACE FUNCTION public._tmp_check_unique()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'constraint', tc.constraint_name, 'tipo', tc.constraint_type, 'coluna', kcu.column_name
    )), '[]'::jsonb)
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_name = 'clientes' AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY');
$$;
GRANT EXECUTE ON FUNCTION public._tmp_check_unique TO service_role;
