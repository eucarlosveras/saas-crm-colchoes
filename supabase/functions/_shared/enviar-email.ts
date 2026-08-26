// _shared/enviar-email.ts — helper de envio via Resend, usado por qualquer
// Edge Function que precise notificar por e-mail. Best-effort de propósito:
// nunca lança exceção — quem chama decide se quer logar o erro, mas uma
// falha de e-mail nunca deve derrubar a operação de negócio que já
// aconteceu (ex: aprovação de usuário já foi gravada no banco).
//
// Modo sandbox (sem domínio próprio verificado no Resend): remetente é
// sempre onboarding@resend.dev e só entrega pro e-mail cadastrado na conta
// Resend — qualquer outro destinatário "envia com sucesso" e é descartado
// silenciosamente do lado do Resend. Quando houver domínio próprio
// verificado, troca RESEND_FROM pra um endereço do domínio.

export async function enviarEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('RESEND_API_KEY não configurada — e-mail não enviado (', subject, '->', to, ')');
    return false;
  }
  const from = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error('Resend respondeu erro:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Falha ao chamar Resend:', err);
    return false;
  }
}
