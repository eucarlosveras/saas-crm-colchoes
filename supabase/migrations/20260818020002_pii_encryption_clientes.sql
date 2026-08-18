-- ═══════════════════════════════════════════════════════════════════════════
-- Criptografia de dados pessoais (CPF e WhatsApp) — LGPD
--
-- Modelo: cpf/whatsapp continuam existindo como colunas normais em `clientes`
-- (NÃO viraram view — o app usa muito o embedding automático do PostgREST
-- entre orcamentos e clientes, que é frágil com views), mas passam a conter
-- só uma versão MASCARADA por padrão. O valor real fica só em cpf_enc/
-- whatsapp_enc (criptografado com pgcrypto, chave guardada no Supabase
-- Vault). Um trigger intercepta todo INSERT/UPDATE e faz a criptografia +
-- mascaramento automaticamente — o app continua escrevendo cpf/whatsapp
-- normalmente, sem precisar saber que isso existe.
--
-- Busca de duplicado (CPF/telefone já cadastrado) passa a usar um hash
-- determinístico (HMAC-SHA256) em vez do valor em texto puro.
--
-- Telas que precisam do valor completo (ficha do cliente, agenda, kanban,
-- detalhe do orçamento) buscam explicitamente via RPC
-- (rpc_obter_cliente_pii / rpc_obter_whatsapp_lote) — ver mudanças em src/.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public._tmp_check_crypto();

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Chave de criptografia no Vault
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pii_encryption_key') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'pii_encryption_key',
            'Chave simétrica (pgcrypto) para criptografar CPF e WhatsApp de clientes.'
        );
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Funções internas (NÃO concedidas a authenticated/anon — só usadas de
-- dentro de outras funções/triggers deste arquivo).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._pii_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pii_encryption_key';
$$;

CREATE OR REPLACE FUNCTION public._pii_encrypt(p_valor text)
RETURNS bytea LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
    SELECT CASE WHEN p_valor IS NULL OR p_valor = '' THEN NULL
                ELSE extensions.pgp_sym_encrypt(p_valor, public._pii_key())
           END;
$$;

CREATE OR REPLACE FUNCTION public._pii_decrypt(p_valor bytea)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
    SELECT CASE WHEN p_valor IS NULL THEN NULL
                ELSE extensions.pgp_sym_decrypt(p_valor, public._pii_key())
           END;
$$;

