// importar-estoque — cada loja sobe a própria lista de produtos (CSV, já
// parseado no front-end pra { codigo, nome, categoria, qualidade,
// quantidade }[]) e o sistema lê, criando/atualizando o estoque DAQUELA
// loja. Modo mesclagem: só toca nos códigos que vierem na lista — o resto
// do estoque da loja continua intacto (decisão explícita do dono do
// produto, ver commit). Reenviar a mesma lista atualiza a quantidade pro
// valor informado (não soma) — é uma "foto" do estoque atual da loja pra
// aquele código, não um lançamento incremental.
//
// Se o código do produto ainda não existe no catálogo compartilhado
// (`produtos`) ou a categoria não existe (`categorias`), a function cria os
// dois na hora — decisão explícita: onboarding de loja nova precisa ser
// self-service, sem depender do Administrador aprovar item por item.
//
// Gerente só importa pra própria loja; Administrador importa pra qualquer
// uma. Segue o checklist de docs/AUTORIZACAO.md: authGuard + checagem
// explícita de permissão, e-mail case-insensitive.
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

const MAX_ITENS = 5000;
const CATEGORIA_PADRAO = 'Outros';

const MAPA_QUALIDADE: Record<string, string> = {
  novo: 'novo', new: 'novo', '': 'novo',
  mostruario: 'mostruario', mostruário: 'mostruario', 'mostruario(a)': 'mostruario',
  avaria: 'avaria', avariado: 'avaria',
};

function normalizarQualidade(valor: string): string {
  const v = (valor || '').trim().toLowerCase();
  return MAPA_QUALIDADE[v] || 'novo';
}

