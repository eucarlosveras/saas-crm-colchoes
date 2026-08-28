-- Liga "Novo Orçamento" ao estoque de verdade. Até aqui rpc_salvar_orcamento
-- só gravava o texto livre em orcamentos.modelo_colchao — a tabela
-- itens_orcamento (produto + quantidade estruturados) nunca era populada,
-- então o trigger de baixa automática de estoque no fechamento da venda
-- (fn_trigger_estoque_orcamento / fn_baixa_estoque_por_orcamento, ambos já
-- existentes) sempre rodava sobre ZERO itens — "baixa" que nunca baixava
-- nada de verdade, silenciosamente.
--
-- Novo parâmetro p_itens (jsonb, DEFAULT NULL — não quebra nenhuma chamada
-- existente que não o envie): array de {id_produto, quantidade,
-- preco_praticado}. id_produto pode vir NULL — item digitado que não bate
-- com nenhum código do catálogo (ex: "Frete", "Instalação") continua
-- registrado em itens_orcamento pra histórico, só não participa da baixa de
-- estoque (o JOIN em fn_baixa_estoque_por_orcamento é INNER com produtos,
-- ignora id_produto nulo — comportamento certo, não é item físico).
CREATE OR REPLACE FUNCTION public.rpc_salvar_orcamento(
    p_id_cliente uuid, p_nome_cliente text, p_cpf text, p_whatsapp text, p_email text,
    p_id_usuario_cadastro uuid, p_id_usuario uuid, p_id_status uuid, p_id_nivel_interesse uuid,
    p_valor_orcado numeric, p_modelo_colchao text, p_data_criacao timestamp with time zone,
    p_data_contato date, p_hora_contato time without time zone, p_observacao_agendamento text,
    p_observacoes text, p_origem text, p_itens jsonb DEFAULT NULL
)
RETURNS TABLE(id_orcamento uuid, protocolo text, id_cliente uuid)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id_cliente uuid := p_id_cliente;
    v_ultimo_codigo text;
    v_ultimo_num int;
    v_novo_codigo text;
    v_out_id_orcamento uuid;
    v_out_protocolo text;
    v_item jsonb;
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

    IF p_itens IS NOT NULL THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
        LOOP
            INSERT INTO public.itens_orcamento (id_orcamento, id_produto, quantidade, preco_praticado)
            VALUES (
                v_out_id_orcamento,
                NULLIF(v_item->>'id_produto', '')::uuid,
                GREATEST(1, COALESCE((v_item->>'quantidade')::int, 1)),
                COALESCE((v_item->>'preco_praticado')::numeric, 0)
            );
        END LOOP;
    END IF;

    RETURN QUERY SELECT v_out_id_orcamento, v_out_protocolo, v_id_cliente;
END;
$function$;
