# Modelo de autorização

O sistema tem **dois mecanismos de controle de acesso**, escolhidos conforme
o tipo de operação. Esta página existe para evitar a lacuna que causou o
incidente de `criar-usuario` (ver commit `93d736a`): uma Edge Function com
service role que não usava nenhum dos dois.

## 1. RLS (Postgres) — padrão, use sempre que possível

Quando o frontend chama o PostgREST **diretamente** com o token do usuário
logado (`db.from('tabela')...`, a forma como praticamente toda a aplicação
funciona), quem decide o que cada usuário pode ver/alterar são as políticas
RLS de cada tabela — multi-tenant por `id_loja`, com regras adicionais por
`perfil` (Vendedor só vê o que é seu; Gerente vê a loja; Administrador vê
tudo).

**Use isso por padrão.** É o caminho testado, é onde a maioria das telas já
funciona, e a política fica num lugar só (a migration), não espalhada pelo
código.

## 2. Edge Function com service role — só quando RLS não alcança

Algumas operações não podem ser feitas com o token do usuário porque exigem
privilégios que nenhum usuário comum deveria ter via RLS — o exemplo central
é `criar-usuario`, que precisa criar uma linha em `auth.users` (API
administrativa do Supabase Auth, inacessível via PostgREST).

Nesses casos a function usa a **service role**, que **ignora RLS
completamente**. Isso significa que a Edge Function é 100% responsável pela
própria autorização — não existe uma segunda camada por trás dela. Duas
checagens são obrigatórias, nessa ordem:

1. **Está logado?** — `authGuard(req)` (`supabase/functions/_shared/auth-guard.ts`)
   valida o Bearer token com `auth.getUser()`. Isso garante só que existe uma
   sessão válida — **não** garante nenhum perfil específico.
2. **Tem permissão para fazer isso?** — checagem explícita do `perfil` (e,
   se relevante, `status`) do chamador na tabela `usuarios`, comparando por
   e-mail. **Sempre case-insensitive** (`ilike`, com os curingas `%` e `_`
   escapados) — `auth.getUser()` devolve o e-mail em minúsculas, mas nada no
   sistema garante que o e-mail salvo em `usuarios` esteja em minúsculas.
   Um `eq()` direto falha silenciosamente sempre que o e-mail tiver alguma
   maiúscula (foi exatamente isso que quebrou o primeiro deploy da correção
   de `criar-usuario` nesta sessão).

Ver `supabase/functions/criar-usuario/index.ts` como referência de
implementação dos dois passos.

## Checklist para toda Edge Function nova que use service role

- [ ] Chama `authGuard(req)` e retorna 401 se falhar.
- [ ] Verifica explicitamente o `perfil` do chamador antes de qualquer
      operação privilegiada — nunca assume que "logado" == "autorizado".
- [ ] Comparação de e-mail é case-insensitive.
- [ ] Não loga o corpo bruto da requisição (`console.log(body)`) se ele
      pode conter senha, CPF ou outro dado sensível.
- [ ] O código da function está commitado no git **antes** do deploy —
      nunca `supabase functions deploy` direto de um diretório não versionado.
