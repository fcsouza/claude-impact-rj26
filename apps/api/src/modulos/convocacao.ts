import { canal, textoSecretaria } from '@fila-viva/channels';
import {
  abrirVaga,
  atualizarStatusDaConvocacao,
  auditar,
  confirmar,
  estenderPrazo,
  proximoCandidato,
  SemCandidato,
  transicionar,
} from '@fila-viva/core';
import {
  contato,
  convocacao,
  db,
  id,
  inscricao,
  opcao,
  tentativa,
  unidade,
  user,
} from '@fila-viva/db';
import { and, desc, eq } from 'drizzle-orm';
import { Elysia, status } from 'elysia';
import { z } from 'zod';
import { exigirAcessoAConvocacao } from '../acesso.ts';
import { contexto, exigirAutor, exigirUnidade } from '../contexto.ts';
import { PROBLEMAS } from '../erros.ts';

export const convocacaoRotas = new Elysia({ prefix: '/api/convocacoes' })
  .use(contexto)
  /** Quem seria chamado se a vaga abrisse agora — a tela mostra antes de confirmar. */
  .get(
    '/proximo',
    async ({ query, autor }) => {
      const negado = exigirUnidade(exigirAutor(autor), query.unidadeId);
      if (negado) {
        return negado;
      }
      return await proximoCandidato(db, {
        grupamento: query.grupamento,
        turno: query.turno,
        unidadeId: query.unidadeId,
      });
    },
    {
      query: z.object({
        grupamento: z.string(),
        turno: z.enum(['Integral', 'Parcial']),
        unidadeId: z.string(),
      }),
      sessao: true,
    }
  )
  .post(
    '/abrir-vaga',
    async ({ body, autor }) => {
      const negado = exigirUnidade(exigirAutor(autor), body.unidadeId);
      if (negado) {
        return negado;
      }

      try {
        return await abrirVaga(db, {
          autorId: exigirAutor(autor).id,
          grupamento: body.grupamento,
          turno: body.turno,
          unidadeId: body.unidadeId,
        });
      } catch (erro) {
        if (erro instanceof SemCandidato) {
          return status(409, PROBLEMAS.conflito(erro.message));
        }
        throw erro;
      }
    },
    {
      body: z.object({
        grupamento: z.string(),
        turno: z.enum(['Integral', 'Parcial']),
        unidadeId: z.string(),
      }),
      sessao: true,
    }
  )
  .get(
    '/:convocacaoId',
    async ({ params, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), params.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }
      const conv = await db.query.convocacao.findFirst({
        where: eq(convocacao.id, params.convocacaoId),
      });
      if (!conv) {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }
      const tentativas = await db
        .select()
        .from(tentativa)
        .where(eq(tentativa.convocacaoId, conv.id))
        .orderBy(desc(tentativa.executadaEm));
      return { ...conv, tentativas };
    },
    { params: z.object({ convocacaoId: z.string() }), sessao: true }
  )
  .post(
    '/:convocacaoId/confirmar',
    async ({ params, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), params.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }
      if (acesso.erro === 'nao-encontrado') {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }

      return await confirmar(db, {
        autorId: exigirAutor(autor).id,
        convocacaoId: params.convocacaoId,
        motivo: 'manual',
      });
    },
    { params: z.object({ convocacaoId: z.string() }), sessao: true }
  )
  /** Desistência ou não localizado: exige justificativa escrita. */
  .post(
    '/:convocacaoId/cancelar',
    async ({ params, body, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), params.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }

      const conv = await db.query.convocacao.findFirst({
        where: eq(convocacao.id, params.convocacaoId),
      });
      if (!conv) {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }

      await transicionar(db, {
        autorId: exigirAutor(autor).id,
        justificativa: body.justificativa,
        motivo: body.motivo,
        opcaoId: conv.opcaoId,
        para: 'Cancelado',
      });

      await db
        .update(convocacao)
        .set({ encerradaEm: new Date(), status: 'cancelada' })
        .where(eq(convocacao.id, params.convocacaoId));

      return { ok: true };
    },
    {
      body: z.object({
        justificativa: z.string().min(3),
        motivo: z.enum(['desistiu', 'nao_localizado', 'manual']),
      }),
      params: z.object({ convocacaoId: z.string() }),
      sessao: true,
    }
  )
  /** Extensão de prazo: um dia útil, uma vez, só a CRE. */
  .post(
    '/:convocacaoId/estender',
    async ({ params, body, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), params.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }

      try {
        return await estenderPrazo(db, {
          autorId: exigirAutor(autor).id,
          convocacaoId: params.convocacaoId,
          justificativa: body.justificativa,
        });
      } catch (erro) {
        return status(409, PROBLEMAS.conflito((erro as Error).message));
      }
    },
    {
      body: z.object({ justificativa: z.string().min(3) }),
      params: z.object({ convocacaoId: z.string() }),
      sessao: 'cre',
    }
  )
  /** Tentativa manual: ligação ou atendimento presencial que o servidor registrou. */
  .post(
    '/:convocacaoId/tentativa-manual',
    async ({ params, body, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), params.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }
      if (acesso.erro === 'nao-encontrado') {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }

      const agora = new Date();
      const [criada] = await db
        .insert(tentativa)
        .values({
          autorId: exigirAutor(autor).id,
          canal: body.canal,
          chaveIdempotencia: `${params.convocacaoId}:${body.canal}:manual:${agora.getTime()}`,
          convocacaoId: params.convocacaoId,
          executadaEm: agora,
          id: id('tent'),
          origem: 'manual',
          resultado: body.resultado,
          status: body.status,
        })
        .returning();
      return criada;
    },
    {
      body: z.object({
        canal: z.enum(['telefone', 'presencial', 'whatsapp', 'sms', 'email']),
        resultado: z.string().min(1),
        status: z.enum(['enviado', 'entregue', 'falhou', 'respondido']),
      }),
      params: z.object({ convocacaoId: z.string() }),
      sessao: true,
    }
  )
  /** Aviso à secretaria: pede contato ativo por telefone antes de o prazo vencer. */
  .post(
    '/:convocacaoId/notificar-secretaria',
    async ({ params, autor }) => {
      const acesso = await exigirAcessoAConvocacao(exigirAutor(autor), params.convocacaoId);
      if (acesso.erro === 'negado') {
        return acesso.resposta;
      }
      if (acesso.erro === 'nao-encontrado') {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }

      const [alvo] = await db
        .select({
          crianca: inscricao.nomeFicticio,
          inscricaoId: inscricao.id,
          nomeUnidade: unidade.nome,
          prazoFim: convocacao.prazoFim,
          unidadeId: opcao.unidadeId,
        })
        .from(convocacao)
        .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
        .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
        .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
        .where(eq(convocacao.id, params.convocacaoId));

      if (!alvo) {
        return status(404, PROBLEMAS.naoEncontrado('convocação não encontrada'));
      }

      // A secretaria da unidade são os usuários de papel `unidade` cadastrados nela.
      const secretaria = await db
        .select({ email: user.email })
        .from(user)
        .where(and(eq(user.unidadeId, alvo.unidadeId), eq(user.papel, 'unidade')));

      if (secretaria.length === 0) {
        return status(
          409,
          PROBLEMAS.conflito('nenhum e-mail de secretaria cadastrado para esta unidade')
        );
      }

      const ultimoContato = await db.query.contato.findFirst({
        orderBy: desc(contato.versao),
        where: eq(contato.inscricaoId, alvo.inscricaoId),
      });

      const aviso = textoSecretaria({
        crianca: alvo.crianca,
        prazoFim: alvo.prazoFim,
        telefone: ultimoContato?.telefone ?? ultimoContato?.whatsapp ?? null,
        unidade: alvo.nomeUnidade,
      });
      const email = canal('email');
      const envios = await Promise.all(
        secretaria.map((destinatario) =>
          email.send({
            assunto: aviso.assunto,
            destino: destinatario.email,
            referencia: `secretaria:${params.convocacaoId}`,
            texto: aviso.corpo,
          })
        )
      );

      await auditar(db, {
        acao: 'notificar_secretaria',
        autorId: exigirAutor(autor).id,
        depois: { destinatarios: secretaria.map((d) => d.email) },
        entidade: 'convocacao',
        entidadeId: params.convocacaoId,
        motivo: 'prazo de confirmação perto de vencer',
      });

      return { destinatarios: secretaria.length, ok: envios.every((e) => e.ok) };
    },
    { params: z.object({ convocacaoId: z.string() }), sessao: true }
  )
  /** Atualiza o status da convocação a partir da ficha, com motivo obrigatório. */
  .post(
    '/opcoes/:opcaoId/situacao',
    async ({ params, body, autor }) => {
      const alvo = await db.query.opcao.findFirst({ where: eq(opcao.id, params.opcaoId) });
      if (!alvo) {
        return status(404, PROBLEMAS.naoEncontrado('opção não encontrada'));
      }
      const negado = exigirUnidade(exigirAutor(autor), alvo.unidadeId);
      if (negado) {
        return negado;
      }

      try {
        return await atualizarStatusDaConvocacao(db, {
          autorId: exigirAutor(autor).id,
          justificativa: body.justificativa,
          motivo: body.motivo ?? 'manual',
          opcaoId: params.opcaoId,
          para: body.para,
        });
      } catch (erro) {
        return status(409, PROBLEMAS.conflito((erro as Error).message));
      }
    },
    {
      body: z.object({
        justificativa: z.string().min(3),
        motivo: z.enum(['manual', 'desistiu', 'nao_localizado', 'prazo_vencido']).optional(),
        para: z.enum(['Ativo', 'Confirmado', 'Cancelado', 'Cancelado pelo sistema']),
      }),
      params: z.object({ opcaoId: z.string() }),
      sessao: true,
    }
  );
