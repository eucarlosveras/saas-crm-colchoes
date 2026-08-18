-- ═══════════════════════════════════════════════════════════════════════════
-- RLS multi-tenant (isolamento por loja) — revisão completa
--
-- Diagnóstico do estado anterior (ver conversa/commit): várias tabelas tinham
-- políticas "USING (true)" liberando acesso total a qualquer usuário
-- autenticado, coexistindo com políticas restritivas que na prática nunca
-- disparavam (comparavam auth.uid() diretamente com usuarios.id_usuario, que
-- são espaços de UUID DIFERENTES nesta base — a vinculação real é por
-- e-mail). Como políticas permissivas se combinam com OR no Postgres, a
-- política "true" sempre vencia e a isolação nunca existiu de fato.
--
-- Modelo de tenant: a LOJA. Perfis existentes: Vendedor, Gerente,
-- Administrador/Admin (não existe mais "Terminal").
--   • Administrador/Admin: acesso irrestrito.
--   • Gerente: restrito à(s) loja(s) associada(s) (tabela usuario_lojas,
--     com fallback para usuarios.id_loja quando não há registro lá).
--   • Vendedor: restrito aos próprios registros (id_usuario = ele mesmo).
--
-- Vinculação auth → app: por e-mail (auth.email() = usuarios.email), via as
-- funções auxiliares abaixo. É o único mecanismo que já funcionava de fato
-- neste banco (usado em notificacoes) — não inventamos um novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove as funções de diagnóstico temporárias criadas durante o levantamento.
DROP FUNCTION IF EXISTS public._tmp_rls_diag();
DROP FUNCTION IF EXISTS public._tmp_rls_diag2();

-- ───────────────────────────────────────────────────────────────────────────
-- Funções auxiliares (SECURITY DEFINER: podem ler `usuarios` mesmo com RLS
-- restrito nela, sem causar recursão infinita nas próprias políticas de
-- `usuarios`, já que rodam com o privilégio do dono da função).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_id_usuario()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT id_usuario FROM usuarios
    WHERE email = auth.email() AND deleted_at IS NULL
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_perfil()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT perfil FROM usuarios
    WHERE email = auth.email() AND deleted_at IS NULL
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT public.current_perfil() IN ('Administrador', 'Admin');
$$;

-- Lojas que o usuário atual pode acessar. NULL = sem restrição (Admin).
-- Para os demais, é a união de usuario_lojas (Gerente multiloja) com o
-- fallback usuarios.id_loja (loja única) — mesma regra do getLojasPermitidas()
-- do front-end (src/state.js), só que aplicada no banco.
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
    WHERE u.email = auth.email() AND u.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.current_id_usuario IS 'id_usuario do usuário logado (vinculado por e-mail — não existe FK direta usuarios<->auth.users nesta base).';
COMMENT ON FUNCTION public.current_perfil IS 'Perfil (Vendedor/Gerente/Administrador) do usuário logado.';
COMMENT ON FUNCTION public.current_is_admin IS 'true se o usuário logado é Administrador/Admin.';
COMMENT ON FUNCTION public.current_lojas_permitidas IS 'Array de id_loja que o usuário logado pode acessar. NULL = sem restrição (Admin).';

-- ═══════════════════════════════════════════════════════════════════════════
-- usuarios
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Permitir leitura de perfis para usuarios autenticados" ON public.usuarios;
DROP POLICY IF EXISTS "Permitir update em usuarios para equipe" ON public.usuarios;

CREATE POLICY "usuarios_select" ON public.usuarios FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario = public.current_id_usuario()
    OR (public.current_perfil() = 'Gerente' AND id_loja = ANY(public.current_lojas_permitidas()))
);

-- Só Administrador pode criar/editar/excluir usuários (a criação "de verdade"
-- passa pela Edge Function criar-usuario, que usa a service_role e ignora RLS;
-- esta política cobre updates feitos pela tela de admin e qualquer insert
-- direto que venha a existir).
CREATE POLICY "usuarios_insert_admin" ON public.usuarios FOR INSERT TO authenticated
WITH CHECK (public.current_is_admin());

CREATE POLICY "usuarios_update_admin" ON public.usuarios FOR UPDATE TO authenticated
USING (public.current_is_admin())
WITH CHECK (public.current_is_admin());

CREATE POLICY "usuarios_delete_admin" ON public.usuarios FOR DELETE TO authenticated
USING (public.current_is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- lojas
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Permitir leitura de lojas para autenticados" ON public.lojas;

CREATE POLICY "lojas_select" ON public.lojas FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_loja = ANY(public.current_lojas_permitidas())
);

