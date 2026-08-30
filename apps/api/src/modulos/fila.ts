import { filaDaUnidade, GRUPAMENTOS, kpisDaUnidade, resolverPeriodo } from '@fila-viva/core';
import { criterio, db, unidade } from '@fila-viva/db';
import { asc, count, eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { z } from 'zod';
import { type Autor, contexto, exigirAutor, exigirUnidade } from '../contexto.ts';

const PAGINA_UNIDADES = 50;

/** Secretaria vê a rede; CRE, o próprio polo; unidade, só ela. Nunca em memória. */
function recorteDeUnidades(autor: Autor) {
  if (autor.papel === 'secretaria') {
    return;
  }
  if (autor.papel === 'cre') {
    return eq(unidade.creId, autor.creId ?? -1);
  }
  return eq(unidade.escCodigo, autor.unidadeId ?? '');
}

export const filaRotas = new Elysia({ prefix: '/api/fila' })
  .use(contexto)
  /**
   * Lista da barra lateral. O recorte é do banco, não da memória: a Secretaria enxerga
   * mais de duas mil unidades e a tela usa oito. Devolve o total à parte para o "e mais N".
   */
  .get(
    '/unidades',
    async ({ autor, query }) => {
      const a = exigirAutor(autor);
      const alcance = recorteDeUnidades(a);
      const limite = Math.min(Number(query.limite ?? PAGINA_UNIDADES) || PAGINA_UNIDADES, 500);

      const [unidades, [contagem]] = await Promise.all([
        db
          .select({
            bairro: unidade.bairro,
            creId: unidade.creId,
            escCodigo: unidade.escCodigo,
            nome: unidade.nome,
          })
          .from(unidade)
          .where(alcance)
          .orderBy(asc(unidade.nome))
          .limit(limite),
        db.select({ total: count() }).from(unidade).where(alcance),
      ]);

      return { total: Number(contagem?.total ?? 0), unidades };
    },
    { query: z.object({ limite: z.string().optional() }), sessao: true }
  )
  .get(
    '/:unidadeId',
    async ({ params, query, autor }) => {
      const negado = await exigirUnidade(exigirAutor(autor), params.unidadeId);
      if (negado) {
        return negado;
      }

      const periodo = resolverPeriodo(query);
      const [fila, kpis] = await Promise.all([
        filaDaUnidade(db, {
          busca: query.busca,
          grupamento: query.grupamento,
          pagina: query.pagina ? Number(query.pagina) : 1,
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
        linhas: fila.linhas,
        pagina: fila.pagina,
        periodo: { ate: periodo.ate, de: periodo.de, nome: periodo.nome },
        porPagina: fila.porPagina,
        total: fila.total,
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
        pagina: z.string().optional(),
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
