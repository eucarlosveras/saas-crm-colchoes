// ═══════════════════════════════════════════════════════════════
// Módulo: pdf-nf-parser.js — lê o texto de um PDF de DANFE (Documento
// Auxiliar da Nota Fiscal Eletrônica, o "recibo" de uma nota fiscal) e
// extrai a tabela "DADOS DO PRODUTO/SERVIÇO" (código, descrição,
// quantidade), pra dar entrada em estoque a partir de uma nota de compra.
//
// Por que não é um regex simples em cima do texto "achatado" do PDF: a
// DANFE é uma tabela desenhada visualmente — cada célula é um texto
// posicionado por coordenada (x,y) na página, não uma string com colunas
// separadas por espaço/tab. Testado contra 3 notas reais de fornecedores
// diferentes (Eleva, Americas, Euroflex): valores quebram de jeito
// diferente dependendo da largura da coluna, e a ordem "natural" dos itens
// devolvidos pelo pdf.js nem sempre é a ordem de leitura visual da tabela.
// A técnica usada aqui é a correta pra isso: pega a posição x de cada
// coluna a partir do próprio cabeçalho da tabela ("COD. PROD",
// "DESCRIÇÃO...", "QUANT."), agrupa itens em linhas por proximidade de y,
// e classifica cada linha pela coluna em que ela cai — não por regex de
// texto solto.
//
// Roda tanto no navegador (import direto, usado por estoque.js) quanto em
// Node puro (usado pelos testes) — mesmo código, sem nada específico de
// DOM/browser.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const TOLERANCIA_MESMA_LINHA = 3; // pt — diferença de y aceita como "mesma linha visual"
const MARGEM_COLUNA = 4; // pt — folga pra valor numérico right-aligned "vazar" um pouco antes do início nominal da coluna

function textoEhSoDivisorOuVazio(texto) {
    return /^[\s\-]*$/.test(texto || '');
}

function normalizarNumeroPtBr(texto) {
    const limpo = (texto || '').trim().replace(/\./g, '').replace(',', '.');
    const n = Number.parseFloat(limpo);
    return Number.isFinite(n) ? n : null;
}

// Agrupa os itens de texto de uma página em "linhas" (mesma coordenada y,
// dentro da tolerância), cada linha como lista de itens ordenada por x.
function agruparEmLinhas(items) {
    const comConteudo = items.filter(it => (it.str || '').trim() !== '');
    comConteudo.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]); // y desc, x asc
    const linhas = [];
    for (const it of comConteudo) {
        const y = it.transform[5];
        const x = it.transform[4];
        const ultima = linhas[linhas.length - 1];
        if (ultima && Math.abs(ultima.y - y) <= TOLERANCIA_MESMA_LINHA) {
            ultima.itens.push({ str: it.str, x });
        } else {
            linhas.push({ y, itens: [{ str: it.str, x }] });
        }
    }
    linhas.forEach(l => l.itens.sort((a, b) => a.x - b.x));
    return linhas;
}

// Acha, numa linha, o texto do primeiro item cujo x cai dentro de [xInicio, xFim).
function textoNaFaixa(linha, xInicio, xFim) {
    const itens = linha.itens.filter(it => it.x >= xInicio - MARGEM_COLUNA && it.x < xFim);
    return itens.map(it => it.str).join(' ').trim();
}

