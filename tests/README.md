# Testes de integração

Não são testes unitários — eles criam usuários e dados reais (efêmeros,
sempre limpos no `finally`) no projeto Supabase apontado pelo `.env`,
autenticam de verdade e verificam o comportamento de RLS e das Edge
Functions tal como o app usa em produção. Exigem rede e as credenciais em
`.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

Rodar:

```
npm test
```

Cada arquivo `NN-nome.test.js` exporta uma função async que lança (`throw`)
em caso de falha — é assim que `run-all.js` decide se passou. Ao adicionar um
teste novo, siga o padrão: crie os dados no `try`, valide com `assert(...)` e
limpe tudo no `finally`, mesmo se a asserção falhar no meio.

Cobertura atual:

- `01-criar-usuario.test.js` — a Edge Function `criar-usuario` rejeita
  chamada sem autenticação, rejeita não-administrador, e aceita administrador
  real criando um Vendedor.
- `02-rls-clientes-multi-tenant.test.js` — um Vendedor de uma loja não
  consegue ler, via RLS, um cliente cadastrado em outra loja.
- `03-rls-gerente-multi-tenant.test.js` — a fronteira que protege o modelo
  de franquia: um Gerente (franqueado) multi-loja enxerga clientes de todas
  as lojas que possui (via `usuario_lojas`), mas continua sem enxergar a
  loja de outro franqueado.
