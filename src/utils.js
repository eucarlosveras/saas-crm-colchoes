// ═══════════════════════════════════════════════════════════════
// Módulo: utils.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════


        function getHojeBrasilia() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

        function getAgoraBrasiliaISO() {
            const agora = new Date();
            const partes = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }).formatToParts(agora).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
            return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}-03:00`;
        }

        function addDiasBrasilia(dias) { const base = new Date(getHojeBrasilia() + 'T00:00:00Z'); base.setUTCDate(base.getUTCDate() + dias); return base.toISOString().split('T')[0]; }

        function escapeHtml(str) { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

        function timeAgo(dateString) {
            if (!dateString) return '-';
            const dataStr = new Date(dateString).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const hojeStr = getHojeBrasilia();
            if (dataStr === hojeStr) return 'Hoje';
            if (dataStr === addDiasBrasilia(-1)) return 'Ontem';
            const diff = Math.round((new Date(hojeStr + 'T00:00:00Z') - new Date(dataStr + 'T00:00:00Z')) / (1000 * 60 * 60 * 24));
            return 'há ' + diff + ' dias';
        }

        function getDateLabel(dateStr) { const d = new Date(dateStr); const hoje = new Date(); const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1); if (d.toDateString() === hoje.toDateString()) return 'Hoje'; if (d.toDateString() === ontem.toDateString()) return 'Ontem'; return d.toLocaleDateString('pt-BR'); }

        function getUltimaVisita(id) { const ts = localStorage.getItem('ultima_visita_' + id); return ts ? parseInt(ts) : 0; }

        function setUltimaVisita(id) { localStorage.setItem('ultima_visita_' + id, Date.now().toString()); }

        function isCommentNew(commentDateStr, clienteId) { const commentTime = new Date(commentDateStr).getTime(); const lastVisit = getUltimaVisita(clienteId); if (lastVisit === 0) return false; return commentTime > lastVisit; }

        function addDiasADataStr(dataStr, dias) {
            const d = new Date(dataStr + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + dias);
            return d.toISOString().split('T')[0];
        }

        function getInicioSemanaBrasilia(deslocamentoSemanas = 0) {
            const hoje = new Date(getHojeBrasilia() + 'T00:00:00Z');
            const diaSemana = hoje.getUTCDay(); // 0=domingo...6=sábado
            const diasDesdeSegunda = (diaSemana + 6) % 7; // segunda=0
            return addDiasBrasilia(-diasDesdeSegunda + deslocamentoSemanas * 7);
        }

        function getPrimeiroDiaMes(dataStr) {
            const d = new Date(dataStr + 'T00:00:00Z');
            return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().split('T')[0];
        }

        function deslocarDataEmMeses(dataStr, deslocamentoMeses) {
            const d = new Date(dataStr + 'T00:00:00Z');
            const ano = d.getUTCFullYear(), mes = d.getUTCMonth(), dia = d.getUTCDate();
            const novoMesIndex = mes + deslocamentoMeses;
            const ultimoDiaDoMesDestino = new Date(Date.UTC(ano, novoMesIndex + 1, 0)).getUTCDate();
            return new Date(Date.UTC(ano, novoMesIndex, Math.min(dia, ultimoDiaDoMesDestino))).toISOString().split('T')[0];
        }

        function classToFormatStatus(status) {
          const map = { 
           'Contato Inicial': 'contato-inicial', 
           'Negociação': 'negociacao-valores',  
           'Em Fechamento': 'aguardando-decisao', 
           'Fechado': 'fechado', 
           'Perdido': 'perdido' 
     };
    return map[status] || 'em-atendimento';
  }

        const AVATAR_COLORS = ['#0F766E', '#7c3aed', '#0369a1', '#c2410c', '#991b1b', '#065f46', '#854d0e', '#5b21b6'];

        function getAvatarColor(nome) {
            const str = nome || '?';
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
        }

        function getIniciais(nome) {
            const partes = (nome || '?').trim().split(/\s+/).filter(Boolean);
            if (partes.length === 0) return '?';
            if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
            return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
        }

        function formatCurrency(value) { let num = value.replace(/\D/g, ''); num = (parseInt(num) || 0).toString(); return 'R$ ' + parseInt(num.slice(0, -2) || '0').toLocaleString('pt-BR') + ',' + num.slice(-2).padStart(2, '0'); }

        function parseCurrency(value) { return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0; }

        function formatarProdutos(modelo_colchao) {
            if (!modelo_colchao) return '-';
            
            // Separa os produtos
            const produtos = modelo_colchao.split(',').map(p => p.trim()).filter(Boolean);
            if (produtos.length === 0) return '-';

            const primeiroProduto = escapeHtml(produtos[0]);
            
            // Se tem só 1 produto, mostra ele normalmente
            if (produtos.length === 1) {
                return primeiroProduto;
            } 
            
            // Se tem mais de 1, mostra o primeiro + a tag com a quantidade extra
            const qtdExtra = produtos.length - 1;
            const tagPlural = qtdExtra > 1 ? 'itens' : 'item';
            
            return `${primeiroProduto} <br><span style="display:inline-block; margin-top:4px; font-size:10px; font-weight:700; color:var(--brand-blue-dark); background:var(--brand-blue-subtle); border: 1px solid rgba(15, 118, 110, 0.25); padding:2px 8px; border-radius:12px;">+ ${qtdExtra} ${tagPlural}</span>`;
        }

        function validateField(idInput, idErro) { const el = document.getElementById(idInput); const err = document.getElementById(idErro); if (!el || !err) return; const val = el.value.trim(); if (!val) { err.textContent = 'Obrigatório'; el.style.borderColor = '#ef4444'; return false; } else { err.textContent = ''; el.style.borderColor = 'var(--border-light)'; return true; } }

        // Neutraliza CSV/formula injection: se o campo começa com = + - @ (ou tab/CR,
        // menos comuns), o Excel/Sheets pode interpretar como fórmula ao abrir o
        // arquivo. Prefixar com apóstrofo faz o programa tratar como texto puro.
        function sanitizeCsvField(value) {
            const str = String(value ?? '');
            return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
        }

export { AVATAR_COLORS, addDiasADataStr, addDiasBrasilia, classToFormatStatus, deslocarDataEmMeses, escapeHtml, formatCurrency, formatarProdutos, getAgoraBrasiliaISO, getAvatarColor, getDateLabel, getHojeBrasilia, getIniciais, getInicioSemanaBrasilia, getPrimeiroDiaMes, getUltimaVisita, isCommentNew, parseCurrency, sanitizeCsvField, setUltimaVisita, timeAgo, validateField };
