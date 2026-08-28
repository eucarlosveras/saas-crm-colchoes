// importar-estoque-nf — entrada de estoque a partir de uma nota fiscal de
// compra (o PDF/DANFE já foi lido no navegador por src/pdf-nf-parser.js;
// esta function só recebe a lista já estruturada e aplica no banco).
//
// Diferença chave pro importar-estoque (CSV): aqui é uma ENTREGA, não uma
// "foto" do estoque atual — a quantidade da nota SOMA ao que já existe,
// nunca substitui. Sempre qualidade 'novo' (mercadoria recém-chegada do
// fornecedor nunca é mostruário/avaria) e tipo_movimentacao 'entrada'.
//
// Mesma regra de categoria do CSV: a nota não tem esse campo (só tem NCM,
// que é fiscal, não organizacional), cai no fallback "Outros" pra produto
// novo — Gerente reclassifica depois se quiser.
//
// Gerente só dá entrada na própria loja; Administrador em qualquer uma.
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

const MAX_ITENS = 2000;
const CATEGORIA_PADRAO = 'Outros';

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
    const notaFiscal = body.notaFiscal || {};
    console.log('Entrada de estoque por NF solicitada por', auth.user.email, '-> loja:', idLoja, '- itens:', itensBrutos.length, '- NF:', notaFiscal.numero);

    if (!idLoja) return json({ error: 'idLoja obrigatório.' }, 400);
    if (itensBrutos.length === 0) return json({ error: 'Lista vazia — nada para importar.' }, 400);
    if (itensBrutos.length > MAX_ITENS) return json({ error: `Nota muito grande (máx. ${MAX_ITENS} itens por importação).` }, 400);

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
      return json({ error: 'Sem permissão para dar entrada em estoque.' }, 403);
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
        return json({ error: 'Você só pode dar entrada em estoque na(s) sua(s) própria(s) loja(s).' }, 403);
      }
    }

    const { data: loja, error: erroLoja } = await admin.from('lojas').select('id_loja').eq('id_loja', idLoja).maybeSingle();
    if (erroLoja) throw erroLoja;
    if (!loja) return json({ error: 'Loja não encontrada.' }, 404);

    // 1) Normaliza e valida cada linha.
    const linhas: Array<{ codigo: string; nome: string; quantidade: number }> = [];
    const erros: string[] = [];
    itensBrutos.forEach((item: any, i: number) => {
      const codigo = String(item?.codigo || '').trim();
      const nome = String(item?.nome || '').trim();
      const quantidadeNum = Number.parseInt(String(item?.quantidade ?? '').trim(), 10);
      if (!codigo || !nome) { erros.push(`Item ${i + 1}: código ou nome vazio — ignorado.`); return; }
      if (!Number.isFinite(quantidadeNum) || quantidadeNum <= 0) { erros.push(`Item ${i + 1} (${codigo}): quantidade inválida — ignorado.`); return; }
      linhas.push({ codigo, nome, quantidade: quantidadeNum });
    });
    if (linhas.length === 0) return json({ error: 'Nenhuma linha válida na lista.', erros }, 400);

    // 2) Carrega o que já existe de uma vez.
    const codigosUnicos = [...new Set(linhas.map(l => l.codigo))];
    const { data: produtosExistentes } = await admin.from('produtos').select('id_produto, codigo').in('codigo', codigosUnicos);
    const mapaProdutos = new Map((produtosExistentes || []).map(p => [p.codigo.toLowerCase(), p]));

    const { data: categoriaPadrao } = await admin.from('categorias').select('id, nome').ilike('nome', CATEGORIA_PADRAO).maybeSingle();
    let idCategoriaPadrao = categoriaPadrao?.id;
    if (!idCategoriaPadrao) {
      const { data: criada, error: erroCat } = await admin.from('categorias').insert([{ nome: CATEGORIA_PADRAO }]).select('id').single();
      if (erroCat) throw erroCat;
      idCategoriaPadrao = criada!.id;
    }

    const { data: estoqueExistente } = await admin.from('estoque').select('id, codigo_produto, qualidade, qtd_disponivel').eq('id_loja', idLoja).eq('qualidade', 'novo');
    const mapaEstoque = new Map((estoqueExistente || []).map(e => [e.codigo_produto.toLowerCase(), e]));

    // 3) Cria produtos que faltam no catálogo compartilhado.
    const codigosFaltando = codigosUnicos.filter(c => !mapaProdutos.has(c.toLowerCase()));
    if (codigosFaltando.length > 0) {
      const primeiraOcorrencia = new Map(linhas.map(l => [l.codigo, l.nome]));
      const novosProdutos = codigosFaltando.map(codigo => ({ codigo, nome_produto: primeiraOcorrencia.get(codigo) || codigo }));
      const { data: criados, error: erroProdutos } = await admin.from('produtos').insert(novosProdutos).select('id_produto, codigo');
      if (erroProdutos) throw erroProdutos;
      (criados || []).forEach(p => mapaProdutos.set(p.codigo.toLowerCase(), p));
    }

    // 4) Aplica cada linha: SOMA na existente (qualidade 'novo'), ou cria nova.
    // Linhas repetidas da mesma nota com o mesmo código (comum — preços/lotes
    // diferentes na mesma entrega) já se acumulam corretamente aqui: a segunda
    // ocorrência lê o valor já incrementado pela primeira porque o mapa em
    // memória é atualizado a cada iteração — mas como emLotes roda em paralelo
    // dentro do lote, agrupamos por código ANTES de aplicar pra nunca perder
    // incremento por corrida entre duas linhas do mesmo produto.
    const porCodigo = new Map<string, { codigo: string; nome: string; quantidade: number }>();
    for (const linha of linhas) {
      const chave = linha.codigo.toLowerCase();
      const acc = porCodigo.get(chave);
      if (acc) acc.quantidade += linha.quantidade;
      else porCodigo.set(chave, { codigo: linha.codigo, nome: linha.nome, quantidade: linha.quantidade });
    }

    let criadosCount = 0;
    let atualizadosCount = 0;
    const errosAplicacao: string[] = [];
    // Número da NF sozinho não identifica a nota de forma única (duas séries
    // diferentes do mesmo fornecedor podem reusar número) — por isso
    // número/série juntos na referência, igual ao formato do DANFE.
    const numeroSerie = notaFiscal.numero
      ? notaFiscal.numero + (notaFiscal.serie ? '/' + notaFiscal.serie : '')
      : null;
    const referenciaNota = numeroSerie
      ? `NF ${numeroSerie}${notaFiscal.fornecedor ? ' (' + notaFiscal.fornecedor + ')' : ''}`
      : 'nota fiscal';

    await emLotes([...porCodigo.entries()], 10, async ([codigoLower, { codigo, nome, quantidade }]) => {
      try {
        const produto = mapaProdutos.get(codigoLower);
        const existente = mapaEstoque.get(codigoLower);

        if (existente) {
          const novaQtd = existente.qtd_disponivel + quantidade;
          const { error } = await admin.from('estoque').update({ qtd_disponivel: novaQtd, status: 'Ativo' }).eq('id', existente.id);
          if (error) throw error;

          const { error: erroMov } = await admin.from('movimentacoes_estoque').insert([{
            id_estoque: existente.id, id_usuario: chamador.id_usuario, tipo_movimentacao: 'entrada',
            quantidade, qtd_anterior_disponivel: existente.qtd_disponivel, qtd_nova_disponivel: novaQtd,
            observacao: `Entrada por ${referenciaNota}`,
          }]);
          if (erroMov) console.error('Falha ao registrar movimentação de entrada:', erroMov.message);
          atualizadosCount++;
        } else {
          const { data: novo, error } = await admin.from('estoque').insert([{
            codigo_produto: codigo, nome_produto: nome, categoria_id: idCategoriaPadrao,
            id_produto: produto?.id_produto, qualidade: 'novo', qtd_disponivel: quantidade,
            status: 'Ativo', id_loja: idLoja,
          }]).select('id').single();
          if (error) throw error;

          const { error: erroMovNova } = await admin.from('movimentacoes_estoque').insert([{
            id_estoque: novo!.id, id_usuario: chamador.id_usuario, tipo_movimentacao: 'entrada',
            quantidade, qtd_anterior_disponivel: 0, qtd_nova_disponivel: quantidade,
            observacao: `Entrada por ${referenciaNota}`,
          }]);
          if (erroMovNova) console.error('Falha ao registrar movimentação de entrada:', erroMovNova.message);
          criadosCount++;
        }
      } catch (e) {
        errosAplicacao.push(`Código ${codigo}: ${(e as Error).message}`);
      }
    });

    return json({
      success: true,
      criados: criadosCount,
      atualizados: atualizadosCount,
      produtosNovosCriados: codigosFaltando.length,
      erros: [...erros, ...errosAplicacao],
    });
  } catch (err) {
    console.error('Erro em importar-estoque-nf:', err);
    return json({ error: (err as Error).message || 'Erro ao importar nota fiscal.' }, 400);
  }
});
