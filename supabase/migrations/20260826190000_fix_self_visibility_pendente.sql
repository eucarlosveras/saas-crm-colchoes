-- ═══════════════════════════════════════════════════════════════════════════
-- Regressão introduzida pela própria correção de segurança de hoje
-- (20260826180000): current_id_usuario()/current_perfil() passaram a exigir
-- status='Ativo' pra resolver a identidade do usuário — o que é o
-- comportamento certo pra impedir Pendente/Rejeitado de ler QUALQUER dado
-- (lojas, clientes, orçamentos...). Só que "usuarios_select" usava essa
-- mesma função gated pra decidir se o usuário pode ver A PRÓPRIA linha —
-- resultado: um usuário Pendente deixou de conseguir ler seu próprio
-- registro em usuarios, e o app (handleLogin/checkSession, que fazem essa
-- leitura pelo client RLS-scoped, não por service role) mostrava "Perfil
-- não encontrado no sistema" em vez da mensagem certa de "aguardando
-- aprovação". Mesmo princípio já usado em subscriptions_select: a
-- visibilidade da PRÓPRIA linha nunca pode depender de um status que a
-- própria linha define — senão vira paradoxo (bloqueado não consegue nem
-- ver por que está bloqueado).
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;

CREATE POLICY "usuarios_select" ON public.usuarios FOR SELECT TO authenticated
USING (
    public.current_is_admin()
    OR email = auth.email()  -- própria linha, sempre visível, qualquer status
    OR (public.current_perfil() = 'Gerente' AND id_loja = ANY(public.current_lojas_permitidas()))
);
