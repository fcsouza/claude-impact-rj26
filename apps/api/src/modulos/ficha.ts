import { resumirFicha } from '@fila-viva/ai';
import { auditar, contatoVigente } from '@fila-viva/core';
import { contato, convocacao, db, id, inscricao, nota, opcao, unidade } from '@fila-viva/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Elysia, status } from 'elysia';
import { z } from 'zod';
import { carregarPolos, contexto, exigirAutor, podeVerUnidade } from '../contexto.ts';
import { PROBLEMAS } from '../erros.ts';
import { timelineDaInscricao } from '../timeline.ts';

async function carregarFicha(inscricaoId: string) {
  const cadastro = await db.query.inscricao.findFirst({ where: eq(inscricao.id, inscricaoId) });
  if (!cadastro) {
    return null;
  }

  const opcoes = await db
    .select({
      bairroUnidade: unidade.bairro,
      endereco: unidade.bairro,
      grupamento: opcao.grupamento,
      id: opcao.id,
      ordem: opcao.ordem,
      situacao: opcao.situacao,
      situacaoAtualizadaEm: opcao.situacaoAtualizadaEm,
      turno: opcao.turno,
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(opcao)
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(eq(opcao.inscricaoId, inscricaoId))
    .orderBy(opcao.ordem);

  const aberta = opcoes.length
    ? await db.query.convocacao.findFirst({
        orderBy: desc(convocacao.iniciadaEm),
        where: and(
          eq(convocacao.status, 'aberta'),
          inArray(
            convocacao.opcaoId,
            opcoes.map((o) => o.id)
          )
        ),
      })
    : null;

  return { cadastro, convocacaoAberta: aberta ?? null, opcoes };
}

export const fichaRotas = new Elysia({ prefix: '/api/ficha' })
  .use(contexto)
  .get(
    '/:inscricaoId',
    async ({ params, autor }) => {
      const ficha = await carregarFicha(params.inscricaoId);
      if (!ficha) {
        return status(404, PROBLEMAS.naoEncontrado('inscrição não encontrada'));
      }

      const polos = await carregarPolos();
      const alcance = ficha.opcoes.some((o) =>
        podeVerUnidade(exigirAutor(autor), o.unidadeId, polos)
      );
      if (!alcance) {
        return status(403, PROBLEMAS.semPermissao('esta inscrição está fora do seu acesso'));
      }

      const [contatoAtual, timeline, notas] = await Promise.all([
        contatoVigente(db, params.inscricaoId),
        timelineDaInscricao(params.inscricaoId),
        db
          .select()
          .from(nota)
          .where(eq(nota.inscricaoId, params.inscricaoId))
          .orderBy(desc(nota.criadoEm)),
      ]);

      return { ...ficha, contato: contatoAtual, notas, timeline };
    },
    { params: z.object({ inscricaoId: z.string() }), sessao: true }
  )
  /** Contato é versionado: a edição insere versão nova e guarda a anterior. */
  .put(
    '/:inscricaoId/contato',
    async ({ params, body, autor }) => {
      const anterior = await contatoVigente(db, params.inscricaoId);
      const versao = (anterior?.versao ?? 0) + 1;

      const [novo] = await db
        .insert(contato)
        .values({
          autorId: exigirAutor(autor).id,
          email: body.email ?? anterior?.email ?? null,
          id: id('cont'),
          inscricaoId: params.inscricaoId,
          melhorHorario: body.melhorHorario ?? anterior?.melhorHorario ?? null,
          obs: body.obs ?? anterior?.obs ?? null,
          telefone: body.telefone ?? anterior?.telefone ?? null,
          versao,
          whatsapp: body.whatsapp ?? anterior?.whatsapp ?? null,
        })
        .returning();

      if (!novo) {
        return status(500, PROBLEMAS.interno('não consegui gravar a versão do contato'));
      }

      await auditar(db, {
        acao: 'atualizar_contato',
        antes: anterior ? { ...anterior } : null,
        autorId: exigirAutor(autor).id,
        depois: { ...novo },
        entidade: 'contato',
        entidadeId: novo.id,
      });

      return novo;
    },
    {
      body: z.object({
        email: z.string().optional(),
        melhorHorario: z.string().optional(),
        obs: z.string().optional(),
        telefone: z.string().optional(),
        whatsapp: z.string().optional(),
      }),
      params: z.object({ inscricaoId: z.string() }),
      sessao: true,
    }
  )
  .post(
    '/:inscricaoId/notas',
    async ({ params, body, autor }) => {
      const [criada] = await db
        .insert(nota)
        .values({
          autorId: exigirAutor(autor).id,
          id: id('nota'),
          inscricaoId: params.inscricaoId,
          texto: body.texto,
        })
        .returning();
      return criada;
    },
    {
      body: z.object({ texto: z.string().min(1) }),
      params: z.object({ inscricaoId: z.string() }),
      sessao: true,
    }
  )
  /** Correção de endereço: grava campo novo, o original continua no lugar. */
  .put(
    '/:inscricaoId/endereco',
    async ({ params, body, autor }) => {
      const antes = await db.query.inscricao.findFirst({
        where: eq(inscricao.id, params.inscricaoId),
      });
      if (!antes) {
        return status(404, PROBLEMAS.naoEncontrado('inscrição não encontrada'));
      }

      const [depois] = await db
        .update(inscricao)
        .set({
          bairroCorrigido: body.bairro ?? antes.bairroCorrigido,
          cepCorrigido: body.cep ?? antes.cepCorrigido,
          corrigidoPorCre: true,
        })
        .where(eq(inscricao.id, params.inscricaoId))
        .returning();

      await auditar(db, {
        acao: 'corrigir_endereco',
        antes: {
          bairro: antes.bairro,
          bairroCorrigido: antes.bairroCorrigido,
          cepCorrigido: antes.cepCorrigido,
        },
        autorId: exigirAutor(autor).id,
        depois: { bairroCorrigido: depois?.bairroCorrigido, cepCorrigido: depois?.cepCorrigido },
        entidade: 'inscricao',
        entidadeId: params.inscricaoId,
        motivo: body.motivo,
      });

      return depois;
    },
    {
      body: z.object({
        bairro: z.string().optional(),
        cep: z.string().optional(),
        motivo: z.string().min(3),
      }),
      params: z.object({ inscricaoId: z.string() }),
      sessao: 'cre',
    }
  )
  /** Resumo em linguagem simples — Claude quando há credencial, regra quando não há. */
  .get(
    '/:inscricaoId/resumo',
    async ({ params }) => {
      const ficha = await carregarFicha(params.inscricaoId);
      if (!ficha) {
        return status(404, PROBLEMAS.naoEncontrado('inscrição não encontrada'));
      }

      const principal =
        ficha.opcoes.find((o) => o.situacao === 'Selecionado') ??
        ficha.opcoes.find((o) => o.situacao === 'Confirmado') ??
        ficha.opcoes[0];

      const timeline = await timelineDaInscricao(params.inscricaoId);

      return await resumirFicha({
        grupamento: principal?.grupamento ?? '',
        nome: ficha.cadastro.nomeFicticio,
        pontuacao: ficha.cadastro.pontuacaoTotal,
        prazoFim: ficha.convocacaoAberta?.prazoFim ?? null,
        situacao: principal?.situacao ?? 'Lista de espera',
        tentativas: timeline
          .filter((i) => i.tipo === 'tentativa')
          .map((i) => ({
            canal: i.canal ?? '',
            quando: i.quando.toISOString(),
            status: i.status ?? '',
          })),
        turno: principal?.turno ?? 'Integral',
        ultimaResposta: timeline.find((i) => i.tipo === 'inbound')?.detalhe ?? null,
        unidade: principal?.unidade ?? '',
      });
    },
    { params: z.object({ inscricaoId: z.string() }), sessao: true }
  );
