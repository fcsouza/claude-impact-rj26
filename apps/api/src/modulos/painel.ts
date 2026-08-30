import {
  deficitPorBairro,
  desempenhoPorUnidade,
  entregaPorCanal,
  expiradasSemResposta,
  filaPorGrupamento,
  inconsistencias,
  ocupacaoPorBairro,
  prazosDoDia,
  redePorCre,
  tempoMedioDaVaga,
  unidadesSemMovimento,
  vagasParadas,
  visaoDaUnidade,
} from '@fila-viva/core';
import { db, eventoAuditoria, unidade } from '@fila-viva/db';
import { desc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { contexto, exigirAutor, exigirUnidade } from '../contexto.ts';

/** `?dias=abc` não pode virar Invalid Date lá no fundo da consulta. */
function janelaEmDias(bruto: string | undefined): number | undefined {
  const n = bruto ? Number(bruto) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const painelRotas = new Elysia({ prefix: '/api/painel' })
  .use(contexto)
  .get(
    '/',
    async ({ query, autor }) => {
      const creId = exigirAutor(autor).creId ?? undefined;
      const dias = janelaEmDias(query.dias);

      const [
        paradas,
        unidades,
        bairros,
        conflitos,
        canais,
        prazos,
        expiradas,
        paradasSemMovimento,
      ] = await Promise.all([
        vagasParadas(db, { creId, dias }),
        desempenhoPorUnidade(db, creId),
        ocupacaoPorBairro(db, creId),
        inconsistencias(db),
        entregaPorCanal(db),
        prazosDoDia(db, creId),
        expiradasSemResposta(db, creId),
        unidadesSemMovimento(db, { creId }),
      ]);

      return {
        bairros,
        canais,
        expiradas,
        inconsistencias: conflitos,
        paradas,
        prazos,
        semMovimento: paradasSemMovimento,
        unidades,
      };
    },
    { query: z.object({ dias: z.string().optional() }), sessao: 'cre' }
  )
  /** Nível 1: a rede inteira, uma linha por CRE. */
  .get(
    '/secretaria',
    async ({ query }) => {
      const dias = janelaEmDias(query.dias);
      const [cres, grupamentos, tempo, bairros, conflitos, canais] = await Promise.all([
        redePorCre(db, dias),
        filaPorGrupamento(db),
        tempoMedioDaVaga(db),
        deficitPorBairro(db),
        inconsistencias(db),
        entregaPorCanal(db),
      ]);

      return { bairros, canais, cres, grupamentos, inconsistencias: conflitos, tempo };
    },
    { query: z.object({ dias: z.string().optional() }), sessao: 'secretaria' }
  )
  /** Nível 3: o dia do diretor numa unidade. */
  .get(
    '/unidade/:unidadeId',
    async ({ params, autor }) => {
      const negado = await exigirUnidade(exigirAutor(autor), params.unidadeId);
      if (negado) {
        return negado;
      }

      const [visao, dadosUnidade] = await Promise.all([
        visaoDaUnidade(db, params.unidadeId),
        db.select().from(unidade).where(eq(unidade.escCodigo, params.unidadeId)),
      ]);

      return { ...visao, unidade: dadosUnidade[0] ?? null };
    },
    { params: z.object({ unidadeId: z.string() }), sessao: true }
  )
  /** Auditoria bruta: quem mexeu no quê, em ordem. */
  .get(
    '/auditoria',
    async ({ query }) => {
      const limite = query.limite ? Number(query.limite) : 100;
      const base = db
        .select()
        .from(eventoAuditoria)
        .orderBy(desc(eventoAuditoria.criadoEm))
        .limit(limite);
      return query.entidadeId
        ? await db
            .select()
            .from(eventoAuditoria)
            .where(eq(eventoAuditoria.entidadeId, query.entidadeId))
            .orderBy(desc(eventoAuditoria.criadoEm))
            .limit(limite)
        : await base;
    },
    {
      query: z.object({ entidadeId: z.string().optional(), limite: z.string().optional() }),
      sessao: 'cre',
    }
  );
