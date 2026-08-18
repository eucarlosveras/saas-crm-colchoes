-- Encontrado ao documentar o schema: a constraint usuarios_perfil_check
-- ainda permitia o valor 'Terminal', que não é mais um perfil válido do
-- sistema (só existem Vendedor, Gerente, Administrador/Admin — ver limpeza
-- do código em src/ no commit anterior). Remove 'Terminal' da lista de
-- valores aceitos para impedir que alguém volte a criar um usuário com
-- esse perfil.
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_perfil_check
    CHECK (perfil = ANY (ARRAY['Vendedor'::text, 'Gerente'::text, 'Administrador'::text, 'Admin'::text]));
