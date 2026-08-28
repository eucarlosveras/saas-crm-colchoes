// ═══════════════════════════════════════════════════════════════
// Módulo: estoque.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════
import { LIMITE_ESTOQUE_BAIXO } from './constants.js';
import { getLojasPermitidas, store } from './state.js';
import { db } from './supabaseClient.js';
import { closeModal, openModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

        async function verificarAlertasEstoque() {
            try {
                const isAdminOuGerente = store.currentUser && (
                    store.currentUser.perfil === 'Administrador' ||
                    store.currentUser.perfil === 'Admin' ||
                    store.currentUser.perfil === 'Gerente'
                );
                if (!isAdminOuGerente) return;

                let query = db
                    .from('estoque')
                    .select('id, qtd_disponivel, qualidade, id_loja')
                    .lte('qtd_disponivel', LIMITE_ESTOQUE_BAIXO);

                const isAdmin = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
                if (!isAdmin) {
                    const lojasPermitidas = getLojasPermitidas();
                    query = query.in('id_loja', (lojasPermitidas && lojasPermitidas.length > 0) ? lojasPermitidas : ['00000000-0000-0000-0000-000000000000']);
                }

                const { data, error } = await query;
                if (error) {
                    console.error('Erro ao verificar alertas de estoque:', error);
                    return;
                }

                const itensBaixos = (data || []).filter(item => (item.qualidade || '').toLowerCase().trim() !== 'avaria');
                if (itensBaixos.length > 0 && typeof showToast === 'function') {
                    showToast(`⚠️ ${itensBaixos.length} produto(s) com estoque baixo.`, 'warning');
                }
            } catch (e) {
                console.error('Falha ao verificar alertas de estoque:', e);
            }
        }

function fecharModalNovoProduto() {
    closeModal('modalNovoProduto');
}

function abrirModalNovoProduto() {
    // Resetar formulário
    const form = document.getElementById('formNovoProduto');
    if (form) form.reset();
    const statusEl = document.getElementById('novoProdCodigoStatus');
    if (statusEl) statusEl.textContent = '';

    // Carregar categorias dinamicamente
    carregarCategoriasEstoque();

    // Popular o select de Loja: Admin escolhe entre todas; demais perfis só entre as lojas permitidas.
    const selectLoja = document.getElementById('novoProdLoja');
    const campoLoja = document.getElementById('campoNovoProdLoja');
    if (selectLoja) {
        const isAdminNovoProd = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        const lojasPermitidasNovoProd = getLojasPermitidas();
        const lojasParaEscolher = isAdminNovoProd
            ? store.listaLojas
            : store.listaLojas.filter(l => (lojasPermitidasNovoProd || []).includes(l.id_loja));

        selectLoja.innerHTML = '<option value="" disabled selected>Selecione a loja...</option>';
        lojasParaEscolher.slice().sort((a, b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id_loja;
            opt.textContent = l.nome_loja;
            selectLoja.appendChild(opt);
        });

        // Se só existe UMA loja para escolher (caso comum: Gerente/Vendedor de loja única),
        // pré-seleciona e esconde o campo pra não pedir uma escolha óbvia.
        if (lojasParaEscolher.length === 1) {
            selectLoja.value = lojasParaEscolher[0].id_loja;
            if (campoLoja) campoLoja.style.display = 'none';
        } else if (campoLoja) {
            campoLoja.style.display = 'block';
        }
    }

    // Anexo é só pra quem pode subir arquivo no bucket privado (mesma regra
    // da Entrada por Nota Fiscal) — Vendedor não vê o campo.
    const campoAnexo = document.getElementById('campoNovoProdAnexo');
    if (campoAnexo) {
        const podeAnexar = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        campoAnexo.style.display = podeAnexar ? 'block' : 'none';
    }

    openModal('modalNovoProduto');
}

let _categoriasCacheEstoque = []; // cache pra classificação automática (ver aplicarCategoriaSugerida)

// Mesma lógica usada nas importações em lote (CSV/Nota Fiscal, ver
// _shared/categoria-helper.ts no lado das Edge Functions): 1ª palavra do
// nome do produto batendo com uma categoria já existente — "TRAVESSEIRO
// VISCO LUXO" sugere "Travesseiro". Só sugere dentro do que já existe no
// filtro, nunca cria categoria nova a partir do nome.
const MAPA_ACENTOS_ESTOQUE = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ç: 'c' };
function normalizarTextoEstoque(texto) {
    return (texto || '').trim().toLowerCase().split('').map(ch => MAPA_ACENTOS_ESTOQUE[ch] || ch).join('');
}
function inferirCategoriaPorNomeClient(nomeProduto) {
    const primeiraPalavra = normalizarTextoEstoque(nomeProduto).split(/\s+/)[0] || '';
    if (!primeiraPalavra) return null;
    return _categoriasCacheEstoque.find(c => {
        const nomeCat = normalizarTextoEstoque(c.nome);
        return nomeCat === primeiraPalavra || nomeCat.startsWith(primeiraPalavra + ' ');
    }) || null;
}

// Chamada tanto ao achar um produto pelo código quanto ao digitar o nome de
// um produto novo — sempre tenta sugerir, o usuário pode trocar depois.
function aplicarCategoriaSugerida(nomeProduto) {
    const sugestao = inferirCategoriaPorNomeClient(nomeProduto);
    const selectCategoria = document.getElementById('novoProdCategoria');
    if (sugestao && selectCategoria) selectCategoria.value = sugestao.id;
}

