export type CanalNome = 'whatsapp' | 'sms' | 'email';

export type StatusEnvio = 'enviado' | 'entregue' | 'lido' | 'falhou' | 'respondido';

export interface Mensagem {
  assunto?: string;
  destino: string;
  /** Chave que volta no webhook do provedor e liga a atualização à tentativa. */
  referencia: string;
  texto: string;
}

export interface ResultadoEnvio {
  erro?: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  providerId?: string;
  status: StatusEnvio;
}

export interface AtualizacaoTentativa {
  /** Texto quando o webhook traz resposta da família. */
  inbound?: { texto: string; remetente?: string };
  providerId?: string;
  referencia?: string;
  status?: StatusEnvio;
}

export interface Channel {
  nome: CanalNome;
  parseWebhook: (corpo: unknown, cabecalhos?: Record<string, string>) => AtualizacaoTentativa[];
  provedor: string;
  send: (mensagem: Mensagem) => Promise<ResultadoEnvio>;
}
