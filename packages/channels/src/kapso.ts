import type {
  AtualizacaoTentativa,
  Channel,
  Mensagem,
  ResultadoEnvio,
  StatusEnvio,
} from './tipos.ts';

const BASE = process.env.KAPSO_BASE_URL ?? 'https://app.kapso.ai/api/v1';

/** WhatsApp pela Cloud API oficial intermediada pela Kapso. */
export function kapso(): Channel {
  const apiKey = process.env.KAPSO_API_KEY ?? '';
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID ?? '';

  return {
    nome: 'whatsapp',
    parseWebhook(corpo: unknown): AtualizacaoTentativa[] {
      const evento = corpo as
        | {
            entry?: {
              changes?: {
                value?: {
                  statuses?: { id: string; status: string }[];
                  messages?: { from: string; text?: { body: string }; context?: { id: string } }[];
                };
              }[];
            }[];
          }
        | null
        | undefined;

      const saida: AtualizacaoTentativa[] = [];
      for (const entrada of evento?.entry ?? []) {
        for (const mudanca of entrada.changes ?? []) {
          for (const status of mudanca.value?.statuses ?? []) {
            saida.push({ providerId: status.id, status: traduzirStatus(status.status) });
          }
          for (const msg of mudanca.value?.messages ?? []) {
            saida.push({
              inbound: { remetente: msg.from, texto: msg.text?.body ?? '' },
              providerId: msg.context?.id,
              status: 'respondido',
            });
          }
        }
      }
      return saida;
    },
    provedor: 'kapso',
    async send(mensagem: Mensagem): Promise<ResultadoEnvio> {
      if (!apiKey) {
        return { erro: 'KAPSO_API_KEY ausente', ok: false, status: 'falhou' };
      }
      try {
        const resposta = await fetch(`${BASE}/whatsapp/messages`, {
          body: JSON.stringify({
            metadata: { referencia: mensagem.referencia },
            phone_number_id: phoneNumberId,
            text: { body: mensagem.texto },
            to: mensagem.destino,
            type: 'text',
          }),
          headers: { 'content-type': 'application/json', 'X-API-Key': apiKey },
          method: 'POST',
        });
        const corpo = (await resposta.json()) as {
          id?: string;
          message_id?: string;
          error?: unknown;
        };
        if (!resposta.ok) {
          return {
            erro: JSON.stringify(corpo),
            ok: false,
            payload: corpo as Record<string, unknown>,
            status: 'falhou',
          };
        }
        return {
          ok: true,
          payload: corpo as Record<string, unknown>,
          providerId: corpo.message_id ?? corpo.id,
          status: 'enviado',
        };
      } catch (erro) {
        return { erro: String(erro), ok: false, status: 'falhou' };
      }
    },
  };
}

function traduzirStatus(status: string): StatusEnvio {
  switch (status) {
    case 'sent':
      return 'enviado';
    case 'delivered':
      return 'entregue';
    case 'read':
      return 'lido';
    case 'failed':
      return 'falhou';
    default:
      return 'enviado';
  }
}
