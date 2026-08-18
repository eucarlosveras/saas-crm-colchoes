-- Função TEMPORÁRIA: extrai schema completo (colunas, PKs, FKs, views) para
-- gerar o dicionário de dados do projeto. Removida ao final (ver migration
-- de limpeza subsequente).
CREATE OR REPLACE FUNCTION public._tmp_schema_docs()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'colunas', (
            SELECT jsonb_agg(jsonb_build_object(
                'tabela', c.table_name,
                'coluna', c.column_name,
                'tipo', c.data_type,
                'nullable', c.is_nullable,
                'default', c.column_default,
                'posicao', c.ordinal_position
            ) ORDER BY c.table_name, c.ordinal_position)
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
        ),
        'tabelas_e_views', (
            SELECT jsonb_agg(jsonb_build_object('nome', t.table_name, 'tipo', t.table_type) ORDER BY t.table_name)
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
        ),
        'primary_keys', (
            SELECT jsonb_agg(jsonb_build_object('tabela', tc.table_name, 'coluna', kcu.column_name))
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
        ),
        'foreign_keys', (
            SELECT jsonb_agg(jsonb_build_object(
                'tabela_origem', tc.table_name,
                'coluna_origem', kcu.column_name,
                'tabela_destino', ccu.table_name,
                'coluna_destino', ccu.column_name,
                'nome_constraint', tc.constraint_name
            ))
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        ),
        'unique_constraints', (
            SELECT jsonb_agg(jsonb_build_object('tabela', tc.table_name, 'coluna', kcu.column_name))
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
        ),
        'view_definitions', (
            SELECT jsonb_agg(jsonb_build_object('view', table_name, 'definicao', view_definition))
            FROM information_schema.views
            WHERE table_schema = 'public'
        ),
        'check_constraints', (
            SELECT jsonb_agg(jsonb_build_object('tabela', tc.table_name, 'nome', tc.constraint_name, 'definicao', cc.check_clause))
            FROM information_schema.table_constraints tc
            JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name AND tc.table_schema = cc.constraint_schema
            WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
        ),
        'functions', (
            SELECT jsonb_agg(jsonb_build_object('nome', p.proname, 'args', pg_get_function_arguments(p.oid), 'retorna', pg_get_function_result(p.oid)))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname NOT LIKE '\_tmp\_%'
        )
    );
$$;
GRANT EXECUTE ON FUNCTION public._tmp_schema_docs TO service_role;
