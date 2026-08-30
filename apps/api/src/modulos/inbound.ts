import { confirmar, estenderPrazo, transicionar } from '@fila-viva/core';
import { convocacao, db, inscricao, mensagemInbound, opcao } from '@fila-viva/db';
import { and, desc, eq } from 'drizzle-orm';
import { Elysia, status } from 'elysia';
import { z } from 'zod';
import { exigirAcessoAConvocacao, exigirAcessoAoInbound } from '../acesso.ts';
import { contexto, exigirAutor } from '../contexto.ts';
import { PROBLEMAS } from '../erros.ts';
import { registrarInbound } from './webhooks.ts';

/**
 * A leitura do Claude vira sugestão pendente. Aplicar é ato do servidor —
 * é aqui que o humano fica no meio do laço (RF5.2).
 */
export const inboundRotas = new Elysia({ prefix: '/api/inbound' })
  .use(contexto)
  .get(
    '/pendentes',
    async ({ autor }) => {
      const quem = exigirAutor(autor);
      const condicoes = [eq(mensagemInbound.acaoAplicada, false)];
      // Servidor de unidade só vê a própria fila; a CRE vê o polo inteiro.
      if (quem.papel === 'unidade' && quem.unidadeId) {
        condicoes.push(eq(opcao.unidadeId, quem.unidadeId));
      }

      return await db
        .select({
          inbound: mensagemInbound,
          inscricaoId: inscricao.id,
          nome: inscricao.nomeFicticio,
          opcaoId: opcao.id,
          unidadeId: opcao.unidadeId,
        })
        .from(mensagemInbound)
        .innerJoin(convocacao, eq(mensagemInbound.convocacaoId, convocacao.id))
        .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
        .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
        .where(and(...condicoes))
        .orderBy(desc(mensagemInbound.recebidaEm));
    },
    { sessao: true }
  )
  /** Entrada manual de resposta — é o que a demo usa quando o canal está em mock. */
  .post(
    '/simular',
    async ({ body, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), body.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }
      if (acesso.erro === 'nao-encontrado') {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }

      return await registrarInbound({
        canal: body.canal ?? 'whatsapp',
        convocacaoId: body.convocacaoId,
        remetente: body.remetente,
        texto: body.texto,
      });
    },
    {
      body: z.object({
        canal: z.enum(['whatsapp', 'sms', 'email']).optional(),
        convocacaoId: z.string(),
        remetente: z.string().optional(),
        texto: z.string().min(1),
      }),
      sessao: true,
    }
  )
  .post(
    '/:inboundId/aplicar',
    async ({ params, body, autor }) => {
      const acesso = await exigirAcessoAoInbound(exigirAutor(autor), params.inboundId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }

      const registro = await db.query.mensagemInbound.findFirst({
        where: eq(mensagemInbound.id, params.inboundId),
      });
      if (!registro) {
        return status(404, PROBLEMAS.naoEncontrado('mensagem não encontrada'));
      }
      if (registro.acaoAplicada) {
        return status(409, PROBLEMAS.conflito('esta sugestão já foi aplicada'));
      }
      if (!registro.convocacaoId) {
        return status(409, PROBLEMAS.conflito('mensagem sem convocação vinculada'));
      }

      let resultado: unknown = { ok: true };

      switch (body.acao) {
        case 'confirmar':
          resultado = await confirmar(db, {
            autorId: exigirAutor(autor).id,
            convocacaoId: registro.convocacaoId,
            motivo: 'resposta_sim',
          });
          break;

        case 'estender': {
          if (exigirAutor(autor).papel !== 'cre') {
            return status(403, PROBLEMAS.semPermissao('só a CRE concede extensão de prazo'));
          }
          if (!body.justificativa?.trim()) {
            return status(400, PROBLEMAS.invalido('extensão exige justificativa'));
          }
          resultado = await estenderPrazo(db, {
            autorId: exigirAutor(autor).id,
            convocacaoId: registro.convocacaoId,
            justificativa: body.justificativa,
          });
          break;
        }

        case 'cancelar': {
          const conv = await db.query.convocacao.findFirst({
            where: eq(convocacao.id, registro.convocacaoId),
          });
          if (!conv) {
            return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
          }
          await transicionar(db, {
            autorId: exigirAutor(autor).id,
            justificativa: body.justificativa ?? registro.texto.slice(0, 200),
            motivo: 'desistiu',
            opcaoId: conv.opcaoId,
            para: 'Cancelado',
          });
          await db
            .update(convocacao)
            .set({ encerradaEm: new Date(), status: 'cancelada' })
            .where(eq(convocacao.id, registro.convocacaoId));
          break;
        }

        case 'nenhuma':
          break;

        default:
          return status(400, PROBLEMAS.invalido('ação desconhecida'));
      }

      await db
        .update(mensagemInbound)
        .set({ acaoAplicada: true, aplicadaEm: new Date(), aplicadaPor: exigirAutor(autor).id })
        .where(eq(mensagemInbound.id, params.inboundId));

      return { acao: body.acao, resultado };
    },
    {
      body: z.object({
        acao: z.enum(['confirmar', 'estender', 'cancelar', 'nenhuma']),
        justificativa: z.string().optional(),
      }),
      params: z.object({ inboundId: z.string() }),
      sessao: true,
    }
  );
