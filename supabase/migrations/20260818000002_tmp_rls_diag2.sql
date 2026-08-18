CREATE OR REPLACE FUNCTION public._tmp_rls_diag2()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'funcoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', p.proname, 'def', pg_get_functiondef(p.oid))), '[]'::jsonb)
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname IN ('current_id_usuario','current_usuario')),
    'usuarios_amostra', (SELECT coalesce(jsonb_agg(jsonb_build_object('id_usuario', id_usuario, 'email', email, 'perfil', perfil)), '[]'::jsonb) FROM (SELECT id_usuario, email, perfil FROM usuarios LIMIT 3) x),
    'perfis_distintos', (SELECT coalesce(jsonb_agg(DISTINCT perfil), '[]'::jsonb) FROM usuarios),
    'auth_users_amostra', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email)), '[]'::jsonb) FROM (SELECT id, email FROM auth.users LIMIT 3) y)
  );
$$;
GRANT EXECUTE ON FUNCTION public._tmp_rls_diag2 TO service_role;
