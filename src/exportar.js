// ═══════════════════════════════════════════════════════════════
// Módulo: exportar.js — Exportação de relatórios em PDF e Excel
//
// Funções disponíveis:
//   exportarRelatorioVendasPDF()   — Dashboard gerencial → PDF
//   exportarOrcamentosExcel()      — Orçamentos (carteira) → Excel
//   exportarFichaClientePDF(dados) — Ficha de cliente individual → PDF
// ═══════════════════════════════════════════════════════════════

import { STATUS } from './constants.js';
import { getLojasPermitidas, store } from './state.js';
import { db } from './supabaseClient.js';
import { showToast } from './ui.js';

// ───────────────────────────────────────────────────────────────
// Helpers internos
// ───────────────────────────────────────────────────────────────

const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = s => s ? new Date(s).toLocaleDateString('pt-BR') : '-';
const fmtDataHora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Carrega jsPDF + AutoTable de forma lazy (chunk separado, só quando necessário)
async function carregarJsPDF() {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    return jsPDF;
}

// Carrega SheetJS de forma lazy
async function carregarXLSX() {
    const XLSX = await import('xlsx');
    return XLSX;
}

// Cabeçalho padrão no topo de cada PDF gerado
function adicionarCabecalhoPDF(doc, titulo, subtitulo) {
    const loja = store.listaLojas?.find(l => l.id_loja === store.currentUser?.id_loja);
    const nomeLoja = loja?.nome || store.currentUser?.nome || 'CV CRM';

    // Fundo azul no topo
    doc.setFillColor(30, 58, 138);   // azul escuro brand
    doc.rect(0, 0, 210, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CV CRM', 14, 11);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(nomeLoja, 14, 17);

    // Título central
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, 105, 13, { align: 'center' });

    if (subtitulo) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(subtitulo, 105, 20, { align: 'center' });
    }

    // Data de emissão
    doc.setFontSize(7);
    doc.text(`Emitido em ${fmtDataHora()}`, 196, 11, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    return 34; // y inicial após o cabeçalho
}

