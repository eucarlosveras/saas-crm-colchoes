# saas-crm-colchoes

CRM de vendas (colchões) — SPA em JavaScript puro (sem framework de UI), Supabase como backend, build com Vite.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha com suas credenciais do Supabase
npm run dev             # http://localhost:5173
```

- `npm run build` — gera o build de produção em `dist/`.
- `npm run preview` — serve o build de produção localmente, para testar antes de publicar.

## Arquitetura

O front-end é dividido em módulos ES6 dentro de `src/`, um por área de domínio:

| Módulo | Responsabilidade |
|---|---|
| `state.js` | Estado global da aplicação (`AppState`, `store`) e seus guardiões/getters |
| `supabaseClient.js` | Cliente do Supabase (`db`), credenciais via `import.meta.env` |
| `constants.js` | Constantes compartilhadas (status, limites, etc.) |
| `utils.js` | Funções puras (datas, formatação, helpers de string) |
| `ui.js` | Toast, modais, loader, tema, FAB |
| `router.js` | `navigateTo` — roteamento entre as telas |
| `auth.js` | Login, sessão, logout, permissões |
| `dashboard.js` | KPIs e tela inicial |
| `carteira.js` | Carteira de negociações (tabela, kanban, drag & drop, exportação) |
| `filtros.js` | Filtros de loja/vendedor/mês/dia reutilizados entre telas |
| `orcamentos.js` | Ciclo de vida do orçamento (criar, ajustar, fechar, perder, agendar) |
| `clientes.js` | Listagem e ficha de clientes |
| `comentarios.js` | Timeline de comentários de um orçamento |
| `metas.js` | Metas de vendedores/lojas |
| `usuarios.js` | Administração de usuários |
| `estoque.js` | Módulo de estoque |
| `agenda.js` | Agenda do dia |
| `radar.js` | Meu Radar + assistente de IA |
| `main.js` | Ponto de entrada: bootstrap e exposição de funções em `window` para os `onclick` inline do HTML |

`index.html`/`style.css` continuam como HTML/CSS "puros"; as telas internas são strings de template renderizadas dinamicamente em `#mainContent` pelas funções `render*` de cada módulo.

## Banco de dados

Migrations do Supabase em `supabase/migrations/`. Operações críticas com múltiplas escritas (salvar orçamento, fechar venda, marcar perda) usam funções Postgres (RPC) para garantir atomicidade — ver o SQL nas migrations mais recentes. Isolamento multi-tenant (por loja) reforçado via Row Level Security em todas as tabelas.

Dicionário de dados completo (tabelas, colunas, relacionamentos, views, triggers, RLS): [docs/DATABASE.md](docs/DATABASE.md).

## Deploy

Publicado no GitHub Pages via `.github/workflows/deploy-pages.yml`: a cada push em `main`, o workflow builda com Vite (injetando as credenciais dos *Secrets* do repositório) e publica `dist/`.
