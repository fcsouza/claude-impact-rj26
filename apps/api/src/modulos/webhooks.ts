import { classificarResposta, rascunharResposta } from '@fila-viva/ai';
import { canalPorProvedor } from '@fila-viva/channels';
import { convocacaoAbertaPorTelefone } from '@fila-viva/core';
import {
  convocacao,
  db,
  id,
  inscricao,
  mensagemInbound,
  opcao,
  tentativa,
  unidade,
} from '@fila-viva/db';
import { eq } from 'drizzle-orm';
import { Elysia, status } from 'elysia';
import { z } from 'zod';
import { PROBLEMAS } from '../erros.ts';

const TOKEN = process.env.WEBHOOK_TOKEN ?? '';

/** Segredo com que a Kapso assina o corpo, em HMAC-SHA256 hex, no X-Webhook-Signature. */
const SEGREDO_KAPSO = process.env.KAPSO_WEBHOOK_SECRET ?? '';

async function assinaturaConfere(corpoCru: string, assinatura: string | null): Promise<boolean> {
  if (!(SEGREDO_KAPSO && assinatura)) {
    // Sem segredo configurado, a barreira é só o token na URL.
    return !SEGREDO_KAPSO;
  }

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SEGREDO_KAPSO),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoCru));
  const esperada = Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Comparação de tempo constante: um `===` vaza o tamanho do prefixo correto.
  if (esperada.length !== assinatura.length) {
    return false;
  }
  let diferenca = 0;
  for (let i = 0; i < esperada.length; i += 1) {
    diferenca |= esperada.charCodeAt(i) ^ assinatura.charCodeAt(i);
  }
  return diferenca === 0;
}

/**
 * Webhooks dos provedores. Sem assinatura publicada, a barreira é o token na URL
 * (RNF3). O webhook nunca muda situação — no máximo registra e sugere.
 */
export const webhookRotas = new Elysia({ prefix: '/api/webhooks' }).post(
  '/:provedor',
  async ({ params, query, body, request }) => {
    if (!TOKEN || query.token !== TOKEN) {
      return status(401, PROBLEMAS.semSessao());
    }

    // O corpo chega como texto justamente para conferir a assinatura sobre os bytes crus.
    const corpoCru = typeof body === 'string' ? body : JSON.stringify(body);
    if (params.provedor === 'kapso') {
      const confere = await assinaturaConfere(corpoCru, request.headers.get('x-webhook-signature'));
      if (!confere) {
        return status(401, PROBLEMAS.semSessao());
      }
    }

    let corpoLido: unknown = body;
    if (typeof body === 'string') {
      try {
        corpoLido = JSON.parse(body);
      } catch {
        return status(400, PROBLEMAS.invalido('corpo do webhook não é JSON'));
      }
    }

    const canal = canalPorProvedor(params.provedor);
    if (!canal) {
      return status(404, PROBLEMAS.naoEncontrado(`provedor ${params.provedor} desconhecido`));
    }

    const atualizacoes = canal.parseWebhook(corpoLido);
    const processadas: string[] = [];

    for (const atualizacao of atualizacoes) {
      // biome-ignore lint/performance/noAwaitInLoops: cada atualização depende da anterior no banco
      const alvo = await acharTentativa(atualizacao);

      if (!alvo) {
        // Sem tentativa correspondente, só a resposta da família ainda interessa:
        // ela entra pela convocação aberta de quem escreveu.
        if (atualizacao.inbound?.texto && atualizacao.inbound.remetente) {
          const convocacaoDoTelefone = await convocacaoAbertaPorTelefone(
            db,
            atualizacao.inbound.remetente
          );
          if (convocacaoDoTelefone) {
            const registrada = await registrarInbound({
              canal: canal.nome,
              convocacaoId: convocacaoDoTelefone.convocacaoId,
              remetente: atualizacao.inbound.remetente,
              texto: atualizacao.inbound.texto,
            });
            processadas.push(registrada.id);
          }
        }
        continue;
      }

      if (atualizacao.status) {
        await db
          .update(tentativa)
          .set({ status: atualizacao.status })
          .where(eq(tentativa.id, alvo.id));
      }

      if (atualizacao.inbound?.texto) {
        const registrada = await registrarInbound({
          canal: canal.nome,
          convocacaoId: alvo.convocacaoId,
          remetente: atualizacao.inbound.remetente,
          texto: atualizacao.inbound.texto,
        });
        processadas.push(registrada.id);
      }
    }

    return { inbounds: processadas, recebidas: atualizacoes.length };
  },
  {
    params: z.object({ provedor: z.string() }),
    // Texto, não objeto: a assinatura é calculada sobre o corpo cru.
    parse: 'text',
    query: z.object({ token: z.string().optional() }),
  }
);

/** Acha a tentativa pelo id do provedor ou pela referência que mandamos junto. */
async function acharTentativa(atualizacao: {
  providerId?: string;
  referencia?: string;
}): Promise<typeof tentativa.$inferSelect | null> {
  if (atualizacao.providerId) {
    const porProvedor = await db.query.tentativa.findFirst({
      where: eq(tentativa.providerId, atualizacao.providerId),
    });
    if (porProvedor) {
      return porProvedor;
    }
  }
  if (atualizacao.referencia) {
    const porReferencia = await db.query.tentativa.findFirst({
      where: eq(tentativa.chaveIdempotencia, atualizacao.referencia),
    });
    return porReferencia ?? null;
  }
  return null;
}

/** Registra a resposta da família e guarda a leitura do Claude como sugestão. */
export async function registrarInbound(args: {
  convocacaoId: string;
  canal: 'whatsapp' | 'sms' | 'email';
  texto: string;
  remetente?: string;
}) {
  const leitura = await classificarResposta(args.texto);

  let rascunho: string | null = null;
  if (leitura.classificacao === 'duvida') {
    const contexto = await contextoDaConvocacao(args.convocacaoId);
    if (contexto) {
      const gerado = await rascunharResposta({
        endereco: contexto.endereco,
        nome: contexto.nome,
        pergunta: args.texto,
        prazoFim: contexto.prazoFim,
        unidade: contexto.unidade,
      });
      rascunho = gerado.texto;
    }
  }

  const [registro] = await db
    .insert(mensagemInbound)
    .values({
      acaoSugerida: leitura.acaoSugerida,
      canal: args.canal,
      classificacao: leitura.classificacao,
      confianca: leitura.confianca,
      convocacaoId: args.convocacaoId,
      id: id('inb'),
      origemIa: leitura.origem,
      rascunhoResposta: rascunho,
      remetente: args.remetente ?? null,
      texto: args.texto,
      trechoChave: leitura.trechoChave,
    })
    .returning();

  if (!registro) {
    throw new Error('não consegui gravar a mensagem recebida');
  }
  return registro;
}

async function contextoDaConvocacao(convocacaoId: string) {
  const [linha] = await db
    .select({
      bairro: unidade.bairro,
      nome: inscricao.nomeFicticio,
      prazoFim: convocacao.prazoFim,
      unidade: unidade.nome,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(eq(convocacao.id, convocacaoId));

  return linha
    ? {
        endereco: linha.bairro ?? 'endereço na secretaria da unidade',
        nome: linha.nome,
        prazoFim: linha.prazoFim,
        unidade: linha.unidade,
      }
    : null;
}
