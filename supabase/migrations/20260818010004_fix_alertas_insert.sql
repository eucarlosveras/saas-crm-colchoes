-- BUG encontrado ao documentar o schema: dois triggers existentes em
-- orcamentos (fn_trigger_estoque_orcamento — baixa/reserva automática de
-- estoque; fn_gerar_alerta_orcamento_parado — orçamento parado há 7+ dias)
-- inserem em `alertas` com id_usuario_destino = NEW.id_usuario. Como ambos
-- os triggers e as funções que chamam são SECURITY INVOKER, essas escritas
-- rodam com a permissão de quem disparou a alteração no orçamento — que
-- pode perfeitamente ser o próprio Vendedor fechando (ou apenas
-- atualizando) o próprio orçamento.
--
-- A política "alertas_insert_gestores" (só Gerente/Admin) bloqueava esse
-- insert quando quem agia era um Vendedor, o que faria a TRANSAÇÃO INTEIRA
-- falhar por violação de RLS — por exemplo, um Vendedor não conseguiria
-- fechar uma venda sempre que faltasse estoque (o caso em que o alerta
-- deveria justamente ser gerado).
DROP POLICY IF EXISTS "alertas_insert_gestores" ON public.alertas;

CREATE POLICY "alertas_insert" ON public.alertas FOR INSERT TO authenticated
WITH CHECK (
    public.current_is_admin()
    OR id_usuario_destino = public.current_id_usuario()
    OR (
        public.current_perfil() = 'Gerente'
        AND EXISTS (
            SELECT 1 FROM public.usuarios dest
            WHERE dest.id_usuario = alertas.id_usuario_destino
              AND dest.id_loja = ANY(public.current_lojas_permitidas())
        )
    )
);
