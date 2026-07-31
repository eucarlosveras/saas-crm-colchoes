// Componente de IA (Chat e Análise)

import { db } from '../config/supabase.js';
import { EDGE_FUNCTION_URL } from '../config/constants.js';
import { openModal, closeModal, showToast } from './ui.js';

let chatIAMessages = [];

/**
 * Analisa cliente com IA
 */
export async function analisarClienteComIA(idOrcamentoAtual) {
  try {
    // Busca dados do orçamento
    const { data: orcamento, error } = await db
      .from('orcamentos')
      .select(`
        *,
        clientes(*),
        status_orcamento(nome),
        comentarios(*)
      `)
      .eq('id_orcamento', idOrcamentoAtual)
      .single();
    
    if (error || !orcamento) {
      showToast('Dados do cliente não encontrados', 'error');
      return;
    }
    
    // Monta contexto para IA
    const contexto = {
      cliente: orcamento.clientes,
      orcamento: {
        valor: orcamento.valor_orcado,
        produtos: orcamento.modelo_colchao,
        status: orcamento.status_orcamento?.nome,
        dataCriacao: orcamento.data_criacao
      },
      comentarios: orcamento.comentarios || [],
      historico: []
    };
    
    // Chama IA
    const prompt = `Analise este cliente e dê recomendações de venda. Contexto: ${JSON.stringify(contexto)}`;
    const resposta = await chamarIA(prompt, JSON.stringify(contexto));
    
    // Abre modal de chat com resposta
    abrirModalChatIA(resposta, orcamento.clientes?.nome_cliente);
    
  } catch (err) {
    console.error('Erro ao analisar com IA:', err);
    showToast('Erro ao analisar cliente com IA', 'error');
  }
}

/**
 * Chama API de IA
 */
export async function chamarIA(prompt, contexto = '') {
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        contexto: contexto
      })
    });
    
    if (!response.ok) {
      throw new Error('Erro na comunicação com IA');
    }
    
    const data = await response.json();
    return data.text || data.response || 'Sem resposta da IA';
    
  } catch (err) {
    console.error('Erro ao chamar IA:', err);
    return 'Desculpe, ocorreu um erro ao processar sua solicitação.';
  }
}

/**
 * Abre modal de chat IA
 */
export function abrirModalChatIA(respostaInicial = '', nomeCliente = '') {
  const modal = document.getElementById('modalChatIA');
  if (!modal) return;
  
  // Inicializa mensagens
  chatIAMessages = [];
  
  // Adiciona mensagem inicial se houver
  if (respostaInicial) {
    chatIAMessages.push({
      id: Date.now().toString(),
      role: 'assistant',
      content: respostaInicial
    });
  }
  
  // Atualiza título
  const titleEl = document.getElementById('chatIATitle');
  if (titleEl && nomeCliente) {
    titleEl.textContent = `IA · ${nomeCliente}`;
  }
  
  // Renderiza mensagens
  renderizarMensagensChat();
  
  // Abre modal
  openModal('modalChatIA');
  
  // Focus no input
  setTimeout(() => {
    const input = document.getElementById('chatInputIA');
    if (input) input.focus();
  }, 200);
}

/**
 * Fecha modal de chat IA
 */
export function fecharModalChatIA() {
  closeModal('modalChatIA');
}

/**
 * Renderiza mensagens do chat
 */
export function renderizarMensagensChat() {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;
  
  container.innerHTML = chatIAMessages.map(msg => {
    const isUser = msg.role === 'user';
    return `
      <div style="display:flex; gap:12px; ${isUser ? 'flex-direction:row-reverse;' : ''}">
        <div style="width:32px; height:32px; border-radius:50%; background:${isUser ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'linear-gradient(135deg, #10b981, #059669)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${isUser
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>'
          }
        </div>
        <div style="max-width:75%; padding:12px 16px; border-radius:16px; background:${isUser ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'white'}; color:${isUser ? 'white' : 'var(--text-primary)'}; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <div style="font-size:13.5px; line-height:1.6; white-space:pre-wrap;">${formatarMensagemIA(msg.content)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Auto-scroll
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 50);
}

/**
 * Formata mensagem IA (escapa HTML e aplica formatação)
 */
export function formatarMensagemIA(texto) {
  if (!texto) return '';
  
  // Escapa HTML para XSS
  const escaped = escapeHtml(texto);
  
  // Aplica formatação básica
  return escaped
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Envia mensagem no chat IA
 */
export async function enviarMensagemChatIA() {
  const input = document.getElementById('chatInputIA');
  const btn = document.getElementById('btnEnviarChatIA');
  
  if (!input || !btn) return;
  
  const texto = input.value.trim();
  if (!texto) return;
  
  // Desabilita botão
  btn.disabled = true;
  btn.style.opacity = '0.6';
  
  // Adiciona mensagem do usuário
  chatIAMessages.push({
    id: Date.now().toString(),
    role: 'user',
    content: texto
  });
  
  input.value = '';
  renderizarMensagensChat();
  
  try {
    // Busca contexto do cliente atual
    const { contextoVenda } = await import('../config/state.js');
    const orc = contextoVenda.clienteAtual;
    
    if (!orc) {
      throw new Error('Cliente atual não encontrado.');
    }
    
    // Monta prompt com contexto
    const contexto = {
      cliente: orc.clientes,
      orcamento: {
        valor: orc.valor_orcado,
        produtos: orc.modelo_colchao,
        status: orc.status
      }
    };
    
    const promptCompleto = `${texto}\n\nContexto: ${JSON.stringify(contexto)}`;
    
    // Chama IA
    const resposta = await chamarIA(promptCompleto, JSON.stringify(contexto));
    
    // Adiciona resposta
    chatIAMessages.push({
      id: Date.now().toString(),
      role: 'assistant',
      content: resposta
    });
    
    renderizarMensagensChat();
    
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    showToast('Erro ao enviar mensagem', 'error');
    
    // Adiciona mensagem de erro
    chatIAMessages.push({
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Desculpe, ocorreu um erro. Tente novamente.'
    });
    
    renderizarMensagensChat();
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

// Helper local
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
