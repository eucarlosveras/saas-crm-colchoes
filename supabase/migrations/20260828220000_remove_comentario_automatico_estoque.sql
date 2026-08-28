-- Remove o comentário automático de baixa/devolução de estoque do
-- "Histórico de Contatos" do orçamento (pedido explícito: esse aviso é
-- operacional/interno, não faz parte do relacionamento com o cliente que
-- essa timeline registra). A auditoria completa de estoque continua
-- existindo — em movimentacoes_estoque, visível no Kardex (clique no nome
-- do produto em Controle de Estoque) — só o INSERT em `comentarios` some.
--
-- O restante do comportamento do trigger (baixa/reversão de estoque no
-- fechamento/reabertura, e o alerta pro vendedor quando a baixa falha por
-- falta de estoque) continua igual, intacto.
CREATE OR REPLACE FUNCTION public.fn_trigger_estoque_orcamento()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_status_antigo TEXT;
    v_status_novo TEXT;
    v_resultado RECORD;
BEGIN

    -- Buscar nomes dos status
    SELECT nome INTO v_status_antigo FROM status_orcamento WHERE id_status = OLD.id_status;
    SELECT nome INTO v_status_novo FROM status_orcamento WHERE id_status = NEW.id_status;

    -- Normalizar para minúsculas
    v_status_antigo := LOWER(COALESCE(v_status_antigo, ''));
    v_status_novo := LOWER(COALESCE(v_status_novo, ''));

    -- ═══════════════════════════════════════════════════════
    -- CASO 1: Orçamento foi FECHADO (venda realizada)
    -- ═══════════════════════════════════════════════════════
    IF v_status_antigo NOT IN ('fechado', 'vendido')
       AND v_status_novo IN ('fechado', 'vendido') THEN

        -- Dar baixa no estoque
        SELECT * INTO v_resultado
        FROM fn_baixa_estoque_por_orcamento(NEW.id_orcamento, NEW.id_usuario);

        -- Se houve erro, gerar alerta (isso continua — é aviso operacional
        -- de verdade, não comentário no histórico do cliente)
        IF NOT v_resultado.sucesso THEN
            INSERT INTO alertas (id_orcamento, id_usuario_destino, tipo, texto, lido)
            VALUES (
                NEW.id_orcamento,
                NEW.id_usuario,
                'alerta',
                '⚠️ Venda fechada mas houve problema no estoque: ' || v_resultado.mensagem,
                FALSE
            );
        END IF;

    -- ═══════════════════════════════════════════════════════
    -- CASO 2: Orçamento foi REABERTO ou PERDIDO após fechado
    -- ═══════════════════════════════════════════════════════
    ELSIF v_status_antigo IN ('fechado', 'vendido')
          AND v_status_novo NOT IN ('fechado', 'vendido') THEN

        -- Verificar se houve baixa anterior
        IF EXISTS (
            SELECT 1 FROM movimentacoes_estoque
            WHERE id_orcamento = NEW.id_orcamento
              AND tipo_movimentacao = 'venda'
        ) THEN
            -- Reverter a baixa
            SELECT * INTO v_resultado
            FROM fn_reverter_baixa_estoque(NEW.id_orcamento, NEW.id_usuario);
        END IF;

    END IF;

    RETURN NEW;

END;
$function$;
