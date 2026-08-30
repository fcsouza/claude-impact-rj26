import type {
  AtualizacaoTentativa,
  Channel,
  Mensagem,
  ResultadoEnvio,
  StatusEnvio,
} from './tipos.ts';

/**
 * WhatsApp pela Cloud API oficial, com a Kapso no meio. O endereço é o proxy Meta
 * da Kapso — `https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages` —
 * e o corpo é o payload da Meta, não um formato próprio da Kapso.
 *
 * Fora da janela de 24 horas a Meta só aceita template aprovado. Quando
 * `KAPSO_TEMPLATE_CONVOCACAO` está definido, o envio usa o template; sem ele, vai
 * texto livre, que só chega se a família escreveu para a unidade nas últimas 24h.
 */
const BASE = process.env.KAPSO_API_BASE_URL ?? 'https://api.kapso.ai';
const VERSAO = process.env.META_GRAPH_VERSION ?? 'v24.0';

type RespostaEnvio = {
  messages?: { id: string }[];
  error?: { message?: string; code?: number };
};

export function kapso(): Channel {
  const apiKey = process.env.KAPSO_API_KEY ?? '';
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID ?? '';
  const template = process.env.KAPSO_TEMPLATE_CONVOCACAO ?? '';
  const idioma = process.env.KAPSO_TEMPLATE_IDIOMA ?? 'pt_BR';

  return {
    nome: 'whatsapp',
    parseWebhook(corpo: unknown): AtualizacaoTentativa[] {
      const evento = corpo as
        | {
            entry?: {
              changes?: {
                value?: {
                  statuses?: { id: string; status: string }[];
                  messages?: {
                    from: string;
                    text?: { body: string };
                    context?: { id: string };
                  }[];
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
            // A família costuma responder sem citar a mensagem: sem `context.id`
            // a ligação com a tentativa é feita pelo telefone de quem escreveu.
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
      if (!(apiKey && phoneNumberId)) {
        return {
          erro: 'KAPSO_API_KEY ou KAPSO_PHONE_NUMBER_ID ausente',
          ok: false,
          status: 'falhou',
        };
      }

      const corpoMensagem = template
        ? {
            messaging_product: 'whatsapp',
            template: {
              components: [
                {
                  parameters: (mensagem.parametros ?? []).map((valor) => ({
                    text: valor,
                    type: 'text',
                  })),
                  type: 'body',
                },
              ],
              language: { code: idioma },
              name: template,
            },
            to: mensagem.destino,
            type: 'template',
          }
        : {
            messaging_product: 'whatsapp',
            text: { body: mensagem.texto },
            to: mensagem.destino,
            type: 'text',
          };

      try {
        const resposta = await fetch(`${BASE}/meta/whatsapp/${VERSAO}/${phoneNumberId}/messages`, {
          body: JSON.stringify(corpoMensagem),
          headers: { 'content-type': 'application/json', 'X-API-Key': apiKey },
          method: 'POST',
        });

        const corpo = (await resposta.json()) as RespostaEnvio;
        if (!resposta.ok) {
          return {
            erro: corpo.error?.message ?? `HTTP ${resposta.status}`,
            ok: false,
            payload: corpo as Record<string, unknown>,
            status: 'falhou',
          };
        }

        return {
          ok: true,
          payload: corpo as Record<string, unknown>,
          providerId: corpo.messages?.[0]?.id,
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
