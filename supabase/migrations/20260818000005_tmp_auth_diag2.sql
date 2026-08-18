-- Diagnóstico direto: LANGUAGE sql + SECURITY DEFINER, igual a current_id_usuario(),
-- mas retornando TUDO que pode explicar um mismatch (email visto, linhas
-- encontradas por email exato, e por email com trim/lower, contagem total).
CREATE OR REPLACE FUNCTION public._tmp_auth_diag3()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'auth_email_visto', auth.email(),
        'id_via_current_id_usuario', public.current_id_usuario(),
        'match_exato', (SELECT jsonb_agg(jsonb_build_object('id_usuario', id_usuario, 'email', email)) FROM usuarios WHERE email = auth.email()),
        'match_trim_lower', (SELECT jsonb_agg(jsonb_build_object('id_usuario', id_usuario, 'email', email)) FROM usuarios WHERE lower(trim(email)) = lower(trim(auth.email()))),
        'total_usuarios_com_marca', (SELECT count(*) FROM usuarios WHERE email LIKE '%teste.local')
    );
$$;
GRANT EXECUTE ON FUNCTION public._tmp_auth_diag3 TO authenticated;