// Rodapé com número de página
function adicionarRodapePDF(doc) {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${total}`, 105, 292, { align: 'center' });
        doc.text('CV CRM · Gestão Comercial', 14, 292);
        doc.setTextColor(0, 0, 0);
    }
}

// ───────────────────────────────────────────────────────────────
// 1. RELATÓRIO DE VENDAS — PDF (Gerente/Admin, Visão Gerencial)
// ───────────────────────────────────────────────────────────────

export async function exportarRelatorioVendasPDF() {
    showToast('Gerando PDF...', 'info');
    try {
        const jsPDF = await carregarJsPDF();

        // --- Busca orçamentos fechados do mês selecionado ---
        const startPeriodo = new Date(store.currentYear, store.currentMonth - 1, 1).toISOString();
        const endPeriodo   = new Date(store.currentYear, store.currentMonth,     1).toISOString();

        const idsFechado = store.mapStatusUUID
            .filter(s => [STATUS.FECHADO, STATUS.VENDIDO].includes(s.nome))
            .map(s => s.id_status);

        let query = db.from('orcamentos')
            .select('protocolo, valor_orcado, modelo_colchao, data_fechamento, clientes(nome_cliente), usuarios(nome, id_loja), status_orcamento(nome)')
            .in('id_status', idsFechado.length ? idsFechado : ['00000000-0000-0000-0000-000000000000'])
            .gte('data_fechamento', startPeriodo)
            .lt('data_fechamento', endPeriodo)
            .order('data_fechamento', { ascending: false })
            .limit(500);

        // Aplica filtro de loja (Gerente enxerga só as próprias lojas)
        const lojasPermitidas = getLojasPermitidas();
        if (lojasPermitidas && lojasPermitidas.length > 0) {
            const ids = store.todosVendedores
                .filter(v => lojasPermitidas.includes(v.id_loja))
                .map(v => v.id_usuario);
            if (ids.length) query = query.in('id_usuario', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
        }

        if (store.selectedVendedor !== 'todos') {
            query = query.eq('id_usuario', store.selectedVendedor);
        }

        const { data: orcs, error } = await query;
        if (error) throw error;

        const nomeMes = new Date(store.currentYear, store.currentMonth - 1, 1)
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        let y = adicionarCabecalhoPDF(doc, 'Relatório de Vendas', nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1));

        // --- Bloco de KPIs ---
        const totalVendido = (orcs || []).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
        const ticketMedio  = orcs?.length ? totalVendido / orcs.length : 0;

        const kpis = [
            { label: 'Total vendido', valor: fmt(totalVendido) },
            { label: 'Negócios fechados', valor: String(orcs?.length || 0) },
            { label: 'Ticket médio', valor: fmt(ticketMedio) },
        ];

        // Boxes de KPI lado a lado
        const boxW = 55, boxH = 16, boxGap = 7;
        const boxStartX = 14;
        kpis.forEach((k, i) => {
            const bx = boxStartX + i * (boxW + boxGap);
            doc.setFillColor(243, 246, 255);
            doc.roundedRect(bx, y, boxW, boxH, 3, 3, 'F');
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(k.label, bx + 4, y + 5.5);
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.text(k.valor, bx + 4, y + 12);
        });

        y += boxH + 8;

        // --- Tabela de orçamentos ---
        const rows = (orcs || []).map(o => [
            o.protocolo || '-',
            o.clientes?.nome_cliente || '-',
            (o.modelo_colchao || '-').split(',').map(p => p.trim()).filter(Boolean).join('; '),
            o.usuarios?.nome || '-',
            fmtData(o.data_fechamento),
            fmt(parseFloat(o.valor_orcado || 0))
        ]);

        doc.autoTable({
            startY: y,
            head: [['Protocolo', 'Cliente', 'Produto(s)', 'Vendedor', 'Data', 'Valor']],
            body: rows,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 22 },
                1: { cellWidth: 45 },
                2: { cellWidth: 50 },
                3: { cellWidth: 28 },
                4: { cellWidth: 18 },
                5: { cellWidth: 25, halign: 'right' }
            },
            foot: [['', '', '', '', 'Total', fmt(totalVendido)]],
            footStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'right' },
            margin: { left: 14, right: 14 },
            didDrawPage: () => {}
        });

        adicionarRodapePDF(doc);

        const nomeArquivo = `relatorio-vendas-${store.currentMonth.toString().padStart(2, '0')}-${store.currentYear}.pdf`;
        doc.save(nomeArquivo);
        showToast('PDF gerado com sucesso!', 'success');
    } catch (e) {
        console.error('Erro ao gerar PDF de vendas:', e);
        showToast('Erro ao gerar PDF. Tente novamente.', 'error');
    }
}

// ───────────────────────────────────────────────────────────────
// 2. LISTA DE ORÇAMENTOS — Excel (Carteira / Kanban)
// ───────────────────────────────────────────────────────────────

export async function exportarOrcamentosExcel() {
    showToast('Gerando planilha...', 'info');
    try {
        const XLSX = await carregarXLSX();

        // Busca todos os orçamentos visíveis (mesma lógica de scoping da carteira)
        let query = db.from('orcamentos')
            .select('protocolo, data_criacao, data_fechamento, valor_orcado, modelo_colchao, observacoes, clientes(nome_cliente, whatsapp, email), usuarios(nome), status_orcamento(nome)')
            .is('deleted_at', null)
            .order('data_criacao', { ascending: false })
            .limit(2000);

        if (store.currentUser.perfil === 'Vendedor') {
            query = query.eq('id_usuario', store.currentUser.id_usuario);
        } else if (store.currentUser.perfil === 'Gerente') {
            const lojasPermitidas = getLojasPermitidas();
            const ids = store.todosVendedores
                .filter(v => lojasPermitidas && lojasPermitidas.includes(v.id_loja))
                .map(v => v.id_usuario);
            if (ids.length) query = query.in('id_usuario', ids);
        }
        // Admin: sem filtro extra — vê tudo

        if (store.selectedVendedor !== 'todos') {
            query = query.eq('id_usuario', store.selectedVendedor);
        }

        const { data: orcs, error } = await query;
        if (error) throw error;

        // Monta array de objetos para a planilha
        const linhas = (orcs || []).map(o => ({
            'Protocolo':   o.protocolo || '-',
            'Cliente':     o.clientes?.nome_cliente || '-',
            'WhatsApp':    o.clientes?.whatsapp || '-',
            'E-mail':      o.clientes?.email || '-',
            'Produto(s)':  (o.modelo_colchao || '-').split(',').map(p => p.trim()).filter(Boolean).join('; '),
            'Valor (R$)':  parseFloat(o.valor_orcado || 0),
            'Vendedor':    o.usuarios?.nome || '-',
            'Status':      o.status_orcamento?.nome || '-',
            'Abertura':    fmtData(o.data_criacao),
            'Fechamento':  fmtData(o.data_fechamento),
            'Observações': o.observacoes || '',
        }));

        const ws = XLSX.utils.json_to_sheet(linhas);

        // Larguras de coluna
        ws['!cols'] = [
            { wch: 14 }, // Protocolo
            { wch: 32 }, // Cliente
            { wch: 16 }, // WhatsApp
            { wch: 28 }, // E-mail
            { wch: 40 }, // Produto(s)
            { wch: 14 }, // Valor
            { wch: 22 }, // Vendedor
            { wch: 20 }, // Status
            { wch: 12 }, // Abertura
            { wch: 14 }, // Fechamento
            { wch: 40 }, // Observações
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Orçamentos');

        // Aba de totais por vendedor
        const porVendedor = {};
        linhas.forEach(l => {
            const v = l['Vendedor'];
            if (!porVendedor[v]) porVendedor[v] = { vendedor: v, quantidade: 0, total: 0 };
            porVendedor[v].quantidade++;
            porVendedor[v].total += l['Valor (R$)'];
        });
        const resumo = Object.values(porVendedor).map(v => ({
            'Vendedor': v.vendedor,
            'Qtd. Orçamentos': v.quantidade,
            'Total (R$)': v.total
        }));
        const wsResumo = XLSX.utils.json_to_sheet(resumo);
        wsResumo['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por Vendedor');

        const nomeMes = new Date(store.currentYear, store.currentMonth - 1, 1)
            .toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase();
        XLSX.writeFile(wb, `orcamentos-${nomeMes}-${store.currentYear}.xlsx`);
        showToast('Planilha gerada com sucesso!', 'success');
    } catch (e) {
        console.error('Erro ao gerar Excel de orçamentos:', e);
        showToast('Erro ao gerar planilha. Tente novamente.', 'error');
    }
}

// ───────────────────────────────────────────────────────────────
// 3. FICHA DO CLIENTE — PDF individual
// ───────────────────────────────────────────────────────────────

export async function exportarFichaClientePDF({ cliente, orcamentos }) {
    showToast('Gerando PDF da ficha...', 'info');
    try {
        const jsPDF = await carregarJsPDF();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const nome = cliente.nome_cliente || 'Cliente';
        let y = adicionarCabecalhoPDF(doc, 'Ficha do Cliente', nome);

        // --- Dados pessoais ---
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, y, 182, 34, 3, 3, 'F');

        const campos = [
            ['Nome', nome],
            ['Código', cliente.id_cliente_codigo || String(cliente.id_cliente || '').slice(0, 8) || '-'],
            ['CPF', cliente.cpf || '-'],
            ['WhatsApp', cliente.whatsapp || '-'],
            ['E-mail', cliente.email || '-'],
            ['Cadastro', fmtData(cliente.data_criacao || cliente.criado_em)],
        ];

        let cx = 18, cy = y + 7;
        campos.forEach(([label, valor], i) => {
            if (i === 3) { cx = 18; cy = y + 22; } // segunda linha
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'normal');
            doc.text(label, cx, cy);
            doc.setFontSize(9);
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.text(String(valor).substring(0, 28), cx, cy + 5);
            cx += 60;
        });

        y += 40;

        // --- Tabela de histórico de orçamentos ---
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text('Histórico de Orçamentos', 14, y);
        y += 5;

        const rows = (orcamentos || []).map(o => {
            const st = o.status_orcamento?.nome || '-';
            return [
                o.protocolo || '-',
                (o.modelo_colchao || '-').split(',').map(p => p.trim()).filter(Boolean).join('; '),
                o.usuarios?.nome || '-',
                fmtData(o.data_criacao),
                st,
                fmt(parseFloat(o.valor_orcado || 0))
            ];
        });

        const totalGasto = (orcamentos || [])
            .filter(o => [STATUS.FECHADO, STATUS.VENDIDO].includes(o.status_orcamento?.nome))
            .reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);

        doc.autoTable({
            startY: y,
            head: [['Protocolo', 'Produto(s)', 'Vendedor', 'Data', 'Status', 'Valor']],
            body: rows,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 22 },
                1: { cellWidth: 55 },
                2: { cellWidth: 30 },
                3: { cellWidth: 20 },
                4: { cellWidth: 30 },
                5: { cellWidth: 25, halign: 'right' }
            },
            foot: rows.length ? [['', '', '', '', 'Total comprado', fmt(totalGasto)]] : [],
            footStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
            margin: { left: 14, right: 14 },
        });

        adicionarRodapePDF(doc);

        const nomeArquivo = `ficha-${(nome).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.pdf`;
        doc.save(nomeArquivo);
        showToast('PDF da ficha gerado!', 'success');
    } catch (e) {
        console.error('Erro ao gerar PDF da ficha:', e);
        showToast('Erro ao gerar PDF. Tente novamente.', 'error');
    }
}
