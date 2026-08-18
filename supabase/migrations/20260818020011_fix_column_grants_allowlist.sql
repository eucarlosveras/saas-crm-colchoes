-- A tentativa anterior de REVOKE só das colunas cpf_enc/whatsapp_enc/
-- cpf_hash/whatsapp_hash não "colou" (testado e confirmado com usuário
-- real: authenticated ainda conseguia ler cpf_enc). Troca de estratégia:
-- em vez de tentar excluir colunas específicas de um GRANT de tabela
-- inteira, revoga tudo e concede explicitamente só as colunas permitidas
-- (allowlist) — sem ambiguidade.

DROP FUNCTION IF EXISTS public._tmp_check_owner();

REVOKE SELECT ON public.clientes FROM authenticated, anon;

GRANT SELECT (
    id_cliente, nome_cliente, whatsapp, criado_em, cpf, email,
    id_cliente_codigo, id_usuario, id_loja, id_usuario_cadastro,
    data_criacao, deleted_at, updated_at
) ON public.clientes TO authenticated, anon;
