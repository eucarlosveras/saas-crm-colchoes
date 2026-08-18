CREATE OR REPLACE FUNCTION public._tmp_auth_diag()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
    SELECT jsonb_build_object(
        'uid', auth.uid(),
        'email_fn', auth.email(),
        'role', auth.role(),
        'jwt_email', auth.jwt() ->> 'email',
        'jwt_sub', auth.jwt() ->> 'sub',
        'jwt_full', auth.jwt()
    );
$$;
GRANT EXECUTE ON FUNCTION public._tmp_auth_diag TO authenticated;
