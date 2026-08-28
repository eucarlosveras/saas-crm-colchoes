-- Corrige a granularidade de unicidade do estoque, que ficou errada desde
-- antes do multi-loja existir.
--
-- estoque_codigo_produto_key era UNIQUE(codigo_produto) GLOBAL (plataforma
-- inteira). Isso trava dois problemas reais:
--   1) Duas lojas diferentes nunca podem estocar o mesmo modelo de colchão
--      (o catálogo em `produtos` é compartilhado — é o caso comum, não a
--      exceção). A segunda loja recebe "Já existe um produto com este
--      código cadastrado" e não consegue cadastrar o próprio estoque.
--   2) Mesmo dentro de UMA loja só, nunca dava pra ter o mesmo modelo em
--      duas qualidades (Novo + Mostruário) como linhas separadas.
--
-- A granularidade certa de "produto em estoque" é (loja, produto,
-- qualidade) — é isso que garante uma linha própria com sua própria
-- qtd_disponivel/qtd_reservada.
--
-- Seguro migrar agora: hoje só existe 1 loja usando estoque ativamente, e a
-- constraint antiga já impossibilitava qualquer duplicata (a nova
-- constraint é estritamente MAIS permissiva, nunca falha por causa de dado
-- existente).
ALTER TABLE public.estoque DROP CONSTRAINT estoque_codigo_produto_key;

-- COALESCE na qualidade: a coluna aceita NULL, e UNIQUE trata NULLs como
-- distintos entre si por padrão — duas linhas com qualidade NULL na mesma
-- loja/produto não colidiriam sem isso, reabrindo o mesmo bug por outro
-- caminho.
CREATE UNIQUE INDEX estoque_loja_codigo_qualidade_key
    ON public.estoque (id_loja, codigo_produto, COALESCE(qualidade, ''));

COMMENT ON INDEX public.estoque_loja_codigo_qualidade_key IS
    'Um produto (código) só aparece uma vez por loja e por qualidade — não mais uma vez na plataforma inteira.';