// Concorrência limitada em vez de sequencial puro (mais rápido pra listas
// grandes) e em vez de Promise.all sem limite (evita abrir centenas de
// conexões de uma vez). Chunks pequenos, sem dependência externa.
async function emLotes<T, R>(itens: T[], tamanhoLote: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < itens.length; i += tamanhoLote) {
    const lote = itens.slice(i, i + tamanhoLote);
    resultados.push(...await Promise.all(lote.map(fn)));
  }
  return resultados;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await authGuard(req);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const body = await req.json();
    const idLoja = body.idLoja;
    const itensBrutos = Array.isArray(body.itens) ? body.itens : [];
    console.log('Importação de estoque solicitada por', auth.user.email, '-> loja:', idLoja, '- itens:', itensBrutos.length);

    if (!idLoja) return json({ error: 'idLoja obrigatório.' }, 400);
    if (itensBrutos.length === 0) return json({ error: 'Lista vazia — nada para importar.' }, 400);
    if (itensBrutos.length > MAX_ITENS) return json({ error: `Lista muito grande (máx. ${MAX_ITENS} itens por importação).` }, 400);

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
      return json({ error: 'Sem permissão para importar estoque.' }, 403);
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
        return json({ error: 'Você só pode importar estoque para a(s) sua(s) própria(s) loja(s).' }, 403);
      }
    }

    const { data: loja, error: erroLoja } = await admin.from('lojas').select('id_loja').eq('id_loja', idLoja).maybeSingle();
    if (erroLoja) throw erroLoja;
    if (!loja) return json({ error: 'Loja não encontrada.' }, 404);

    // 1) Normaliza e valida cada linha antes de tocar no banco.
    const linhas: Array<{ codigo: string; nome: string; categoria: string; qualidade: string; quantidade: number }> = [];
    const erros: string[] = [];
    itensBrutos.forEach((item: any, i: number) => {
      const codigo = String(item?.codigo || '').trim();
      const nome = String(item?.nome || '').trim();
      const categoria = String(item?.categoria || '').trim();
      const quantidadeNum = Number.parseInt(String(item?.quantidade ?? '').trim(), 10);

      if (!codigo || !nome) {
        erros.push(`Linha ${i + 2}: código ou nome vazio — ignorada.`);
        return;
      }
      if (!Number.isFinite(quantidadeNum) || quantidadeNum < 0) {
        erros.push(`Linha ${i + 2} (${codigo}): quantidade inválida — ignorada.`);
        return;
      }
      linhas.push({ codigo, nome, categoria, qualidade: normalizarQualidade(item?.qualidade), quantidade: quantidadeNum });
    });

    if (linhas.length === 0) {
      return json({ error: 'Nenhuma linha válida na lista.', erros }, 400);
    }

    // 2) Carrega o que já existe de uma vez (evita 1 query por linha).
    const codigosUnicos = [...new Set(linhas.map(l => l.codigo))];
    const { data: produtosExistentes } = await admin.from('produtos').select('id_produto, codigo').in('codigo', codigosUnicos);
    const mapaProdutos = new Map((produtosExistentes || []).map(p => [p.codigo.toLowerCase(), p]));

    const { data: categoriasExistentes } = await admin.from('categorias').select('id, nome');
    const mapaCategorias = new Map((categoriasExistentes || []).map(c => [c.nome.toLowerCase(), c]));

    const { data: estoqueExistente } = await admin.from('estoque').select('id, codigo_produto, qualidade, qtd_disponivel').eq('id_loja', idLoja);
    const mapaEstoque = new Map((estoqueExistente || []).map(e => [`${e.codigo_produto.toLowerCase()}|${(e.qualidade || '').toLowerCase()}`, e]));

    // 3) Cria produtos e categorias que faltam no catálogo compartilhado.
    const codigosFaltando = codigosUnicos.filter(c => !mapaProdutos.has(c.toLowerCase()));
    if (codigosFaltando.length > 0) {
      const primeiraOcorrencia = new Map(linhas.map(l => [l.codigo, l.nome]));
      const novosProdutos = codigosFaltando.map(codigo => ({ codigo, nome_produto: primeiraOcorrencia.get(codigo) || codigo }));
      const { data: criados, error: erroProdutos } = await admin.from('produtos').insert(novosProdutos).select('id_produto, codigo');
      if (erroProdutos) throw erroProdutos;
      (criados || []).forEach(p => mapaProdutos.set(p.codigo.toLowerCase(), p));
    }

    const categoriasNecessarias = new Set(linhas.map(l => (l.categoria || CATEGORIA_PADRAO)));
    const categoriasFaltando = [...categoriasNecessarias].filter(c => !mapaCategorias.has(c.toLowerCase()));
    if (categoriasFaltando.length > 0) {
      const { data: criadas, error: erroCategorias } = await admin.from('categorias').insert(categoriasFaltando.map(nome => ({ nome }))).select('id, nome');
      if (erroCategorias) throw erroCategorias;
      (criadas || []).forEach(c => mapaCategorias.set(c.nome.toLowerCase(), c));
    }

    // 4) Aplica cada linha: atualiza se já existe (loja+código+qualidade), cria se não.
    let criadosCount = 0;
    let atualizadosCount = 0;
    const errosAplicacao: string[] = [];

    await emLotes(linhas, 10, async (linha) => {
      try {
        const produto = mapaProdutos.get(linha.codigo.toLowerCase());
        const categoria = mapaCategorias.get((linha.categoria || CATEGORIA_PADRAO).toLowerCase());
        const chave = `${linha.codigo.toLowerCase()}|${linha.qualidade}`;
        const existente = mapaEstoque.get(chave);

        if (existente) {
          const { error } = await admin.from('estoque').update({
            qtd_disponivel: linha.quantidade,
            nome_produto: linha.nome,
            categoria_id: categoria?.id,
            id_produto: produto?.id_produto,
            status: 'Ativo',
          }).eq('id', existente.id);
          if (error) throw error;

          if (existente.qtd_disponivel !== linha.quantidade) {
            // 'tipo_movimentacao' tem CHECK no banco com uma lista fechada de valores
            // (não inclui nada tipo 'importacao') — sem checar o erro aqui, uma
            // violação da constraint falha CALADA e a auditoria fica furada sem
            // ninguém perceber (já aconteceu: o teste E2E pegou isso).
            const { error: erroMov } = await admin.from('movimentacoes_estoque').insert([{
              id_estoque: existente.id, id_usuario: chamador.id_usuario, tipo_movimentacao: 'ajuste',
              quantidade: linha.quantidade - existente.qtd_disponivel,
              qtd_anterior_disponivel: existente.qtd_disponivel, qtd_nova_disponivel: linha.quantidade,
              observacao: 'Atualizado por importação em lote',
            }]);
            if (erroMov) console.error('Falha ao registrar movimentação de ajuste:', erroMov.message);
          }
          atualizadosCount++;
        } else {
          const { data: novo, error } = await admin.from('estoque').insert([{
            codigo_produto: linha.codigo, nome_produto: linha.nome, categoria_id: categoria?.id,
            id_produto: produto?.id_produto, qualidade: linha.qualidade, qtd_disponivel: linha.quantidade,
            status: 'Ativo', id_loja: idLoja,
          }]).select('id').single();
          if (error) throw error;

          const { error: erroMovNova } = await admin.from('movimentacoes_estoque').insert([{
            id_estoque: novo!.id, id_usuario: chamador.id_usuario, tipo_movimentacao: 'entrada',
            quantidade: linha.quantidade, qtd_anterior_disponivel: 0, qtd_nova_disponivel: linha.quantidade,
            observacao: 'Criado por importação em lote',
          }]);
          if (erroMovNova) console.error('Falha ao registrar movimentação de entrada:', erroMovNova.message);
          criadosCount++;
        }
      } catch (e) {
        errosAplicacao.push(`Código ${linha.codigo}: ${(e as Error).message}`);
      }
    });

    return json({
      success: true,
      criados: criadosCount,
      atualizados: atualizadosCount,
      produtosNovosCriados: codigosFaltando.length,
      categoriasNovasCriadas: categoriasFaltando.length,
      erros: [...erros, ...errosAplicacao],
    });
  } catch (err) {
    console.error('Erro em importar-estoque:', err);
    return json({ error: (err as Error).message || 'Erro ao importar estoque.' }, 400);
  }
});
