DROP FUNCTION IF EXISTS public._tmp_check_priv();
DROP FUNCTION IF EXISTS public._tmp_check_evt();

REVOKE SELECT (cpf_enc, whatsapp_enc, cpf_hash, whatsapp_hash) ON public.clientes FROM authenticated;
REVOKE SELECT (cpf_enc, whatsapp_enc, cpf_hash, whatsapp_hash) ON public.clientes FROM anon;
