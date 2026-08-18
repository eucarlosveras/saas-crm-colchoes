-- Remove as funções de diagnóstico temporárias usadas para investigar o
-- comportamento de auth.email()/auth.jwt() durante o teste rigoroso do RLS
-- multi-tenant. Não fazem parte do schema permanente da aplicação.
DROP FUNCTION IF EXISTS public._tmp_auth_diag();
DROP FUNCTION IF EXISTS public._tmp_auth_diag3();
