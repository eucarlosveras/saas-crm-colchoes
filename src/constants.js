// ═══════════════════════════════════════════════════════════════
// Módulo: constants.js — extraído automaticamente do antigo app.js monolítico
// ═══════════════════════════════════════════════════════════════

const META_PADRAO = 50000;
const ITEMS_PER_PAGE = 7;
const LIMITE_ESTOQUE_BAIXO = 3; // Qtd disponível igual ou abaixo disso dispara alerta

        const STATUS = {
	CONTATO_INICIAL: 'Contato Inicial',
  	NEGOCIACAO: 'Negociação',
    	EM_FECHAMENTO: 'Em Fechamento',
    	FECHADO: 'Fechado',
    	PERDIDO: 'Perdido'
        };

export { STATUS, META_PADRAO, ITEMS_PER_PAGE, LIMITE_ESTOQUE_BAIXO };