// Busca pelo Código do Produto digitado: se já existe no catálogo, preenche
// Nome e sugere Categoria automaticamente; se não existe, deixa o campo
// Nome livre — é um produto novo, criado no catálogo ao salvar.
function buscarProdutoPorCodigo(input) {
    const codigo = (input.value || '').trim();
    const statusEl = document.getElementById('novoProdCodigoStatus');
    const nomeInput = document.getElementById('novoProdNome');
    if (!codigo) { if (statusEl) statusEl.textContent = ''; return; }

    const match = (store.todosProdutos || []).find(p => (p.codigo || '').toLowerCase() === codigo.toLowerCase());
    if (match) {
        if (nomeInput) nomeInput.value = match.nome;
        aplicarCategoriaSugerida(match.nome);
        if (statusEl) { statusEl.textContent = '✓ Produto já existe no catálogo'; statusEl.style.color = 'var(--status-success-text)'; }
    } else {
        if (statusEl) { statusEl.textContent = 'Código novo — preencha o nome pra cadastrar esse produto'; statusEl.style.color = 'var(--text-muted)'; }
    }
}

async function carregarCategoriasEstoque() {
    const select = document.getElementById('novoProdCategoria');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Carregando...</option>';

    try {
        const { data, error } = await db
            .from('categorias')
            .select('id, nome')
            .order('nome');

        if (error) throw error;

        _categoriasCacheEstoque = data || [];
        select.innerHTML = '<option value="" disabled selected>Selecione uma categoria...</option>';

        if (_categoriasCacheEstoque.length > 0) {
            _categoriasCacheEstoque.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.nome;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="" disabled>Sem categorias cadastradas</option>';
        }
    } catch (e) {
        console.error('Erro ao carregar categorias:', e);
        showToast('Erro ao carregar categorias: ' + e.message, 'error');
        select.innerHTML = '<option value="" disabled>Erro ao carregar</option>';
    }
}

async function salvarNovoProdutoEstoque(event) {
    event.preventDefault();

    const codigo = (document.getElementById('novoProdCodigo')?.value || '').trim();
    const nome = (document.getElementById('novoProdNome')?.value || '').trim();
    const categoriaId = document.getElementById('novoProdCategoria')?.value;
    const qualidade = document.getElementById('novoProdQualidade')?.value;
    const qtdInicial = parseInt(document.getElementById('novoProdQuantidade')?.value) || 0;
    const lojaId = document.getElementById('novoProdLoja')?.value;
    const arquivo = document.getElementById('novoProdAnexo')?.files?.[0] || null;

    if (!codigo || !nome) { showToast('Preencha o código e o nome do produto.', 'warning'); return; }
    if (!qualidade) { showToast('Selecione a qualidade do produto.', 'warning'); return; }
    if (!categoriaId) { showToast('Selecione uma categoria válida.', 'warning'); return; }
    if (!lojaId) { showToast('Selecione a loja do produto.', 'warning'); return; }

    const btnSalvar = event.target.querySelector('button[type="submit"]');
    const originalText = btnSalvar.textContent;
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    try {
        // Anexo sobe pro Storage ANTES de chamar a function (mesmo padrão da
        // Entrada por Nota Fiscal) — best-effort: se falhar, o cadastro segue
        // sem o arquivo, não trava o usuário.
        let arquivoPath = null;
        if (arquivo) {
            const nomeSanitizado = arquivo.name.replace(/[^\w.\-]/g, '_');
            const caminho = `${lojaId}/${Date.now()}-${nomeSanitizado}`;
            const { error: erroUpload } = await db.storage.from('notas-fiscais').upload(caminho, arquivo, { contentType: arquivo.type || undefined });
            if (erroUpload) console.error('Falha ao subir o anexo (produto segue sem o arquivo):', erroUpload.message);
            else arquivoPath = caminho;
        }

        // Insert em `produtos` (catálogo compartilhado) precisa de service
        // role — RLS só libera leitura pra authenticated — daí passar por
        // uma Edge Function em vez de insert direto, igual CSV/Nota Fiscal.
        const { data, error } = await db.functions.invoke('cadastrar-produto-manual', {
            body: { idLoja: lojaId, codigo, nome, categoriaId: parseInt(categoriaId), qualidade, qtdInicial, arquivoPath },
        });
        if (error || data?.error) {
            let mensagem = data?.error;
            if (!mensagem && error?.context?.json) {
                try { mensagem = (await error.context.json())?.error; } catch (_) { /* ignora */ }
            }
            throw new Error(mensagem || 'Não foi possível cadastrar o produto.');
        }

        showToast('Produto adicionado com sucesso!', 'success');
        fecharModalNovoProduto();
        await carregarEstoqueComProdutos();
    } catch (e) {
        showToast('Erro ao salvar: ' + e.message, 'error');
    } finally {
        btnSalvar.textContent = originalText;
        btnSalvar.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// Importação de estoque em lote (CSV) — cada loja sobe a própria lista de
// produtos em vez de cadastrar um por um. Ver supabase/functions/importar-estoque
// pra regra de negócio completa (mesclagem, criação automática de produto/
// categoria novos etc.). Parser próprio (sem lib externa: o pacote `xlsx`
// mais usado pra isso tem 2 CVEs altas sem correção no npm — não vale o
// risco pra um parser que dá pra escrever em poucas linhas).
// ═══════════════════════════════════════════════════════════════

const CABECALHOS_ESPERADOS = {
    codigo: ['codigo', 'código', 'sku', 'cod'],
    nome: ['nome', 'produto', 'nome_produto', 'descricao', 'descrição'],
    categoria: ['categoria'],
    qualidade: ['qualidade'],
    quantidade: ['quantidade', 'qtd', 'qtd_disponivel', 'estoque', 'quantia'],
};

// Troca de char em char em vez de regex com marca de combinação Unicode
// literal no source (frágil — depende do editor/encoding preservar o byte
// exato). Cobre só os acentos que aparecem em cabeçalhos em português.
const MAPA_ACENTOS = { á: 'a', à: 'a', â: 'a', ã: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ç: 'c' };
function normalizarCabecalho(texto) {
    return (texto || '').trim().toLowerCase()
        .split('').map(ch => MAPA_ACENTOS[ch] || ch).join('');
}

// Parser de CSV pequeno mas correto: lida com campos entre aspas (podendo
// conter o delimitador ou quebras de linha), aspas escapadas (""), BOM do
// Excel e os dois delimitadores comuns (',' e ';' — Excel BR costuma
// exportar com ';' porque ',' é separador decimal no locale pt-BR).
function parseCSV(texto) {
    let t = texto.replace(/^﻿/, ''); // remove BOM se existir
    const linhaHeader = t.split(/\r\n|\n|\r/, 1)[0] || '';
    const delimitador = (linhaHeader.match(/;/g) || []).length > (linhaHeader.match(/,/g) || []).length ? ';' : ',';

    const linhas = [];
    let campo = '', linhaAtual = [], dentroAspas = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (dentroAspas) {
            if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') { dentroAspas = false; }
            else campo += c;
        } else if (c === '"') {
            dentroAspas = true;
        } else if (c === delimitador) {
            linhaAtual.push(campo); campo = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && t[i + 1] === '\n') i++;
            linhaAtual.push(campo); campo = '';
            linhas.push(linhaAtual); linhaAtual = [];
        } else {
            campo += c;
        }
    }
    if (campo !== '' || linhaAtual.length > 0) { linhaAtual.push(campo); linhas.push(linhaAtual); }

    return linhas.filter(l => l.some(v => (v || '').trim() !== ''));
}

