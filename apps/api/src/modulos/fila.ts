import { filaDaUnidade, GRUPAMENTOS, kpisDaUnidade, resolverPeriodo } from '@fila-viva/core';
import { criterio, db, unidade } from '@fila-viva/db';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { contexto, exigirAutor, exigirUnidade } from '../contexto.ts';

export const filaRotas = new Elysia({ prefix: '/api/fila' })
  .use(contexto)
  .get(
    '/unidades',
    async ({ autor }) => {
      const todas = await db.select().from(unidade);
      return autor?.papel === 'cre'
        ? todas.filter((u) => !autor.creId || u.creId === autor.creId)
        : todas.filter((u) => u.escCodigo === autor?.unidadeId);
    },
    { sessao: true }
  )
  .get(
    '/:unidadeId',
    async ({ params, query, autor }) => {
      const negado = exigirUnidade(exigirAutor(autor), params.unidadeId);
      if (negado) {
        return negado;
      }

      const periodo = resolverPeriodo(query);
      const [linhas, kpis] = await Promise.all([
        filaDaUnidade(db, {
          busca: query.busca,
          grupamento: query.grupamento,
          situacoes: query.situacao ? [query.situacao] : undefined,
          turno: query.turno,
          unidadeId: params.unidadeId,
        }),
        kpisDaUnidade(db, params.unidadeId, periodo),
      ]);

      const [dadosUnidade] = await db
        .select()
        .from(unidade)
        .where(eq(unidade.escCodigo, params.unidadeId));

      return {
        grupamentos: GRUPAMENTOS,
        kpis,
        linhas,
        periodo: { ate: periodo.ate, de: periodo.de, nome: periodo.nome },
        unidade: dadosUnidade ?? null,
      };
    },
    {
      params: z.object({ unidadeId: z.string() }),
      query: z.object({
        ate: z.string().optional(),
        busca: z.string().optional(),
        de: z.string().optional(),
        grupamento: z.string().optional(),
        periodo: z.enum(['semana', 'mes', 'processo', 'custom']).optional(),
        situacao: z.enum(['Lista de espera', 'Selecionado', 'Ativo', 'Confirmado']).optional(),
        turno: z.enum(['Integral', 'Parcial']).optional(),
      }),
      sessao: true,
    }
  )
  /** Régua vigente: só leitura, é o que a tela usa para explicar a posição. */
  .get(
    '/regua/:ano',
    async ({ params }) =>
      await db
        .select()
        .from(criterio)
        .where(eq(criterio.ano, Number(params.ano)))
        .orderBy(criterio.ordem),
    { params: z.object({ ano: z.string() }), sessao: true }
  );
