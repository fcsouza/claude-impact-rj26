import type { AtualizacaoTentativa, Channel, Mensagem, ResultadoEnvio } from './tipos.ts';

/**
 * SMS pela Comtele. Os nomes seguem a API v2 documentada em docs.comtele.com.br:
 * cabeçalho `auth-key`, corpo com `Content`, `Receivers` e `Sender`, e resposta
 * `{ Success, Object: { requestUniqueId } }`. Não é o padrão REST de outros
 * provedores — foi conferido contra a documentação, não suposto.
 */
const BASE = process.env.CONTELE_BASE_URL ?? 'https://sms.comtele.com.br/api/v2';

interface RespostaEnvio {
  Message?: string;
  Object?: { requestUniqueId?: string };
  Success?: boolean;
}

/** O status chega em PascalCase; a resposta da família vem em `ReceivedContent`. */
type WebhookComtele = {
  Sender?: string;
  Status?: string;
  PhoneNumber?: string;
  StatusDate?: string;
  ReceivedContent?: string;
  SentContent?: string;
  ReceiveDate?: string;
  SenderName?: string;
} | null;

export function contele(): Channel {
  const apiKey = process.env.CONTELE_API_KEY ?? '';

  return {
    nome: 'sms',
    parseWebhook(corpo: unknown): AtualizacaoTentativa[] {
      const c = corpo as WebhookComtele;
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
        {
          referencia: c.Sender,
          status: (c.Status ? porStatus[c.Status] : undefined) ?? 'enviado',
        },
      ];
    },
    provedor: 'contele',
    async send(mensagem: Mensagem): Promise<ResultadoEnvio> {
      if (!apiKey) {
        return { erro: 'CONTELE_API_KEY ausente', ok: false, status: 'falhou' };
      }
      try {
        const resposta = await fetch(`${BASE}/send`, {
          body: JSON.stringify({
            Content: mensagem.texto,
            Receivers: mensagem.destino,
            // A Comtele chama de `Sender` o identificador que volta no webhook.
            Sender: mensagem.referencia,
          }),
          headers: { 'auth-key': apiKey, 'content-type': 'application/json' },
          method: 'POST',
        });

        const corpo = (await resposta.json()) as RespostaEnvio;
        if (!(resposta.ok && corpo.Success)) {
          return {
            erro: corpo.Message ?? `HTTP ${resposta.status}`,
            ok: false,
            payload: corpo as Record<string, unknown>,
            status: 'falhou',
          };
        }

        return {
          ok: true,
          payload: corpo as Record<string, unknown>,
          providerId: corpo.Object?.requestUniqueId,
          status: 'enviado',
        };
      } catch (erro) {
        return { erro: String(erro), ok: false, status: 'falhou' };
      }
    },
  };
}