// Converte as linhas cruas do CSV em { codigo, nome, categoria, qualidade, quantidade }[],
// mapeando o cabeçalho (aceita variações de nome/acento) pra posição da coluna.
function mapearLinhasImportacao(linhas) {
    if (linhas.length < 1) return { itens: [], erroHeader: 'Arquivo vazio.' };
    const header = linhas[0].map(normalizarCabecalho);

    const indice = {};
    for (const [campoCanonico, variantes] of Object.entries(CABECALHOS_ESPERADOS)) {
        const idx = header.findIndex(h => variantes.includes(h));
        if (idx !== -1) indice[campoCanonico] = idx;
    }
    if (indice.codigo === undefined || indice.nome === undefined || indice.quantidade === undefined) {
        return { itens: [], erroHeader: 'O arquivo precisa ter pelo menos as colunas: codigo, nome, quantidade.' };
    }

    const itens = linhas.slice(1).map(linha => ({
        codigo: (linha[indice.codigo] || '').trim(),
        nome: (linha[indice.nome] || '').trim(),
        categoria: indice.categoria !== undefined ? (linha[indice.categoria] || '').trim() : '',
        qualidade: indice.qualidade !== undefined ? (linha[indice.qualidade] || '').trim() : '',
        quantidade: (linha[indice.quantidade] || '').trim(),
    }));

    return { itens, erroHeader: null };
}

let _itensImportacaoEstoque = [];

