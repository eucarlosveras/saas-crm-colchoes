-- ═══════════════════════════════════════════════════════════════════════════
-- Fluxo de aprovação de cadastro (2 níveis):
--   Vendedor se cadastra com o código da loja (fornecido pelo Gerente) →
--     fica 'Pendente' até o Gerente daquela loja aprovar/rejeitar.
--   Gerente se cadastra criando a loja → fica 'Pendente' até o Administrador
--     (operador da plataforma) aprovar/rejeitar.
-- O bloqueio de login por status !== 'Ativo' JÁ EXISTE (auth.js/checkSession
-- e handleLogin) — não precisa de RLS novo pra isso, só os valores de status
-- novos e onde eles são setados/lidos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lojas: código curto (Vendedor usa pra se vincular) + status ───────────
ALTER TABLE public.lojas
    ADD COLUMN IF NOT EXISTS codigo text,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Ativo';

-- Backfill das lojas já existentes com um código (6 caracteres, sem
-- ambiguidade visual — sem 0/O/1/I — pra um Gerente conseguir ditar/digitar
-- sem erro). Lojas novas recebem o código pela Edge Function criar-loja.
DO $$
DECLARE
    r RECORD;
    novo_codigo text;
    alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
    FOR r IN SELECT id_loja FROM public.lojas WHERE codigo IS NULL LOOP
        LOOP
            novo_codigo := (
                SELECT string_agg(substr(alfabeto, (random() * length(alfabeto))::int + 1, 1), '')
                FROM generate_series(1, 6)
            );
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.lojas WHERE codigo = novo_codigo);
        END LOOP;
        UPDATE public.lojas SET codigo = novo_codigo WHERE id_loja = r.id_loja;
    END LOOP;
END $$;

ALTER TABLE public.lojas
    ALTER COLUMN codigo SET NOT NULL,
    ADD CONSTRAINT lojas_codigo_unique UNIQUE (codigo);

COMMENT ON COLUMN public.lojas.codigo IS 'Código curto que o Gerente compartilha com vendedores pra eles se vincularem à loja no cadastro self-service.';
COMMENT ON COLUMN public.lojas.status IS 'Ativo | Inativo — loja inativa bloqueia novo cadastro de vendedor por código (não afeta quem já está vinculado).';

-- ── usuarios: telefone (coletado no cadastro, pedido na especificação) e
-- motivo opcional quando uma solicitação é rejeitada ───────────────────────
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS telefone text,
    ADD COLUMN IF NOT EXISTS motivo_rejeicao text;

COMMENT ON COLUMN public.usuarios.motivo_rejeicao IS 'Preenchido opcionalmente por quem rejeita (Gerente rejeitando Vendedor, ou Administrador rejeitando Gerente).';

-- Não há CHECK constraint em usuarios.status (sempre foi texto livre) — os
-- valores novos ('Pendente', 'Rejeitado') não exigem alteração de schema
-- além da coluna já existente.

-- ═══════════════════════════════════════════════════════════════════════════
-- Gap real encontrado ao implementar isso: as funções auxiliares de RLS
-- (current_id_usuario/current_perfil/current_is_admin/current_lojas_permitidas)
-- nunca filtravam por status — só checkSession()/handleLogin() no front-end
-- bloqueavam login de quem não é 'Ativo'. Isso é só UX: um usuário Pendente/
-- Rejeitado/Inativo que retivesse uma sessão válida (ex: logo após confirmar
-- o e-mail, antes de qualquer aprovação) conseguiria ler/escrever direto via
-- API, ignorando a tela por completo. Mesmo princípio já aplicado outras
-- vezes nesta base: o bloqueio de verdade é no banco, a tela é só o aviso.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.current_id_usuario()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT id_usuario FROM usuarios
    WHERE email = auth.email() AND deleted_at IS NULL AND status = 'Ativo'
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_perfil()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT perfil FROM usuarios
    WHERE email = auth.email() AND deleted_at IS NULL AND status = 'Ativo'
    LIMIT 1;
$$;

-- current_is_admin() já é definida em termos de current_perfil() — herda o
-- filtro de status automaticamente, não precisa ser recriada.

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
    WHERE u.email = auth.email() AND u.deleted_at IS NULL AND u.status = 'Ativo';
$$;

COMMENT ON FUNCTION public.current_id_usuario IS 'id_usuario do usuário logado (vinculado por e-mail). Só resolve pra usuário com status=Ativo — Pendente/Rejeitado/Inativo não tem identidade nenhuma pro RLS, mesmo com sessão válida.';
COMMENT ON FUNCTION public.current_perfil IS 'Perfil do usuário logado. Mesma restrição de status=Ativo do current_id_usuario().';
COMMENT ON FUNCTION public.current_lojas_permitidas IS 'Array de id_loja que o usuário logado pode acessar. NULL = sem restrição (Admin) OU usuário não resolvido (bloqueado por status) — nos dois casos as políticas continuam seguras porque dependem de current_is_admin()/current_perfil() em conjunto, nunca só do array sozinho.';