-- Hash determinístico (HMAC com a mesma chave) para permitir busca exata
-- (.eq()) sem guardar o valor em texto puro. Normaliza removendo tudo que
-- não é dígito, para "11987654321", "(11) 98765-4321" etc. baterem igual.
CREATE OR REPLACE FUNCTION public._pii_hash(p_valor text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
    SELECT CASE WHEN p_valor IS NULL OR regexp_replace(p_valor, '\D', '', 'g') = '' THEN NULL
                ELSE encode(extensions.hmac(regexp_replace(p_valor, '\D', '', 'g'), public._pii_key(), 'sha256'), 'hex')
           END;
$$;

-- Mascaramento pra exibição padrão (o que qualquer SELECT simples enxerga).
CREATE OR REPLACE FUNCTION public._mask_documento(p_valor text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_digitos text := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
BEGIN
    IF v_digitos = '' THEN RETURN NULL; END IF;
    IF length(v_digitos) = 11 THEN
        RETURN '***.***.' || substring(v_digitos, 7, 3) || '-**';
    END IF;
    -- CNPJ ou outro tamanho: mantém só os 2 últimos dígitos visíveis.
    RETURN repeat('*', greatest(length(v_digitos) - 2, 0)) || right(v_digitos, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public._mask_telefone(p_valor text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_digitos text := regexp_replace(coalesce(p_valor, ''), '\D', '', 'g');
BEGIN
    IF v_digitos = '' THEN RETURN NULL; END IF;
    IF length(v_digitos) >= 10 THEN
        RETURN '(' || left(v_digitos, 2) || ') *****-' || right(v_digitos, 4);
    END IF;
    RETURN repeat('*', greatest(length(v_digitos) - 2, 0)) || right(v_digitos, 2);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Colunas novas em clientes
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS cpf_enc bytea,
    ADD COLUMN IF NOT EXISTS cpf_hash text,
    ADD COLUMN IF NOT EXISTS whatsapp_enc bytea,
    ADD COLUMN IF NOT EXISTS whatsapp_hash text;

CREATE INDEX IF NOT EXISTS idx_clientes_cpf_hash ON public.clientes (cpf_hash);
CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp_hash ON public.clientes (whatsapp_hash);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Trigger: criptografa + mascara transparentemente em todo INSERT/UPDATE
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._trg_clientes_criptografar_pii()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Só reprocessa se o valor mudou (evita recriptografar à toa em updates
    -- que não tocam cpf/whatsapp, e evita re-mascarar um valor que já veio
    -- mascarado de um SELECT anterior reenviado por engano).
    IF NEW.cpf IS NOT NULL AND NEW.cpf <> '' AND (TG_OP = 'INSERT' OR NEW.cpf IS DISTINCT FROM OLD.cpf) THEN
        NEW.cpf_enc := public._pii_encrypt(NEW.cpf);
        NEW.cpf_hash := public._pii_hash(NEW.cpf);
        NEW.cpf := public._mask_documento(NEW.cpf);
    END IF;

    IF NEW.whatsapp IS NOT NULL AND NEW.whatsapp <> '' AND (TG_OP = 'INSERT' OR NEW.whatsapp IS DISTINCT FROM OLD.whatsapp) THEN
        NEW.whatsapp_enc := public._pii_encrypt(NEW.whatsapp);
        NEW.whatsapp_hash := public._pii_hash(NEW.whatsapp);
        NEW.whatsapp := public._mask_telefone(NEW.whatsapp);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_criptografar_pii ON public.clientes;
CREATE TRIGGER trg_clientes_criptografar_pii
    BEFORE INSERT OR UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public._trg_clientes_criptografar_pii();

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Backfill dos dados já existentes (dispara o trigger acima em cada linha)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.clientes
SET cpf = cpf, whatsapp = whatsapp
WHERE (cpf IS NOT NULL AND cpf <> '') OR (whatsapp IS NOT NULL AND whatsapp <> '');

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Proteção extra: authenticated/anon nunca leem as colunas cifradas/hash
-- diretamente (defesa em profundidade — o valor lá é inútil sem a chave do
-- Vault mesmo assim, mas evita que apareçam à toa em `select('*')`).
-- ───────────────────────────────────────────────────────────────────────────
REVOKE SELECT (cpf_enc, whatsapp_enc, cpf_hash, whatsapp_hash) ON public.clientes FROM authenticated, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: valor completo de UM cliente (ficha, modal de edição). Reimplementa
-- a mesma regra de visibilidade de "clientes_select" (RLS) explicitamente,
-- porque precisa ser SECURITY DEFINER pra ter acesso à chave do Vault — se
-- mudar a regra de quem pode ver um cliente, atualizar aqui também.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_obter_cliente_pii(p_id_cliente uuid)
RETURNS TABLE (cpf text, whatsapp text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT (
        public.current_is_admin()
        OR EXISTS (
            SELECT 1 FROM public.orcamentos o
            JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
            WHERE o.id_cliente = p_id_cliente
              AND (
                  o.id_usuario = public.current_id_usuario()
                  OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
              )
        )
    ) THEN
        RETURN; -- sem acesso a este cliente: nenhuma linha, sem erro (mesmo comportamento de RLS)
    END IF;

    RETURN QUERY
    SELECT public._pii_decrypt(c.cpf_enc), public._pii_decrypt(c.whatsapp_enc)
    FROM public.clientes c
    WHERE c.id_cliente = p_id_cliente;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_obter_cliente_pii TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RPC: WhatsApp completo de VÁRIOS clientes de uma vez (agenda, kanban —
-- evita N chamadas). Mesma regra de visibilidade, aplicada por linha.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_obter_whatsapp_lote(p_ids_cliente uuid[])
RETURNS TABLE (id_cliente uuid, whatsapp text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT c.id_cliente, public._pii_decrypt(c.whatsapp_enc)
    FROM public.clientes c
    WHERE c.id_cliente = ANY(p_ids_cliente)
      AND (
          public.current_is_admin()
          OR EXISTS (
              SELECT 1 FROM public.orcamentos o
              JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
              WHERE o.id_cliente = c.id_cliente
                AND (
                    o.id_usuario = public.current_id_usuario()
                    OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas()))
                )
          )
      );
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_obter_whatsapp_lote TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) RPC: busca cliente por CPF/telefone (detecção de duplicado). Substitui
-- os antigos `.eq('cpf', cpf)` / `.eq('whatsapp', telefone)` do front-end.
-- Mantém o mesmo escopo de visibilidade que já existia (via RLS) antes desta
-- migration — ou seja, Vendedor só descobre duplicado dentro do que já
-- enxerga, Gerente só na própria loja, Admin em tudo.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_buscar_cliente_por_documento(
    p_cpf text,
    p_whatsapp text DEFAULT NULL,
    p_excluir_id uuid DEFAULT NULL
)
RETURNS TABLE (id_cliente uuid, nome_cliente text, tipo_match text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_hash_cpf text := public._pii_hash(p_cpf);
    v_hash_tel text := public._pii_hash(p_whatsapp);
BEGIN
    RETURN QUERY
    SELECT c.id_cliente, c.nome_cliente, 'cpf'::text
    FROM public.clientes c
    WHERE v_hash_cpf IS NOT NULL
      AND c.cpf_hash = v_hash_cpf
      AND (p_excluir_id IS NULL OR c.id_cliente <> p_excluir_id)
      AND (
          public.current_is_admin()
          OR EXISTS (
              SELECT 1 FROM public.orcamentos o
              JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
              WHERE o.id_cliente = c.id_cliente
                AND (o.id_usuario = public.current_id_usuario()
                     OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas())))
          )
      )
    LIMIT 1;

    IF NOT FOUND AND v_hash_tel IS NOT NULL THEN
        RETURN QUERY
        SELECT c.id_cliente, c.nome_cliente, 'whatsapp'::text
        FROM public.clientes c
        WHERE c.whatsapp_hash = v_hash_tel
          AND (v_hash_cpf IS NULL OR c.cpf_hash IS DISTINCT FROM v_hash_cpf)
          AND (p_excluir_id IS NULL OR c.id_cliente <> p_excluir_id)
          AND (
              public.current_is_admin()
              OR EXISTS (
                  SELECT 1 FROM public.orcamentos o
                  JOIN public.usuarios ou ON ou.id_usuario = o.id_usuario
                  WHERE o.id_cliente = c.id_cliente
                    AND (o.id_usuario = public.current_id_usuario()
                         OR (public.current_perfil() = 'Gerente' AND ou.id_loja = ANY(public.current_lojas_permitidas())))
              )
          )
        LIMIT 1;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_buscar_cliente_por_documento TO authenticated;

COMMENT ON COLUMN public.clientes.cpf IS 'Valor MASCARADO (ex: ***.***.789-**) — automaticamente preenchido pelo trigger a partir do valor real digitado. O valor completo fica em cpf_enc (criptografado); use rpc_obter_cliente_pii() para lê-lo.';
COMMENT ON COLUMN public.clientes.whatsapp IS 'Valor MASCARADO (ex: (11) *****-4321) — automaticamente preenchido pelo trigger. Valor completo em whatsapp_enc; use rpc_obter_cliente_pii()/rpc_obter_whatsapp_lote().';
