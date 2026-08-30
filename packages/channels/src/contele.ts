import type { AtualizacaoTentativa, Channel, Mensagem, ResultadoEnvio } from './tipos.ts';

/**
 * SMS pela Comtele. Duas gerações de API convivem e usam nomes diferentes:
 *
 * - `nova` (padrão): `https://api.comtele.com.br/messages/sms/batch/send`, cabeçalho
 *   `x-api-key`, corpo com `messages` e `route`. O envio individual responde sem id,
 *   então o lote é o único caminho que deixa rastro.
 * - `v2`: `https://sms.comtele.com.br/api/v2/send`, cabeçalho `auth-key`, corpo com
 *   `Receivers`, `Content` e `Sender`.
 *
 * A chave só vale numa delas. `CONTELE_API_VERSAO` escolhe; o padrão é a nova.
 */
const VERSAO = process.env.CONTELE_API_VERSAO === 'v2' ? 'v2' : 'nova';

/**
 * Rota da conta na Comtele. Sem ela o envio volta com "a rota informada não está
 * cadastrada para o usuário". Conferir com:
 * `curl -H "x-api-key: $CONTELE_API_KEY" https://api.comtele.com.br/routes`.
 */
const ROTA = Number.parseInt(process.env.CONTELE_ROUTE_ID ?? '', 10) || 17;

const ACENTOS = /[\u0300-\u036f]/g;
const NAO_DIGITO = /\D/g;
const ZEROS_INICIAIS = /^0+/;

/** Acento vira caractere de 2 bytes no SMS e dobra o custo por mensagem. */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(ACENTOS, '');
}

/** A Comtele espera só dígitos, com DDI e sem o zero de discagem. */
function soDigitos(telefone: string): string {
  return telefone.replace(NAO_DIGITO, '').replace(ZEROS_INICIAIS, '');
}
const BASE =
  process.env.CONTELE_BASE_URL ??
  (VERSAO === 'v2' ? 'https://sms.comtele.com.br/api/v2' : 'https://api.comtele.com.br');

interface RespostaV2 {
  Message?: string;
  Object?: { requestUniqueId?: string };
  Success?: boolean;
}

interface RespostaNova {
  hasError?: boolean;
  message?: string | null;
  object?: { requestId?: string; credits?: number };
  totalRecords?: number;
}

/** O status chega em PascalCase; a resposta da família vem em `ReceivedContent`. */
interface WebhookComtele {
  PhoneNumber?: string;
  ReceiveDate?: string;
  ReceivedContent?: string;
  Sender?: string;
  SenderName?: string;
  SentContent?: string;
  Status?: string;
  StatusDate?: string;
}

/** A Comtele responde texto puro em alguns erros; JSON.parse cru esconderia a mensagem. */
async function lerCorpo(resposta: Response): Promise<{ json: unknown; texto: string }> {
  const texto = await resposta.text();
  try {
    return { json: JSON.parse(texto), texto };
  } catch {
    return { json: null, texto };
  }
}

export function contele(): Channel {
  const apiKey = process.env.CONTELE_API_KEY ?? '';

  return {
    nome: 'sms',

    parseWebhook(corpo: unknown): AtualizacaoTentativa[] {
      const c = corpo as WebhookComtele | null;
      if (!c) {
        return [];
      }

      // Dois formatos diferentes: quem tem `ReceivedContent` é resposta da família.
      if (c.ReceivedContent) {
        return [
          {
            inbound: { remetente: c.Sender, texto: c.ReceivedContent },
            referencia: c.Sender,
            status: 'respondido',
          },
        ];
      }

      const porStatus: Record<string, AtualizacaoTentativa['status']> = {
        Delivered: 'entregue',
        delivered: 'entregue',
        Failed: 'falhou',
        failed: 'falhou',
        Sent: 'enviado',
        sent: 'enviado',
      };

      return [
        { referencia: c.Sender, status: (c.Status ? porStatus[c.Status] : undefined) ?? 'enviado' },
      ];
    },
    provedor: 'contele',

    async send(mensagem: Mensagem): Promise<ResultadoEnvio> {
      if (!apiKey) {
        return { erro: 'CONTELE_API_KEY ausente', ok: false, status: 'falhou' };
      }

      const [url, cabecalho, corpo] =
        VERSAO === 'v2'
          ? [
              `${BASE}/send`,
              { 'auth-key': apiKey },
              { Content: mensagem.texto, Receivers: mensagem.destino, Sender: mensagem.referencia },
            ]
          : [
              // O envio individual responde sem id; só o lote deixa rastro para
              // cruzar com o relatório e com o webhook depois.
              `${BASE}/messages/sms/batch/send`,
              { 'x-api-key': apiKey },
              {
                custom: mensagem.referencia,
                messages: [
                  { message: semAcento(mensagem.texto), receiver: soDigitos(mensagem.destino) },
                ],
                route: ROTA,
                scheduleDate: null,
                tag: 'fila-viva',
              },
            ];

      try {
        const resposta = await fetch(url, {
          body: JSON.stringify(corpo),
          headers: { ...cabecalho, 'content-type': 'application/json' },
          method: 'POST',
        });

        const { json, texto } = await lerCorpo(resposta);

        if (!resposta.ok) {
          const nova = json as RespostaNova | null;
          const v2 = json as RespostaV2 | null;
          const detalhe = nova?.message ?? v2?.Message ?? texto.slice(0, 200);
          return { erro: `HTTP ${resposta.status}: ${detalhe}`, ok: false, status: 'falhou' };
        }

        if (VERSAO === 'v2') {
          const v2 = json as RespostaV2 | null;
          return v2?.Success
            ? {
                ok: true,
                payload: v2 as unknown as Record<string, unknown>,
                providerId: v2.Object?.requestUniqueId,
                status: 'enviado',
              }
            : { erro: v2?.Message ?? texto.slice(0, 200), ok: false, status: 'falhou' };
        }

        const nova = json as RespostaNova | null;
        return nova?.hasError
          ? { erro: nova.message ?? texto.slice(0, 200), ok: false, status: 'falhou' }
          : {
              ok: true,
              payload: (nova ?? {}) as unknown as Record<string, unknown>,
              // O lote devolve requestId; é o que permite cruzar com o relatório depois.
              providerId: nova?.object?.requestId,
              status: 'enviado',
            };
      } catch (erro) {
        return { erro: String(erro), ok: false, status: 'falhou' };
      }
    },
  };
}