function abrirModalImportarEstoque() {
    const selectLoja = document.getElementById('importarEstoqueLoja');
    const campoLoja = document.getElementById('campoImportarLoja');
    if (selectLoja) {
        const isAdminImportar = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        const lojasPermitidasImportar = getLojasPermitidas();
        const lojasParaEscolher = isAdminImportar
            ? store.listaLojas
            : store.listaLojas.filter(l => (lojasPermitidasImportar || []).includes(l.id_loja));

        selectLoja.innerHTML = '<option value="" disabled selected>Selecione a loja...</option>';
        lojasParaEscolher.slice().sort((a, b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id_loja; opt.textContent = l.nome_loja;
            selectLoja.appendChild(opt);
        });

        if (lojasParaEscolher.length === 1) {
            selectLoja.value = lojasParaEscolher[0].id_loja;
            if (campoLoja) campoLoja.style.display = 'none';
        } else if (campoLoja) {
            campoLoja.style.display = 'block';
        }
    }

    _itensImportacaoEstoque = [];
    const arquivoInput = document.getElementById('importarEstoqueArquivo');
    if (arquivoInput) arquivoInput.value = '';
    const preview = document.getElementById('importarEstoquePreview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    document.getElementById('errImportarEstoque').textContent = '';
    document.getElementById('btnConfirmarImportarEstoque').disabled = true;

    openModal('modalImportarEstoque');
}

function fecharModalImportarEstoque() {
    closeModal('modalImportarEstoque');
}

function processarArquivoImportacaoEstoque(event) {
    const arquivo = event.target.files?.[0];
    const preview = document.getElementById('importarEstoquePreview');
    const err = document.getElementById('errImportarEstoque');
    const btnConfirmar = document.getElementById('btnConfirmarImportarEstoque');
    err.textContent = '';
    btnConfirmar.disabled = true;
    _itensImportacaoEstoque = [];
    if (!arquivo) { preview.style.display = 'none'; return; }

    const leitor = new FileReader();
    leitor.onload = () => {
        try {
            const linhas = parseCSV(String(leitor.result || ''));
            const { itens, erroHeader } = mapearLinhasImportacao(linhas);
            if (erroHeader) { err.textContent = erroHeader; preview.style.display = 'none'; return; }

            const validos = itens.filter(it => it.codigo && it.nome && it.quantidade !== '' && !Number.isNaN(Number.parseInt(it.quantidade, 10)) && Number.parseInt(it.quantidade, 10) >= 0);
            const invalidos = itens.length - validos.length;

            _itensImportacaoEstoque = validos;
            preview.style.display = 'block';
            preview.innerHTML = `<strong>${validos.length}</strong> produto${validos.length !== 1 ? 's' : ''} pronto${validos.length !== 1 ? 's' : ''} para importar` +
                (invalidos > 0 ? `<br><span style="color:var(--danger-text);">${invalidos} linha${invalidos !== 1 ? 's' : ''} inválida${invalidos !== 1 ? 's' : ''} será${invalidos !== 1 ? 'ão' : ''} ignorada${invalidos !== 1 ? 's' : ''} (código, nome ou quantidade ausente/inválida).</span>` : '');

            btnConfirmar.disabled = validos.length === 0;
        } catch (e) {
            err.textContent = 'Erro ao ler o arquivo: ' + e.message;
            preview.style.display = 'none';
        }
    };
    leitor.onerror = () => { err.textContent = 'Não foi possível ler o arquivo.'; };
    leitor.readAsText(arquivo, 'UTF-8');
}

async function confirmarImportacaoEstoque() {
    const idLoja = document.getElementById('importarEstoqueLoja')?.value;
    const err = document.getElementById('errImportarEstoque');
    err.textContent = '';

    if (!idLoja) { err.textContent = 'Selecione a loja.'; return; }
    if (_itensImportacaoEstoque.length === 0) { err.textContent = 'Nenhum item válido para importar.'; return; }

    const btn = document.getElementById('btnConfirmarImportarEstoque');
    btn.classList.add('saving'); btn.disabled = true;

    try {
        const { data, error } = await db.functions.invoke('importar-estoque', {
            body: { idLoja, itens: _itensImportacaoEstoque },
        });
        if (error || data?.error) {
            let mensagem = data?.error;
            if (!mensagem && error?.context?.json) {
                try { mensagem = (await error.context.json())?.error; } catch (_) { /* ignora */ }
            }
            throw new Error(mensagem || 'Não foi possível importar.');
        }

        const resumo = `Importação concluída: ${data.criados} novo${data.criados !== 1 ? 's' : ''}, ${data.atualizados} atualizado${data.atualizados !== 1 ? 's' : ''}.` +
            (data.erros?.length ? ` ${data.erros.length} aviso(s).` : '');
        showToast(resumo, 'success');
        if (data.erros?.length) console.warn('Avisos na importação de estoque:', data.erros);

        fecharModalImportarEstoque();
        await carregarEstoqueComProdutos();
    } catch (e) {
        err.textContent = 'Erro: ' + e.message;
    } finally {
        btn.classList.remove('saving');
        btn.disabled = false;
    }
}

function baixarModeloImportacaoEstoque() {
    const cabecalho = 'codigo,nome,categoria,qualidade,quantidade';
    const exemplo = '5014077,Colchão Ortobom Light Casal,Colchão,novo,12';
    const csv = cabecalho + '\n' + exemplo + '\n';
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_importacao_estoque.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ═══════════════════════════════════════════════════════════════
// Entrada de estoque a partir de uma Nota Fiscal (PDF/DANFE) — segunda
// forma de importação, ao lado da planilha CSV. Diferença de semântica:
// aqui é uma ENTREGA (soma ao que já existe), não uma "foto" do estoque.
// Ver src/pdf-nf-parser.js (leitura do PDF) e
// supabase/functions/importar-estoque-nf (aplicação no banco).
//
// `parseNotaFiscalPDF` (e o pdfjs-dist por trás dele) só é importado sob
// demanda (import dinâmico), pra não pesar no bundle de quem nunca usa essa
// tela — é uma lib de ~1-2MB só pra extrair texto de PDF.
// ═══════════════════════════════════════════════════════════════

let _itensImportacaoNF = [];
let _metadadosImportacaoNF = { numero: null, serie: null, fornecedor: null };
let _arquivoImportacaoNF = null; // guardado pra subir no Storage só na confirmação (não no preview)

function abrirModalImportarNF() {
    const selectLoja = document.getElementById('importarNFLoja');
    const campoLoja = document.getElementById('campoImportarNFLoja');
    if (selectLoja) {
        const isAdminImportar = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        const lojasPermitidasImportar = getLojasPermitidas();
        const lojasParaEscolher = isAdminImportar
            ? store.listaLojas
            : store.listaLojas.filter(l => (lojasPermitidasImportar || []).includes(l.id_loja));

        selectLoja.innerHTML = '<option value="" disabled selected>Selecione a loja...</option>';
        lojasParaEscolher.slice().sort((a, b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id_loja; opt.textContent = l.nome_loja;
            selectLoja.appendChild(opt);
        });

        if (lojasParaEscolher.length === 1) {
            selectLoja.value = lojasParaEscolher[0].id_loja;
            if (campoLoja) campoLoja.style.display = 'none';
        } else if (campoLoja) {
            campoLoja.style.display = 'block';
        }
    }

    _itensImportacaoNF = [];
    _metadadosImportacaoNF = { numero: null, serie: null, fornecedor: null };
    _arquivoImportacaoNF = null;
    const arquivoInput = document.getElementById('importarNFArquivo');
    if (arquivoInput) arquivoInput.value = '';
    const preview = document.getElementById('importarNFPreview');
    if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
    document.getElementById('errImportarNF').textContent = '';
    document.getElementById('btnConfirmarImportarNF').disabled = true;

    openModal('modalImportarNF');
}

function fecharModalImportarNF() {
    closeModal('modalImportarNF');
}

function renderPreviewImportacaoNF() {
    const preview = document.getElementById('importarNFPreview');
    if (!preview) return;

    if (_itensImportacaoNF.length === 0) {
        preview.style.display = 'none';
        document.getElementById('btnConfirmarImportarNF').disabled = true;
        return;
    }

    const numeroSerie = _metadadosImportacaoNF.numero
        ? _metadadosImportacaoNF.numero + (_metadadosImportacaoNF.serie ? '/' + _metadadosImportacaoNF.serie : '')
        : null;
    const cabecalhoNota = numeroSerie
        ? `<div style="margin-bottom:8px;"><strong>NF ${escapeHtml(numeroSerie)}</strong>${_metadadosImportacaoNF.fornecedor ? ' — ' + escapeHtml(_metadadosImportacaoNF.fornecedor) : ''}<br><span style="color:var(--text-muted);">Data de entrada: hoje (${new Date().toLocaleDateString('pt-BR')})</span></div>`
        : '';

    const linhas = _itensImportacaoNF.map((it, i) => `
        <div style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid var(--border-light);">
            <span style="flex:1; min-width:0;"><strong>${escapeHtml(it.codigo)}</strong> — ${escapeHtml(it.nome)}</span>
            <span style="flex:none; color:var(--text-muted); font-size:11px;">${escapeHtml(it.unidade || '')}</span>
            <span style="flex:none; font-weight:700;">${it.quantidade}</span>
            <button type="button" title="Remover item" onclick="removerItemPreviewNF(${i})" style="flex:none; background:none; border:none; color:var(--danger-text); cursor:pointer; padding:2px 4px; font-size:14px;">✕</button>
        </div>
    `).join('');

    preview.style.display = 'block';
    preview.innerHTML = cabecalhoNota + `<strong>${_itensImportacaoNF.length}</strong> produto${_itensImportacaoNF.length !== 1 ? 's' : ''} pronto${_itensImportacaoNF.length !== 1 ? 's' : ''} para dar entrada:` + linhas;

    document.getElementById('btnConfirmarImportarNF').disabled = false;
}

function removerItemPreviewNF(indice) {
    _itensImportacaoNF.splice(indice, 1);
    renderPreviewImportacaoNF();
}

async function processarArquivoImportarNF(event) {
    const arquivo = event.target.files?.[0];
    const err = document.getElementById('errImportarNF');
    const preview = document.getElementById('importarNFPreview');
    err.textContent = '';
    _itensImportacaoNF = [];
    _metadadosImportacaoNF = { numero: null, fornecedor: null };
    _arquivoImportacaoNF = arquivo || null;
    if (!arquivo) { preview.style.display = 'none'; document.getElementById('btnConfirmarImportarNF').disabled = true; return; }

    preview.style.display = 'block';
    preview.innerHTML = 'Lendo o PDF...';

    try {
        const { parseNotaFiscalPDF } = await import('./pdf-nf-parser.js');
        const resultado = await parseNotaFiscalPDF(arquivo);

        _itensImportacaoNF = resultado.itens;
        _metadadosImportacaoNF = resultado.notaFiscal;

        if (resultado.avisos.length) {
            err.textContent = resultado.avisos.length === 1
                ? resultado.avisos[0]
                : `${resultado.avisos.length} linha(s) não reconhecida(s) — confira o total antes de confirmar.`;
        }

        renderPreviewImportacaoNF();
    } catch (e) {
        err.textContent = 'Não consegui ler este PDF: ' + e.message;
        preview.style.display = 'none';
        document.getElementById('btnConfirmarImportarNF').disabled = true;
    }
}

async function confirmarImportacaoNF() {
    const idLoja = document.getElementById('importarNFLoja')?.value;
    const err = document.getElementById('errImportarNF');
    err.textContent = '';

    if (!idLoja) { err.textContent = 'Selecione a loja.'; return; }
    if (_itensImportacaoNF.length === 0) { err.textContent = 'Nenhum item para dar entrada.'; return; }

    const btn = document.getElementById('btnConfirmarImportarNF');
    btn.classList.add('saving'); btn.disabled = true;

    try {
        // Sobe o PDF original pro Storage ANTES de aplicar no estoque — é o
        // arquivo que o Kardex vai linkar depois. Caminho prefixado por
        // id_loja: é o que a policy do bucket usa pra escopar por loja.
        // Best-effort: se o upload falhar, a entrada continua (não é
        // motivo pra travar o vendedor) — só não fica com link no Kardex.
        let arquivoPath = null;
        if (_arquivoImportacaoNF) {
            const nomeSanitizado = _arquivoImportacaoNF.name.replace(/[^\w.\-]/g, '_');
            const caminho = `${idLoja}/${Date.now()}-${nomeSanitizado}`;
            const { error: erroUpload } = await db.storage.from('notas-fiscais').upload(caminho, _arquivoImportacaoNF, { contentType: 'application/pdf' });
            if (erroUpload) console.error('Falha ao subir o PDF da nota (entrada segue sem o anexo):', erroUpload.message);
            else arquivoPath = caminho;
        }

        const { data, error } = await db.functions.invoke('importar-estoque-nf', {
            body: { idLoja, itens: _itensImportacaoNF, notaFiscal: { ..._metadadosImportacaoNF, arquivoPath } },
        });
        if (error || data?.error) {
            let mensagem = data?.error;
            if (!mensagem && error?.context?.json) {
                try { mensagem = (await error.context.json())?.error; } catch (_) { /* ignora */ }
            }
            throw new Error(mensagem || 'Não foi possível dar entrada no estoque.');
        }

        const resumo = `Entrada registrada: ${data.criados} produto${data.criados !== 1 ? 's' : ''} novo${data.criados !== 1 ? 's' : ''}, ${data.atualizados} atualizado${data.atualizados !== 1 ? 's' : ''}.`;
        showToast(resumo, 'success');
        if (data.erros?.length) console.warn('Avisos na entrada por NF:', data.erros);

        fecharModalImportarNF();
        await carregarEstoqueComProdutos();
    } catch (e) {
        err.textContent = 'Erro: ' + e.message;
    } finally {
        btn.classList.remove('saving');
        btn.disabled = false;
    }
}

async function renderEstoque() {
    const main = document.getElementById('mainContent');
    if (!main) return;

    const podeImportar = store.currentUser.perfil === 'Gerente' || store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';

    main.innerHTML = `
        <header class="dashboard-header">
            <div style="display:flex;align-items:center;gap:12px;">
                <span class="page-icon orange" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                <h1 style="margin:0;">Controle de Estoque</h1>
            </div>
            ${podeImportar ? `
            <div style="display:flex; gap:8px;">
                <button class="btn-primary-action" onclick="abrirModalImportarEstoque()">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Importar Estoque
                </button>
                <button class="btn-primary-action" onclick="abrirModalImportarNF()">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="13" y2="11"/></svg>
                    Entrada por Nota Fiscal
                </button>
            </div>` : ''}
        </header>

        <div class="kpi-grid">
            <div class="kpi-card">
                <span class="kpi-icon blue" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Total de Produtos</span></div>
                <div class="kpi-value" id="estoqueKpiTotal">-</div>
            </div>
            <div class="kpi-card">
                <span class="kpi-icon green" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Disponível</span></div>
                <div class="kpi-value" style="color: var(--status-success-text);" id="estoqueKpiDisponivel">-</div>
            </div>
            <div class="kpi-card">
                <span class="kpi-icon orange" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Reservado</span></div>
                <div class="kpi-value" style="color: var(--status-warning-text);" id="estoqueKpiReservado">-</div>
            </div>
            <div class="kpi-card">
                <span class="kpi-icon red" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                <div class="kpi-label-row"><span class="kpi-dot red"></span><span class="kpi-label">Baixo Estoque</span></div>
                <div class="kpi-value" style="color: var(--danger-text);" id="estoqueKpiBaixo">-</div>
            </div>
        </div>

        <div class="table-card">
            <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
                <input type="text" id="estoqueBuscaInput" class="form-input" placeholder="Buscar por nome ou código..." value="${store.filtroEstoqueBusca}" oninput="filtrarEstoque()" style="flex: 1; min-width: 200px;">
                <select id="estoqueFiltroCategoria" class="form-input" onchange="filtrarEstoque()" style="width: 180px;">
                    <option value="todas">Categorias</option>
                </select>
                <select id="estoqueFiltroQualidade" class="form-input" onchange="filtrarEstoque()" style="width: 160px;">
                    <option value="todas">Qualidades</option>
                    <option value="novo">Novo</option>
                    <option value="mostruario">Mostruário</option>
                    <option value="avaria">Avaria</option>
                </select>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Qualidade</th>
                        <th style="text-align: center;">Disponível</th>
                        <th style="text-align: center;">Reservado</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="estoqueTableBody">
                    <tr><td colspan="7" style="text-align: center; padding: 40px;">Carregando estoque...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    await carregarEstoqueComProdutos();
}

async function carregarEstoqueComProdutos() {
    try {
        // 1. Busca os dados do estoque com o relacionamento de categorias
        let queryEstoque = db.from('estoque').select('*, categorias(nome)');

        // Admin vê tudo. Gerente/Vendedor só veem o estoque das lojas permitidas.
        const isAdminEstoque = store.currentUser.perfil === 'Administrador' || store.currentUser.perfil === 'Admin';
        if (!isAdminEstoque) {
            const lojasPermitidasEstoque = getLojasPermitidas();
            queryEstoque = queryEstoque.in('id_loja', (lojasPermitidasEstoque && lojasPermitidasEstoque.length > 0) ? lojasPermitidasEstoque : ['00000000-0000-0000-0000-000000000000']);
        }

        const { data: estoqueDataResp, error: estoqueError } = await queryEstoque;

        if (estoqueError) throw estoqueError;
        store.estoqueData = estoqueDataResp;

        // 2. Busca todas as categorias para popular o filtro
        const { data: categoriasData, error: catError } = await db
            .from('categorias')
            .select('id, nome')
            .order('nome');

        if (catError) throw catError;

        // 3. Popula o select de filtro dinamicamente
        const selectFiltro = document.getElementById('estoqueFiltroCategoria');
        if (selectFiltro) {
            selectFiltro.innerHTML = '<option value="todas">Categorias</option>';
            
            if (categoriasData && categoriasData.length > 0) {
                categoriasData.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.id; // Usa o ID como valor
                    option.textContent = cat.nome; // Usa o nome como exibição
                    selectFiltro.appendChild(option);
                });
            }
        }

        // 4. Salva os dados completos para uso na função de filtro
        window.dadosEstoqueCompleto = store.estoqueData;

        // 5. Atualiza KPIs e renderiza a tabela
        atualizarKpisEstoque();
        filtrarEstoque();
    } catch (e) {
        showToast('Erro ao carregar estoque: ' + e.message, 'error');
        document.getElementById('estoqueTableBody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--danger-text);">Erro ao carregar dados</td></tr>';
    }
}

function atualizarKpisEstoque() {
    const dados = window.dadosEstoqueCompleto || [];
    
    // 1. Total: Volume físico real (Disponível + Reservado)
    const total = dados.reduce((sum, item) => {
        const disp = parseInt(item.qtd_disponivel) || 0;
        const res = parseInt(item.qtd_reservada) || 0;
        return sum + (disp + res);
    }, 0);

    // 2. Disponível: Apenas produtos que NÃO são avaria
    const disponivel = dados
        .filter(item => (item.qualidade || '').toLowerCase() !== 'avaria')
        .reduce((sum, item) => sum + (parseInt(item.qtd_disponivel) || 0), 0);

    // 3. Reservado: Soma das unidades comprometidas
    const reservado = dados.reduce((sum, item) => sum + (parseInt(item.qtd_reservada) || 0), 0);

    // 4. Baixo Estoque: Produtos com menos de 5 unidades (incluindo 0)
    const baixo = dados.filter(item => {
        const qtd = parseInt(item.qtd_disponivel) || 0;
        return qtd < 5;
    }).length;

    const elTotal = document.getElementById('estoqueKpiTotal');
    const elDisp = document.getElementById('estoqueKpiDisponivel');
    const elRes = document.getElementById('estoqueKpiReservado');
    const elBaixo = document.getElementById('estoqueKpiBaixo');

    if (elTotal) elTotal.textContent = total;
    if (elDisp) elDisp.textContent = disponivel;
    if (elRes) elRes.textContent = reservado;
    if (elBaixo) elBaixo.textContent = baixo;
}

function filtrarEstoque() {
    store.filtroEstoqueBusca = document.getElementById('estoqueBuscaInput')?.value.toLowerCase() || '';
    store.filtroEstoqueCategoria = document.getElementById('estoqueFiltroCategoria')?.value || 'todas';
    store.filtroEstoqueQualidade = document.getElementById('estoqueFiltroQualidade')?.value || 'todas';

    // Acessando a fonte de dados original
    const dadosOriginais = window.dadosEstoqueCompleto || store.estoqueData || []; 

    const filtrados = dadosOriginais.filter(item => {
        const codigo = (item.codigo_produto || '').toLowerCase();
        const nome = (item.nome_produto || '').toLowerCase();
        const qualidade = (item.qualidade || '').toLowerCase().trim();

        const matchBusca = codigo.includes(store.filtroEstoqueBusca) || nome.includes(store.filtroEstoqueBusca);
        // Filtro por Categoria (Comparando ID)
        const matchCategoria = store.filtroEstoqueCategoria === 'todas' || String(item.categoria_id) === String(store.filtroEstoqueCategoria);
        const matchQualidade = store.filtroEstoqueQualidade === 'todas' || qualidade === store.filtroEstoqueQualidade;

        return matchBusca && matchCategoria && matchQualidade;
    });

    renderizarTabelaEstoque(filtrados);
}

function renderizarTabelaEstoque(data) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum produto encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(item => {
        const disponivel = item.qtd_disponivel || 0;
        const reservado = item.qtd_reservada || 0;
        const qualidade = (item.qualidade || '').toLowerCase().trim() || 'novo';

        // Pill de quantidade disponível
        let pillClass = 'pill-success';
        let pillText = 'OK';
        if (disponivel === 0) {
            pillClass = 'pill-danger';
            pillText = 'Zero';
        } else if (disponivel <= 5) {
            pillClass = 'pill-warning';
            pillText = 'Baixo';
        }

        // Tag de qualidade
        let qualidadeClass = 'tag-novo';
        let qualidadeLabel = 'Novo';
        if (qualidade === 'mostruario') {
            qualidadeClass = 'tag-mostruario';
            qualidadeLabel = 'Mostruário';
        } else if (qualidade === 'avaria') {
            qualidadeClass = 'tag-avaria';
            qualidadeLabel = 'Avaria';
        }

        return `
            <tr>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: var(--font-xs);">${escapeHtml(item.codigo_produto || '-')}</td>
                <td><a href="#" class="link-kardex" onclick="event.preventDefault(); abrirKardexEstoque('${item.id}')"><strong>${escapeHtml(item.nome_produto || 'Produto não vinculado')}</strong></a></td>
                <td>${escapeHtml(item.categorias?.nome || '-')}</td>
                <td><span class="quality-tag ${qualidadeClass}">${qualidadeLabel}</span></td>
                <td style="text-align: center;"><span class="pill ${pillClass}">${disponivel}</span></td>
                <td style="text-align: center; color: var(--text-muted);">${reservado}</td>
                <td><span class="status-pill ${pillClass}">${pillText}</span></td>
            </tr>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════
// Kardex do produto — histórico completo de movimentações de UMA linha de
// estoque (entradas e saídas), em ordem cronológica, estilo Kardex do
// TOTVS. Clicado a partir do nome do produto na tabela de estoque.
//
// IMPORTANTE (transparência, não é bug desta tela): "saída por venda" só
// aparece aqui quando o orçamento tiver itens em `itens_orcamento` — hoje
// a tela "Novo Orçamento" ainda não grava lá (usa só o campo de texto livre
// modelo_colchao), então o trigger de baixa automática nunca dispara com
// dado de verdade. As entradas (CSV/Nota Fiscal) já aparecem certinho; as
// saídas vão aparecer assim que essa ligação for feita — não é escopo
// desta tela consertar isso.
// ═══════════════════════════════════════════════════════════════

// Padronizado só em Entrada/Saída (pedido explícito) — pela VARIAÇÃO real
// (qtd_nova - qtd_anterior), não pelo tipo_movimentacao cru. Mais robusto:
// continua certo mesmo pra tipos que hoje não aparecem na prática (reserva,
// devolução, ajuste negativo etc.) sem precisar mapear cada um à mão.
function chipTipoMovimentacao(variacao) {
    const positivo = variacao >= 0;
    const label = positivo ? 'Entrada' : 'Saída';
    const badge = positivo ? 'success' : 'error';
    return `<span style="display:inline-flex; align-items:center; padding:3px 10px; border-radius:100px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--status-${badge}-bg); border:1px solid var(--status-${badge}-border); color:var(--status-${badge}-text);">${label}</span>`;
}

// Referência enxuta: só o número que identifica a origem — NF na entrada,
// Orçamento na saída — sem o texto de observação inteiro (que não cabe
// numa linha só). Entrada sem NF associada (import via CSV, cadastro
// manual) não tem número pra extrair — mostra o observação mesmo, é o
// único dado disponível nesse caso. Quando a entrada tem QUALQUER arquivo
// anexado (arquivo_anexo_path — PDF de NF, mas também imagem/planilha de
// um cadastro manual), vira link clicável que abre o arquivo original —
// devolve HTML pronto (já escapado), não texto puro.
function renderReferenciaKardex(m, positivo) {
    if (!positivo) {
        const texto = m.orcamentos?.protocolo ? `#${m.orcamentos.protocolo}` : (m.observacao || '-');
        return escapeHtml(texto);
    }
    const matchNF = (m.observacao || '').match(/NF\s+([\d/]+)/i);
    const texto = matchNF ? `NF ${matchNF[1]}` : (m.observacao || '-');
    if (m.arquivo_anexo_path) {
        return `<a href="#" class="link-kardex" onclick="event.preventDefault(); abrirAnexoMovimentacao('${escapeHtml(m.arquivo_anexo_path)}')">📎 ${escapeHtml(texto)}</a>`;
    }
    return escapeHtml(texto);
}

// Abre o arquivo anexado (PDF de NF, imagem, planilha etc.) num signed URL
// de curta duração — nunca uma URL pública fixa (bucket é privado, pode ter
// preço de custo de fornecedor).
async function abrirAnexoMovimentacao(path) {
    try {
        const { data, error } = await db.storage.from('notas-fiscais').createSignedUrl(path, 60);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener');
    } catch (e) {
        showToast('Não foi possível abrir o anexo: ' + e.message, 'error');
    }
}

async function abrirKardexEstoque(idEstoque) {
    const corpo = document.getElementById('kardexCorpo');
    const titulo = document.getElementById('kardexTitulo');
    const sub = document.getElementById('kardexSubtitulo');
    titulo.textContent = 'Histórico do produto';
    sub.textContent = '';
    corpo.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Carregando...</div>';
    openModal('modalKardexEstoque');

    try {
        const { data: itemEstoque, error: erroItem } = await db.from('estoque').select('codigo_produto, nome_produto, qtd_disponivel, qtd_reservada').eq('id', idEstoque).single();
        if (erroItem) throw erroItem;

        titulo.textContent = itemEstoque.nome_produto || 'Produto';
        sub.textContent = `Código ${itemEstoque.codigo_produto} · Disponível: ${itemEstoque.qtd_disponivel} · Reservado: ${itemEstoque.qtd_reservada || 0}`;

        const { data: movimentacoes, error } = await db.from('movimentacoes_estoque')
            .select('created_at, tipo_movimentacao, qtd_anterior_disponivel, qtd_nova_disponivel, observacao, arquivo_anexo_path, usuarios(nome), orcamentos(protocolo)')
            .eq('id_estoque', idEstoque)
            .order('created_at', { ascending: true });
        if (error) throw error;

        if (!movimentacoes || movimentacoes.length === 0) {
            corpo.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Nenhuma movimentação registrada ainda para este produto.</div>';
            return;
        }

        corpo.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="white-space:nowrap;">
                    <thead><tr><th>Data</th><th>Tipo</th><th style="text-align:right;">Variação</th><th style="text-align:right;">Saldo</th><th>Referência</th><th>Vendedor</th></tr></thead>
                    <tbody>
                        ${movimentacoes.map(m => {
                            const variacao = (m.qtd_nova_disponivel ?? 0) - (m.qtd_anterior_disponivel ?? 0);
                            const positivo = variacao >= 0;
                            const corVariacao = positivo ? 'var(--status-success-text)' : 'var(--status-error-text)';
                            const referencia = renderReferenciaKardex(m, positivo);
                            return `
                                <tr>
                                    <td>${new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                                    <td>${chipTipoMovimentacao(variacao)}</td>
                                    <td style="text-align:right; font-weight:700; color:${corVariacao};">${variacao > 0 ? '+' : ''}${variacao}</td>
                                    <td style="text-align:right; font-weight:700;">${m.qtd_nova_disponivel ?? '-'}</td>
                                    <td style="font-size:var(--font-xs); color:var(--text-muted);">${referencia}</td>
                                    <td style="font-size:var(--font-xs); color:var(--text-muted);">${escapeHtml(m.usuarios?.nome || '-')}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        corpo.innerHTML = `<div style="text-align:center; padding:40px; color:var(--danger-text);">Erro ao carregar histórico: ${escapeHtml(e.message)}</div>`;
    }
}

function fecharModalKardex() {
    closeModal('modalKardexEstoque');
}

export { abrirKardexEstoque, abrirModalImportarEstoque, abrirModalImportarNF, abrirModalNovoProduto, abrirAnexoMovimentacao, aplicarCategoriaSugerida, atualizarKpisEstoque, baixarModeloImportacaoEstoque, buscarProdutoPorCodigo, carregarCategoriasEstoque, carregarEstoqueComProdutos, confirmarImportacaoEstoque, confirmarImportacaoNF, fecharModalImportarEstoque, fecharModalImportarNF, fecharModalKardex, fecharModalNovoProduto, filtrarEstoque, processarArquivoImportacaoEstoque, processarArquivoImportarNF, removerItemPreviewNF, renderEstoque, renderizarTabelaEstoque, salvarNovoProdutoEstoque, verificarAlertasEstoque };
