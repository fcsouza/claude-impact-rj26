import type { CanalNome, Channel, Mensagem, ResultadoEnvio } from './tipos.ts';

/**
 * Adapter obrigatório do PRD: grava a tentativa sem chamar provedor nenhum.
 * A demo inteira roda com ele e o log fica no stdout do worker.
 */
export function mock(nome: CanalNome): Channel {
  return {
    nome,
    parseWebhook(corpo: unknown): ReturnType<Channel['parseWebhook']> {
      const c = corpo as {
        referencia?: string;
        providerId?: string;
        status?: string;
        texto?: string;
      } | null;
      if (!c) {
        return [];
      }
      return [
        {
          inbound: c.texto ? { texto: c.texto } : undefined,
          providerId: c.providerId,
          referencia: c.referencia,
          status: (c.status as ResultadoEnvio['status']) ?? undefined,
        },
      ];
    },
    provedor: 'mock',
    async send(mensagem: Mensagem): Promise<ResultadoEnvio> {
      const providerId = `mock_${nome}_${Date.now().toString(36)}`;
      process.stdout.write(`[mock:${nome}] → ${mensagem.destino}\n${mensagem.texto}\n---\n`);
      return await Promise.resolve({
        ok: true,
        payload: {
          destino: mensagem.destino,
          referencia: mensagem.referencia,
          texto: mensagem.texto,
        },
        providerId,
        status: 'enviado',
      });
    },
  };
}