-- Edição de meta da loja: Admin qualquer loja, Gerente só a(s) sua(s).
-- (RLS é por linha, não por coluna — Gerente tecnicamente também poderia
-- alterar nome_loja via chamada direta à API; não há uso disso no app hoje.)
CREATE POLICY "lojas_update_gestores" ON public.lojas FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
    OR (public.current_perfil() = 'Gerente' AND id_loja = ANY(public.current_lojas_permitidas()))
)
WITH CHECK (
    public.current_is_admin()
    OR (public.current_perfil() = 'Gerente' AND id_loja = ANY(public.current_lojas_permitidas()))
);

CREATE POLICY "lojas_insert_admin" ON public.lojas FOR INSERT TO authenticated
WITH CHECK (public.current_is_admin());

CREATE POLICY "lojas_delete_admin" ON public.lojas FOR DELETE TO authenticated
USING (public.current_is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- usuario_lojas (associação Gerente multiloja)
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admins podem gerenciar todas as associacoes" ON public.usuario_lojas;
DROP POLICY IF EXISTS "Usuarios podem ver suas proprias associacoes" ON public.usuario_lojas;

CREATE POLICY "usuario_lojas_select" ON public.usuario_lojas FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario = public.current_id_usuario()
);

CREATE POLICY "usuario_lojas_all_admin" ON public.usuario_lojas FOR ALL TO authenticated
USING (public.current_is_admin())
WITH CHECK (public.current_is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- clientes
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Permitir atualizacao de clientes" ON public.clientes;
DROP POLICY IF EXISTS "Permitir insercao de clientes" ON public.clientes;
DROP POLICY IF EXISTS "Permitir leitura de clientes" ON public.clientes;

-- Um cliente é visível se existe (pelo menos) um orçamento dele atribuído a
-- um vendedor dentro do escopo do usuário logado — mesma regra que o
-- front-end já aplicava em src/clientes.js (derivada via orcamentos, não via
-- clientes.id_loja diretamente).
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
USING (
    public.current_is_admin()
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

CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated
WITH CHECK (id_usuario_cadastro = public.current_id_usuario());

CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
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

-- Exclusão de cliente: só Gerente (da própria loja) e Admin — o front-end já
-- bloqueia Vendedor na UI; aqui isso passa a ser garantido pelo banco também.
CREATE POLICY "clientes_delete_gestores" ON public.clientes FOR DELETE TO authenticated
USING (
    public.current_is_admin()
    OR (
        public.current_perfil() = 'Gerente'
        AND EXISTS (
            SELECT 1 FROM public.orcamentos o
            JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
            WHERE o.id_cliente = clientes.id_cliente
              AND ou.id_loja = ANY(public.current_lojas_permitidas())
        )
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- orcamentos
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Acesso total para gestores e administradores" ON public.orcamentos;
DROP POLICY IF EXISTS "Admin pode ver todos os orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Liberar gravacao de orcamentos para equipe" ON public.orcamentos;
DROP POLICY IF EXISTS "Qualquer usuário autenticado pode inserir" ON public.orcamentos;
DROP POLICY IF EXISTS "Terminal pode atualizar orcamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Vendedor pode inserir seus próprios orçamentos" ON public.orcamentos;
DROP POLICY IF EXISTS "Vendedor vê seus próprios orçamentos" ON public.orcamentos;

CREATE POLICY "orcamentos_select" ON public.orcamentos FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario = public.current_id_usuario()
    OR (
        public.current_perfil() = 'Gerente'
        AND EXISTS (
            SELECT 1 FROM public.usuarios ou
            WHERE ou.id_usuario = orcamentos.id_usuario
              AND ou.id_loja = ANY(public.current_lojas_permitidas())
        )
    )
);

-- Um orçamento sempre é criado em nome de quem está logado
-- (id_usuario = currentUser.id_usuario no app, inclusive quando Gerente/Admin
-- cria um orçamento — nunca "para outra pessoa").
CREATE POLICY "orcamentos_insert" ON public.orcamentos FOR INSERT TO authenticated
WITH CHECK (id_usuario = public.current_id_usuario());

CREATE POLICY "orcamentos_update" ON public.orcamentos FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario = public.current_id_usuario()
    OR (
        public.current_perfil() = 'Gerente'
        AND EXISTS (
            SELECT 1 FROM public.usuarios ou
            WHERE ou.id_usuario = orcamentos.id_usuario
              AND ou.id_loja = ANY(public.current_lojas_permitidas())
        )
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- comentarios (não tem id_loja/id_usuario próprio — herda o escopo do
-- orçamento pai via id_orcamento).
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Acesso total aos comentarios para usuarios logados" ON public.comentarios;
DROP POLICY IF EXISTS "Liberar acesso total para equipe" ON public.comentarios;

CREATE POLICY "comentarios_select" ON public.comentarios FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = comentarios.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

CREATE POLICY "comentarios_insert" ON public.comentarios FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = comentarios.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

-- Edição/exclusão de comentário: mesma regra de visibilidade do orçamento pai.
-- (A regra "só o autor edita o próprio comentário" é hoje só checada no
-- front-end — a coluna `autor` é texto livre, sem FK para usuarios, então
-- não dá pra reforçar isso com segurança via RLS sem mudar o schema.)
CREATE POLICY "comentarios_update" ON public.comentarios FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = comentarios.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

CREATE POLICY "comentarios_delete" ON public.comentarios FOR DELETE TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = comentarios.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- itens_orcamento (RLS já estava habilitado, sem nenhuma política — ou seja,
-- hoje é 100% inacessível via authenticated. Adicionar políticas aqui é uma
-- melhoria pura, não pode "regredir" nada que já funcionava.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "itens_orcamento_select" ON public.itens_orcamento FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = itens_orcamento.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

CREATE POLICY "itens_orcamento_insert" ON public.itens_orcamento FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        WHERE o.id_orcamento = itens_orcamento.id_orcamento
          AND o.id_usuario = public.current_id_usuario()
    )
);

CREATE POLICY "itens_orcamento_update" ON public.itens_orcamento FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = itens_orcamento.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

CREATE POLICY "itens_orcamento_delete" ON public.itens_orcamento FOR DELETE TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.orcamentos o
        LEFT JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
        WHERE o.id_orcamento = itens_orcamento.id_orcamento
          AND (
              o.id_usuario = public.current_id_usuario()
              OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
          )
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- estoque
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Permitir inserção em estoque" ON public.estoque;
DROP POLICY IF EXISTS "Permitir leitura de estoque" ON public.estoque;

CREATE POLICY "estoque_select" ON public.estoque FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_loja = ANY(public.current_lojas_permitidas())
);

CREATE POLICY "estoque_insert" ON public.estoque FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR id_loja = ANY(public.current_lojas_permitidas())
);

CREATE POLICY "estoque_update" ON public.estoque FOR UPDATE TO authenticated
USING (
    public.current_is_admin()
    OR id_loja = ANY(public.current_lojas_permitidas())
);

CREATE POLICY "estoque_delete_gestores" ON public.estoque FOR DELETE TO authenticated
USING (
    public.current_is_admin()
    OR (public.current_perfil() = 'Gerente' AND id_loja = ANY(public.current_lojas_permitidas()))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- movimentacoes_estoque (idem itens_orcamento: hoje sem nenhuma política —
-- 100% bloqueado. Escopo derivado via estoque.id_loja.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "movimentacoes_estoque_select" ON public.movimentacoes_estoque FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.estoque e
        WHERE e.id = movimentacoes_estoque.id_estoque
          AND e.id_loja = ANY(public.current_lojas_permitidas())
    )
);

CREATE POLICY "movimentacoes_estoque_insert" ON public.movimentacoes_estoque FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR EXISTS (
        SELECT 1 FROM public.estoque e
        WHERE e.id = movimentacoes_estoque.id_estoque
          AND e.id_loja = ANY(public.current_lojas_permitidas())
    )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- alertas (id_usuario_destino = destinatário, mesmo padrão de notificacoes)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "alertas_select" ON public.alertas FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR id_usuario_destino = public.current_id_usuario()
);

CREATE POLICY "alertas_update_proprio" ON public.alertas FOR UPDATE TO authenticated
USING (id_usuario_destino = public.current_id_usuario())
WITH CHECK (id_usuario_destino = public.current_id_usuario());

CREATE POLICY "alertas_insert_gestores" ON public.alertas FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR public.current_perfil() = 'Gerente'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- notificacoes — as políticas existentes já usavam current_id_usuario()
-- corretamente. Só reforça o INSERT: hoje qualquer Gerente/Admin pode
-- notificar QUALQUER usuário (não só os da própria loja). Ajustado para
-- exigir que o destinatário esteja dentro do escopo de quem está inserindo.
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Gerentes podem inserir notificações" ON public.notificacoes;

CREATE POLICY "notificacoes_insert_gestores" ON public.notificacoes FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR (
        public.current_perfil() = 'Gerente'
        AND EXISTS (
            SELECT 1 FROM public.usuarios dest
            WHERE dest.id_usuario = notificacoes.id_usuario
              AND dest.id_loja = ANY(public.current_lojas_permitidas())
        )
    )
);
