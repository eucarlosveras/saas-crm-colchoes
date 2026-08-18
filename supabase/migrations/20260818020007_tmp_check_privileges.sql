CREATE OR REPLACE FUNCTION public._tmp_check_priv()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantee', grantee, 'coluna', column_name, 'privilegio', privilege_type
    )), '[]'::jsonb)
    FROM information_schema.column_privileges
    WHERE table_name = 'clientes' AND column_name IN ('cpf_enc','whatsapp_enc','cpf_hash','whatsapp_hash')
      AND grantee IN ('authenticated','anon','public');
$$;
GRANT EXECUTE ON FUNCTION public._tmp_check_priv TO service_role;
