-- Encapsula operações multi-step críticas em funções Postgres (RPC via Supabase)
-- para garantir atomicidade.
--
-- Por que isso resolve o problema: uma função PL/pgSQL roda inteira dentro da
-- transação implícita da chamada que a invoca. Se qualquer INSERT/UPDATE dentro
-- dela levantar uma exceção, TODAS as escritas feitas até ali nessa mesma
-- chamada são revertidas automaticamente — não é permitido (nem necessário)
-- usar BEGIN/COMMIT/ROLLBACK explícitos dentro do corpo da função; é assim que
-- o Postgres garante a atomicidade que o BEGIN/COMMIT/ROLLBACK manual daria.
--
-- Antes: o app.js fazia 2-3 chamadas separadas ao PostgREST (insert cliente,
-- depois insert orçamento; ou update orçamento, depois update agendamento,
-- depois insert comentário). Se a conexão caísse ou desse erro no meio,
-- ficava em estado inconsistente (cliente sem orçamento, orçamento fechado
-- sem o comentário/agendamento correspondente, etc).
-- Depois: cada fluxo crítico é 1 única chamada RPC = 1 única transação.

-- ═══════════════════════════════════════════════════════════════
-- 1) Salvar orçamento (cria cliente se necessário + insere orçamento)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_salvar_orcamento(
    p_id_cliente uuid,              -- se já existe, informe o id; se NULL, a função cria o cliente
    p_nome_cliente text,
    p_cpf text,
    p_whatsapp text,
    p_email text,
    p_id_usuario_cadastro uuid,
    p_id_usuario uuid,
    p_id_status uuid,
    p_id_nivel_interesse uuid,
    p_valor_orcado numeric,
    p_modelo_colchao text,
    p_data_criacao timestamptz,
    p_data_contato date,
    p_hora_contato time,
    p_observacao_agendamento text,
    p_observacoes text,
    p_origem text
)
RETURNS TABLE (id_orcamento uuid, protocolo text, id_cliente uuid)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_id_cliente uuid := p_id_cliente;
    v_ultimo_codigo text;
    v_ultimo_num int;
    v_novo_codigo text;
    v_out_id_orcamento uuid;
    v_out_protocolo text;
BEGIN
    IF v_id_cliente IS NULL THEN
        -- Trava consultiva (só dentro desta transação) para impedir que duas
        -- chamadas concorrentes gerem o mesmo próximo código de cliente.
        PERFORM pg_advisory_xact_lock(hashtext('clientes_id_cliente_codigo'));

        SELECT id_cliente_codigo INTO v_ultimo_codigo
        FROM public.clientes
        WHERE id_cliente_codigo IS NOT NULL
        ORDER BY id_cliente_codigo DESC
        LIMIT 1;

        v_ultimo_num := COALESCE(NULLIF(regexp_replace(COALESCE(v_ultimo_codigo, ''), '\D', '', 'g'), '')::int, 0);
        v_novo_codigo := 'CLI-' || lpad((v_ultimo_num + 1)::text, 6, '0');

        INSERT INTO public.clientes (nome_cliente, whatsapp, cpf, email, id_cliente_codigo, id_usuario_cadastro)
        VALUES (p_nome_cliente, p_whatsapp, NULLIF(p_cpf, ''), NULLIF(p_email, ''), v_novo_codigo, p_id_usuario_cadastro)
        RETURNING clientes.id_cliente INTO v_id_cliente;
    END IF;

    INSERT INTO public.orcamentos (
        id_cliente, id_usuario, id_status, id_nivel_interesse, valor_orcado,
        modelo_colchao, data_criacao, data_contato, hora_contato,
        observacao_agendamento, observacoes, origem
    ) VALUES (
        v_id_cliente, p_id_usuario, p_id_status, p_id_nivel_interesse, p_valor_orcado,
        p_modelo_colchao, p_data_criacao, p_data_contato, p_hora_contato,
        p_observacao_agendamento, p_observacoes, p_origem
    )
    RETURNING orcamentos.id_orcamento, orcamentos.protocolo INTO v_out_id_orcamento, v_out_protocolo;

    RETURN QUERY SELECT v_out_id_orcamento, v_out_protocolo, v_id_cliente;
END;
$$;

COMMENT ON FUNCTION public.rpc_salvar_orcamento IS
    'Cria cliente (se necessário) + orçamento em uma única transação atômica.';

-- ═══════════════════════════════════════════════════════════════
-- 2) Confirmar fechamento (fecha orçamento + agendamento de entrega + comentário)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_confirmar_fechamento_orcamento(
    p_id_orcamento uuid,
    p_id_status_fechado uuid,
    p_data_entrega date,     -- NULL quando o modo for "retirada na loja"
    p_autor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_texto_comentario text;
BEGIN
    UPDATE public.orcamentos
    SET id_status = p_id_status_fechado,
        data_fechamento = now(),
        data_entrega = COALESCE(p_data_entrega, data_entrega)
    WHERE id_orcamento = p_id_orcamento;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orçamento % não encontrado', p_id_orcamento;
    END IF;

    IF p_data_entrega IS NOT NULL THEN
        UPDATE public.orcamentos
        SET data_contato = p_data_entrega,
            hora_contato = '09:00',
            observacao_agendamento = 'Confirmação de recebimento - ' || to_char(p_data_entrega, 'DD/MM/YYYY')
        WHERE id_orcamento = p_id_orcamento;

        v_texto_comentario := 'Agendamento automático criado: Confirmação de recebimento para '
            || to_char(p_data_entrega, 'DD/MM/YYYY') || ' às 09:00.';

        INSERT INTO public.comentarios (id_orcamento, texto, tipo, autor)
        VALUES (p_id_orcamento, v_texto_comentario, 'Sistema', p_autor);
    END IF;
END;
$$;

COMMENT ON FUNCTION public.rpc_confirmar_fechamento_orcamento IS
    'Fecha o orçamento e, se for entrega, cria o agendamento de confirmação de recebimento e o comentário — tudo em uma única transação atômica.';

-- ═══════════════════════════════════════════════════════════════
-- 3) Confirmar perda (marca orçamento como perdido + comentário)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_confirmar_perda_orcamento(
    p_id_orcamento uuid,
    p_id_status_perdido uuid,
    p_motivo text,
    p_motivo_detalhes text,
    p_autor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_comentario text;
BEGIN
    UPDATE public.orcamentos
    SET id_status = p_id_status_perdido,
        data_fechamento = now(),
        motivo_perda = p_motivo
    WHERE id_orcamento = p_id_orcamento;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Orçamento % não encontrado', p_id_orcamento;
    END IF;

    v_comentario := 'Venda perdida. Motivo: ' || p_motivo
        || CASE WHEN p_motivo_detalhes IS NOT NULL AND p_motivo_detalhes <> ''
                THEN ' - Detalhes: ' || p_motivo_detalhes ELSE '' END;

    INSERT INTO public.comentarios (id_orcamento, texto, tipo, autor)
    VALUES (p_id_orcamento, v_comentario, 'Perda', p_autor);
END;
$$;

COMMENT ON FUNCTION public.rpc_confirmar_perda_orcamento IS
    'Marca o orçamento como perdido e registra o comentário do motivo — tudo em uma única transação atômica.';

-- ═══════════════════════════════════════════════════════════════
-- Permissões: os usuários logados (role "authenticated") precisam poder
-- chamar essas funções via RPC. SECURITY INVOKER mantém as RLS policies
-- existentes das tabelas (não eleva privilégio).
-- ═══════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.rpc_salvar_orcamento TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirmar_fechamento_orcamento TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirmar_perda_orcamento TO authenticated;
