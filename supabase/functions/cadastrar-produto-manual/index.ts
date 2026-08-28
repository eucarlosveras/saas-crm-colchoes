// cadastrar-produto-manual — cadastro manual de UM produto no estoque
// (modal "Adicionar Produto ao Estoque"). Existe como function (não é um
// insert direto do cliente) só por causa do catálogo compartilhado: RLS de
// `produtos` só libera leitura pra authenticated, nunca insert — criar
// produto novo precisa de service role, mesma razão que importar-estoque e
// importar-estoque-nf já são functions.
//
// Categoria vem PRONTA do cliente (o usuário já escolheu no formulário,
// com sugestão automática — ver inferirCategoriaPorNome do lado do
// front-end em src/estoque.js) — esta function não infere nada, só valida
// que a categoria existe.
//
// Gerente só cadastra na própria loja; Administrador em qualquer uma.
// Segue o checklist de docs/AUTORIZACAO.md: authGuard + checagem explícita
// de permissão, e-mail case-insensitive.
import { authGuard } from '../_shared/auth-guard.ts';
import { getAdminClient } from '../_shared/supabase-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

const QUALIDADES_VALIDAS = ['novo', 'mostruario', 'avaria'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await authGuard(req);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const body = await req.json();
    const idLoja = body.idLoja;
    const codigo = String(body.codigo || '').trim();
    const nome = String(body.nome || '').trim();
    const categoriaId = Number.parseInt(String(body.categoriaId ?? ''), 10);
    const qualidade = String(body.qualidade || '').trim().toLowerCase();
    const qtdInicial = Number.parseInt(String(body.qtdInicial ?? '0'), 10) || 0;
    const arquivoPath = body.arquivoPath ? String(body.arquivoPath) : null;

    if (!idLoja) return json({ error: 'idLoja obrigatório.' }, 400);
    if (!codigo || !nome) return json({ error: 'Preencha código e nome do produto.' }, 400);
    if (!Number.isFinite(categoriaId)) return json({ error: 'Categoria inválida.' }, 400);
    if (!QUALIDADES_VALIDAS.includes(qualidade)) return json({ error: 'Qualidade inválida.' }, 400);
    if (qtdInicial < 0) return json({ error: 'Quantidade inválida.' }, 400);

    const admin = getAdminClient();
    const emailChamadorEscapado = auth.user.email.replace(/[%_\\]/g, (m: string) => '\\' + m);

    const { data: chamador, error: erroChamador } = await admin
      .from('usuarios')
      .select('id_usuario, perfil, status, id_loja')
      .ilike('email', emailChamadorEscapado)
      .single();
    if (erroChamador || !chamador || chamador.status !== 'Ativo') {
      return json({ error: 'Usuário não encontrado ou inativo.' }, 403);
    }

    const isAdmin = chamador.perfil === 'Administrador' || chamador.perfil === 'Admin';
    const isGerente = chamador.perfil === 'Gerente';
    if (!isAdmin && !isGerente) {
      return json({ error: 'Sem permissão para cadastrar produtos no estoque.' }, 403);
    }

    if (!isAdmin) {
      let autorizadoNaLoja = chamador.id_loja === idLoja;
      if (!autorizadoNaLoja) {
        const { data: vinculo } = await admin
          .from('usuario_lojas')
          .select('id_loja')
          .eq('id_usuario', chamador.id_usuario)
          .eq('id_loja', idLoja)
          .maybeSingle();
        autorizadoNaLoja = !!vinculo;
      }
      if (!autorizadoNaLoja) {
        return json({ error: 'Você só pode cadastrar produtos na(s) sua(s) própria(s) loja(s).' }, 403);
      }
    }

    const { data: categoria, error: erroCategoria } = await admin.from('categorias').select('id').eq('id', categoriaId).maybeSingle();
    if (erroCategoria) throw erroCategoria;
    if (!categoria) return json({ error: 'Categoria não encontrada.' }, 404);

    // Resolve o produto no catálogo compartilhado: reaproveita se o código já
    // existe, cria se não — mesma filosofia do CSV/Nota Fiscal.
    let idProduto: string;
    const { data: produtoExistente, error: erroBuscaProduto } = await admin
      .from('produtos').select('id_produto').ilike('codigo', codigo.replace(/[%_\\]/g, (m) => '\\' + m)).maybeSingle();
    if (erroBuscaProduto) throw erroBuscaProduto;

    if (produtoExistente) {
      idProduto = produtoExistente.id_produto;
    } else {
      const { data: produtoCriado, error: erroCriarProduto } = await admin
        .from('produtos').insert([{ codigo, nome_produto: nome }]).select('id_produto').single();
      if (erroCriarProduto) throw erroCriarProduto;
      idProduto = produtoCriado!.id_produto;
    }

    const { data: novoEstoque, error: erroEstoque } = await admin.from('estoque').insert([{
      codigo_produto: codigo, nome_produto: nome, categoria_id: categoriaId,
      id_produto: idProduto, qualidade, qtd_disponivel: qtdInicial,
      status: 'Ativo', id_loja: idLoja,
    }]).select('id').single();

    if (erroEstoque) {
      if ((erroEstoque as { code?: string }).code === '23505') {
        return json({ error: 'Este produto já está cadastrado nesta loja com essa qualidade.' }, 400);
      }
      throw erroEstoque;
    }

    // Movimentação de entrada — sem isso o cadastro manual não aparecia no
    // Kardex (o fluxo antigo só gravava em `estoque`). É aqui que o anexo
    // (se houver) fica vinculado, pro Kardex mostrar o link.
    if (qtdInicial > 0) {
      const { error: erroMov } = await admin.from('movimentacoes_estoque').insert([{
        id_estoque: novoEstoque!.id, id_usuario: chamador.id_usuario, tipo_movimentacao: 'entrada',
        quantidade: qtdInicial, qtd_anterior_disponivel: 0, qtd_nova_disponivel: qtdInicial,
        observacao: 'Cadastro manual de produto', arquivo_anexo_path: arquivoPath,
      }]);
      if (erroMov) console.error('Falha ao registrar movimentação do cadastro manual:', erroMov.message);
    }

    return json({ success: true, id_estoque: novoEstoque!.id });
  } catch (err) {
    console.error('Erro em cadastrar-produto-manual:', err);
    return json({ error: (err as Error).message || 'Erro ao cadastrar produto.' }, 400);
  }
});