// Extrai os itens da tabela "DADOS DO PRODUTO/SERVIÇO" de UMA página.
// Retorna [] se a página não tiver essa tabela (ex: página só de rodapé).
function extrairItensDaPagina(linhas) {
    const idxHeader = linhas.findIndex(l => l.itens.some(it => it.str.includes('COD. PROD')));
    if (idxHeader === -1) return [];
    const header = linhas[idxHeader];

    const xCodigo = header.itens.find(it => it.str.includes('COD. PROD'))?.x;
    const xDescricao = header.itens.find(it => it.str.includes('DESCRIÇÃO'))?.x;
    const xNcm = header.itens.find(it => it.str.includes('NCM'))?.x;
    const xUn = header.itens.find(it => it.str === 'UN')?.x;
    const xQuant = header.itens.find(it => it.str.startsWith('QUANT'))?.x;
    const xVUnitario = header.itens.find(it => it.str.includes('V.UNITARIO'))?.x;
    if ([xCodigo, xDescricao, xNcm, xUn, xQuant, xVUnitario].some(v => v === undefined)) return [];

    // Fim da tabela: primeira linha abaixo do header que bate com um dos
    // rótulos do rodapé fixo da DANFE (esse bloco existe em toda página).
    let idxFim = linhas.length;
    for (let i = idxHeader + 1; i < linhas.length; i++) {
        const texto = linhas[i].itens.map(it => it.str).join(' ');
        if (/CALCULO DO ISSQN|DADOS ADICIONAIS|RESERVADO AO FISCO/.test(texto)) { idxFim = i; break; }
    }

    const itens = [];
    let atual = null;
    for (let i = idxHeader + 1; i < idxFim; i++) {
        const linha = linhas[i];
        const codigoTexto = textoNaFaixa(linha, xCodigo, xDescricao);
        const descTexto = textoNaFaixa(linha, xDescricao, xNcm);
        const unidadeTexto = textoNaFaixa(linha, xUn, xQuant);
        const quantTexto = textoNaFaixa(linha, xQuant, xVUnitario);

        const codigoVazio = textoEhSoDivisorOuVazio(codigoTexto);
        const descVazia = textoEhSoDivisorOuVazio(descTexto);

        if (!codigoVazio) {
            // Início de um novo item da tabela.
            atual = { codigo: codigoTexto, nome: descTexto, unidade: unidadeTexto || null, quantidade: normalizarNumeroPtBr(quantTexto) };
            itens.push(atual);
        } else if (!descVazia && atual) {
            // Continuação da descrição do item anterior (nome comprido que
            // quebrou em 2 linhas — comum em nomes de colchão/travesseiro).
            atual.nome = (atual.nome + ' ' + descTexto).trim();
        }
        // Linha só com traços (divisor visual) ou totalmente vazia: ignora.
    }
    return itens;
}

function extrairMetadadosNota(linhasPagina1) {
    const textoCompleto = linhasPagina1.map(l => l.itens.map(it => it.str).join(' ')).join(' ');
    const matchFornecedor = textoCompleto.match(/RECEBEMOS DE (.+?) OS PRODUTOS/i);
    const matchNumero = textoCompleto.match(/N\.\s*0*(\d+)/);
    const matchSerie = textoCompleto.match(/S[ÉE]RIE\s*0*(\d+)/i);
    return {
        fornecedor: matchFornecedor ? matchFornecedor[1].trim() : null,
        numero: matchNumero ? matchNumero[1] : null,
        serie: matchSerie ? matchSerie[1] : null,
    };
}

// Ponto de entrada. `arquivo` é um File/Blob (navegador) ou um
// ArrayBuffer/Uint8Array (Node, usado nos testes).
export async function parseNotaFiscalPDF(arquivo) {
    const data = arquivo instanceof Uint8Array || arquivo instanceof ArrayBuffer
        ? arquivo
        : new Uint8Array(await arquivo.arrayBuffer());

    const doc = await pdfjsLib.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;

    const itensBrutos = [];
    let metadados = { fornecedor: null, numero: null, serie: null };
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const linhas = agruparEmLinhas(content.items);
        if (p === 1) metadados = extrairMetadadosNota(linhas);
        itensBrutos.push(...extrairItensDaPagina(linhas));
    }

    const itens = [];
    const avisos = [];
    itensBrutos.forEach((it, i) => {
        const codigo = (it.codigo || '').trim();
        const nome = (it.nome || '').trim();
        if (!codigo || !nome) { avisos.push(`Item ${i + 1}: código ou nome vazio — ignorado.`); return; }
        if (it.quantidade === null || it.quantidade <= 0) { avisos.push(`Item ${i + 1} (${codigo}): quantidade não reconhecida — ignorado.`); return; }
        itens.push({ codigo, nome, unidade: it.unidade || null, quantidade: Math.round(it.quantidade) });
    });

    if (itens.length === 0 && avisos.length === 0) {
        avisos.push('Não encontrei a tabela de produtos neste PDF — confira se é mesmo o DANFE da nota (não a 1ª página de um e-mail, por exemplo).');
    }

    return { itens, avisos, notaFiscal: metadados };
}
