import {
  desempenhoPorUnidade,
  entregaPorCanal,
  inconsistencias,
  ocupacaoPorBairro,
  vagasParadas,
} from '@fila-viva/core';
import { db, eventoAuditoria } from '@fila-viva/db';
import { desc, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { contexto, exigirAutor } from '../contexto.ts';

export const painelRotas = new Elysia({ prefix: '/api/painel' })
  .use(contexto)
  .get(
    '/',
    async ({ query, autor }) => {
      const creId = exigirAutor(autor).creId ?? undefined;
      const dias = query.dias ? Number(query.dias) : undefined;

      const [paradas, unidades, bairros, conflitos, canais] = await Promise.all([
        vagasParadas(db, { creId, dias }),
        desempenhoPorUnidade(db, creId),
        ocupacaoPorBairro(db, creId),
        inconsistencias(db),
        entregaPorCanal(db),
      ]);

      return { bairros, canais, inconsistencias: conflitos, paradas, unidades };
    },
    { query: z.object({ dias: z.string().optional() }), sessao: 'cre' }
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
