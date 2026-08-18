-- BUG CRÍTICO encontrado durante teste rigoroso do RLS: auth.email() sempre
-- retorna o e-mail em minúsculas (normalização padrão do Supabase Auth), mas
-- usuarios.email é armazenado como foi digitado (pode ter maiúsculas). A
-- comparação exata "email = auth.email()" usada em current_id_usuario() (já
-- existia antes deste projeto de RLS) nunca bate para nenhum usuário cujo
-- e-mail tenha qualquer letra maiúscula — ou seja, bloquearia esse usuário de
-- TUDO assim que as políticas permissivas antigas fossem removidas.
-- Corrigido para comparação case-insensitive (lower() dos dois lados).

CREATE OR REPLACE FUNCTION public.current_id_usuario()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT id_usuario FROM usuarios
    WHERE lower(email) = lower(auth.email()) AND deleted_at IS NULL
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_perfil()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT perfil FROM usuarios
    WHERE lower(email) = lower(auth.email()) AND deleted_at IS NULL
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_lojas_permitidas()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE
        WHEN u.perfil IN ('Administrador', 'Admin') THEN NULL
        ELSE (
            SELECT array_agg(DISTINCT loja) FROM (
                SELECT id_loja AS loja FROM usuario_lojas WHERE id_usuario = u.id_usuario
                UNION
                SELECT u.id_loja WHERE u.id_loja IS NOT NULL
            ) t
        )
    END
    FROM usuarios u
    WHERE lower(u.email) = lower(auth.email()) AND u.deleted_at IS NULL;
$$;
