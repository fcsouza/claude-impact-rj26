import type { AtualizacaoTentativa, Channel, Mensagem, ResultadoEnvio } from './tipos.ts';

export function resend(): Channel {
  const apiKey = process.env.RESEND_API_KEY ?? '';
  const remetente = process.env.EMAIL_FROM ?? 'fila-viva@example.org';

  return {
    nome: 'email',
    parseWebhook(corpo: unknown): AtualizacaoTentativa[] {
      const evento = corpo as { type?: string; data?: { email_id?: string } } | null | undefined;
      const mapa: Record<string, AtualizacaoTentativa['status']> = {
        'email.bounced': 'falhou',
        'email.complained': 'falhou',
        'email.delivered': 'entregue',
        'email.failed': 'falhou',
        'email.opened': 'lido',
        'email.sent': 'enviado',
      };
      if (!evento?.type) {
        return [];
      }
      const status = mapa[evento.type];
      return status ? [{ providerId: evento.data?.email_id, status }] : [];
    },
    provedor: 'resend',
    async send(mensagem: Mensagem): Promise<ResultadoEnvio> {
      if (!apiKey) {
        return { erro: 'RESEND_API_KEY ausente', ok: false, status: 'falhou' };
      }
      try {
        const resposta = await fetch('https://api.resend.com/emails', {
          body: JSON.stringify({
            from: remetente,
            headers: { 'X-Entity-Ref-ID': mensagem.referencia },
            subject: mensagem.assunto ?? 'Vaga de creche',
            text: mensagem.texto,
            to: [mensagem.destino],
          }),
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          method: 'POST',
        });
        const corpo = (await resposta.json()) as { id?: string };
        return resposta.ok
          ? {
              ok: true,
              payload: corpo as Record<string, unknown>,
              providerId: corpo.id,
              status: 'enviado',
            }
          : { erro: JSON.stringify(corpo), ok: false, status: 'falhou' };
      } catch (erro) {
        return { erro: String(erro), ok: false, status: 'falhou' };
      }
    },
  };
}
