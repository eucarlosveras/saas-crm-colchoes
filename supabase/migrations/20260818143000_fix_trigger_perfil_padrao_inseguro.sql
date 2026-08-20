-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige padrão inseguro do trigger auth.users -> public.usuarios
-- ═══════════════════════════════════════════════════════════════════════════
-- O trigger "no_cadastro_usuario" (função cria_perfil_usuario) roda em todo
-- INSERT em auth.users e, quando raw_user_meta_data não traz nome/perfil,
-- criava uma linha com perfil = 'Admin' e nome = 'Admin Provisório' — e como
-- a coluna status tem default 'Ativo', essa linha nascia como Admin ATIVO.
--
-- current_is_admin() trata 'Admin' como equivalente a 'Administrador'
-- (current_is_admin() = current_perfil() IN ('Administrador','Admin')), e o
-- self-signup público do Supabase Auth (/auth/v1/signup, com a anon key
-- pública) está habilitado neste projeto — confirmado empiricamente nesta
-- sessão. Hoje isso não vaza dado nenhum porque current_perfil()/
-- current_id_usuario() e o checkSession()/handleLogin() do front-end
-- procuram a linha por e-mail, e o trigger nunca preenche email (fica NULL)
-- — então nem RLS nem o app encontram a linha. Mas é segurança por
-- coincidência, não por design: se algum dia alguém "corrigir" o trigger
-- para também copiar o e-mail (mudança que parece inofensiva), a fronteira
-- desaparece e qualquer self-signup vira Admin ativo de verdade.
--
-- criar-usuario (a única forma legítima de criar usuário) usa upsert com
-- onConflict: 'id_usuario' e sempre sobrescreve nome/email/perfil/status —
-- então trocar o default daqui para algo inofensivo não quebra esse fluxo,
-- só remove o perigo de qualquer OUTRO caminho de criação em auth.users
-- (self-signup, ou criação manual pelo painel do Supabase) nascer
-- privilegiado.
CREATE OR REPLACE FUNCTION public.cria_perfil_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id_usuario, nome, perfil, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', 'Usuário Pendente'),
    -- Nunca privilegiado por padrão: só Vendedor (o perfil de menor acesso).
    -- Quem precisa de mais que isso passa por criar-usuario, que sobrescreve.
    'Vendedor',
    -- Nunca ativo por padrão — bloqueia login (handleLogin exige status
    -- 'Ativo') até alguém com autoridade completar o cadastro de verdade.
    'Pendente'
  )
  ON CONFLICT (id_usuario) DO NOTHING;
  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.cria_perfil_usuario() IS
  'Trigger AFTER INSERT ON auth.users (no_cadastro_usuario). Cria um stub em '
  'usuarios sempre inofensivo (Vendedor/Pendente) — nunca privilegiado por '
  'padrão. criar-usuario sempre sobrescreve via upsert com os dados reais.';
