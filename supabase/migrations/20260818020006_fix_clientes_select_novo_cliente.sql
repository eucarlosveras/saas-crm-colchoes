-- BUG CRÍTICO encontrado ao testar rigorosamente a criptografia (não tem
-- relação com ela — é um problema pré-existente no RLS de `clientes`):
--
-- rpc_salvar_orcamento cria o cliente e o orçamento na mesma transação, MAS
-- em duas instruções separadas — primeiro INSERT INTO clientes ... RETURNING
-- id_cliente, DEPOIS INSERT INTO orcamentos. No Postgres, um INSERT com
-- RETURNING é avaliado contra a política de SELECT da linha resultante (não
-- só a de INSERT). Como a política "clientes_select" deriva toda a
-- visibilidade de um cliente através de um orçamento vinculado a ele, no
-- exato momento do RETURNING do INSERT em clientes NENHUM orçamento existe
-- ainda — nem o Vendedor que acabou de cadastrar o cliente conseguia "ver"
-- a própria linha que criou. Resultado: "new row violates row-level
-- security policy for table clientes" toda vez que um Vendedor tentava
-- salvar orçamento para um cliente novo (não teria acontecido para cliente
-- já existente, só para cadastro novo).
--
-- Correção: quem CADASTROU o cliente (id_usuario_cadastro) sempre pode vê-lo,
-- independente de já existir orçamento vinculado. Faz sentido por si só
-- (quem registrou o cliente deveria poder vê-lo) e resolve o problema do
-- RETURNING.

DROP FUNCTION IF EXISTS public._tmp_check_policy();

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario_cadastro = public.current_id_usuario()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_cliente = clientes.id_cliente
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario_cadastro = public.current_id_usuario()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_cliente = clientes.id_cliente
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);
