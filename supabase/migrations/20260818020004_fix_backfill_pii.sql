-- Corrige o backfill da migration 20260818020002 (não tinha rodado — ver
-- comentário abaixo) e resolve um conflito real encontrado no caminho: havia
-- uma constraint UNIQUE em clientes.cpf (fazia sentido pro valor real —
-- impedir CPF duplicado — mas não faz mais sentido pro valor MASCARADO, já
-- que dois clientes diferentes podem coincidentemente compartilhar os
-- últimos dígitos). Move a unicidade para cpf_hash, que representa o valor
-- real de forma determinística.

DROP FUNCTION IF EXISTS public._tmp_check_unique();

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_cpf_key;

DROP INDEX IF EXISTS public.idx_clientes_cpf_hash;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_cpf_hash_key UNIQUE (cpf_hash);

-- Backfill de verdade: a UPDATE "SET cpf = cpf" da migration anterior era um
-- no-op (o guard "NEW.cpf IS DISTINCT FROM OLD.cpf" do trigger nunca via
-- diferença). Nenhum dado foi perdido — cpf/whatsapp ainda estavam em texto
-- puro. Desliga o trigger por um instante pra fazer a escrita explícita sem
-- ele tentar reprocessar o valor já mascarado que esta própria instrução
-- está gravando.
ALTER TABLE public.clientes DISABLE TRIGGER trg_clientes_criptografar_pii;

UPDATE public.clientes
SET
    cpf_enc = public._pii_encrypt(cpf),
    cpf_hash = public._pii_hash(cpf),
    whatsapp_enc = public._pii_encrypt(whatsapp),
    whatsapp_hash = public._pii_hash(whatsapp),
    cpf = public._mask_documento(cpf),
    whatsapp = public._mask_telefone(whatsapp)
WHERE (cpf IS NOT NULL AND cpf <> '' AND cpf_enc IS NULL)
   OR (whatsapp IS NOT NULL AND whatsapp <> '' AND whatsapp_enc IS NULL);

ALTER TABLE public.clientes ENABLE TRIGGER trg_clientes_criptografar_pii;
