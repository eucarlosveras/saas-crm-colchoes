// Classifica um produto pela CATEGORIA JÁ EXISTENTE cujo nome bate com a
// primeira palavra do nome do produto — ex: "TRAVESSEIRO VISCO LUXO" cai em
// "Travesseiro". Usado nas importações em lote (CSV e Nota Fiscal), que não
// têm um humano escolhendo a categoria linha a linha.
//
// De propósito só classifica em categorias que JÁ EXISTEM — nunca cria uma
// nova a partir do nome do produto. Sem match, quem chama decide o
// fallback (hoje sempre "Outros").
// Troca de char em char em vez de regex com marca de combinação Unicode
// literal no source (frágil — depende do editor/encoding preservar o byte
// exato; ver o mesmo cuidado em src/estoque.js). Cobre os acentos comuns em
// nome de produto/categoria em português.
const MAPA_ACENTOS: Record<string, string> = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ç: 'c' };

export function normalizarTexto(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => MAPA_ACENTOS[ch] || ch)
    .join('');
}

export function inferirCategoriaPorNome(
  nomeProduto: string,
  categorias: Array<{ id: number; nome: string }>,
): { id: number; nome: string } | null {
  const primeiraPalavra = normalizarTexto(nomeProduto).split(/\s+/)[0] || '';
  if (!primeiraPalavra) return null;

  return categorias.find((c) => {
    const nomeCat = normalizarTexto(c.nome);
    // Igual ("colchao" === "colchao") ou a categoria começa com a palavra
    // seguida de espaço (cobre categoria de 2 palavras, ex: produto "PILLOW
    // TOP 138x188" -> categoria "Pillow Top").
    return nomeCat === primeiraPalavra || nomeCat.startsWith(primeiraPalavra + ' ');
  }) || null;
}
