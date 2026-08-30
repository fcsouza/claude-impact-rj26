import type { AtualizacaoTentativa, Channel, Mensagem, ResultadoEnvio } from './tipos.ts';

const BASE = process.env.CONTELE_BASE_URL ?? 'https://api.contelesms.com.br/v1';

export function contele(): Channel {
  const apiKey = process.env.CONTELE_API_KEY ?? '';

  return {
    nome: 'sms',
    parseWebhook(corpo: unknown): AtualizacaoTentativa[] {
      const c = corpo as {
        id?: string;
        reference?: string;
        status?: string;
        message?: string;
        from?: string;
      };
      if (!c) {
        return [];
      }
      const status =
        c.status === 'delivered' ? 'entregue' : c.status === 'failed' ? 'falhou' : 'enviado';
      return [
        {
          inbound: c.message ? { remetente: c.from, texto: c.message } : undefined,
          providerId: c.id,
          referencia: c.reference,
          status: c.message ? 'respondido' : status,
        },
      ];
    },
    provedor: 'contele',
    async send(mensagem: Mensagem): Promise<ResultadoEnvio> {
      if (!apiKey) {
        return { erro: 'CONTELE_API_KEY ausente', ok: false, status: 'falhou' };
      }
      try {
        const resposta = await fetch(`${BASE}/sms`, {
          body: JSON.stringify({
            message: mensagem.texto,
            reference: mensagem.referencia,
            to: mensagem.destino,
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
