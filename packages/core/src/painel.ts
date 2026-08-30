import { convocacao, type Database, inscricao, opcao, tentativa, unidade } from '@fila-viva/db';
import { and, avg, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { alunosInconsistentes } from './fila.ts';

export const DIAS_SEM_RESPOSTA_PADRAO = 2;

/** Vagas selecionadas há mais de N dias sem resposta — a primeira tela da CRE. */
export async function vagasParadas(db: Database, args: { creId?: number; dias?: number } = {}) {
  const limite = new Date(Date.now() - (args.dias ?? DIAS_SEM_RESPOSTA_PADRAO) * 86_400_000);
  const condicoes = [eq(convocacao.status, 'aberta'), lte(convocacao.iniciadaEm, limite)];
  if (args.creId) {
    condicoes.push(eq(unidade.creId, args.creId));
  }

  return await db
    .select({
      convocacaoId: convocacao.id,
      extensoes: convocacao.extensoes,
      grupamento: opcao.grupamento,
      iniciadaEm: convocacao.iniciadaEm,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
      opcaoId: opcao.id,
      prazoFim: convocacao.prazoFim,
      respostas: sql<number>`(
        select count(*) from ${tentativa}
        where ${tentativa.convocacaoId} = ${convocacao.id} and ${tentativa.status} = 'respondido'
      )`,
      tentativas: sql<number>`(
        select count(*) from ${tentativa} where ${tentativa.convocacaoId} = ${convocacao.id}
      )`,
      turno: opcao.turno,
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(and(...condicoes))
    .orderBy(convocacao.iniciadaEm);
}

/** Conversão e tempo de convocação por unidade. */
export async function desempenhoPorUnidade(db: Database, creId?: number) {
  const condicoes = creId ? [eq(unidade.creId, creId)] : [];

  const filas = await db
    .select({
      bairro: unidade.bairro,
      confirmadas: sql<number>`sum(case when ${opcao.situacao} = 'Confirmado' then 1 else 0 end)`,
      espera: sql<number>`sum(case when ${opcao.situacao} = 'Lista de espera' then 1 else 0 end)`,
      selecionadas: sql<number>`sum(case when ${opcao.situacao} = 'Selecionado' then 1 else 0 end)`,
      total: count(opcao.id),
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(unidade)
    .leftJoin(opcao, eq(opcao.unidadeId, unidade.escCodigo))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .groupBy(unidade.escCodigo, unidade.nome, unidade.bairro)
    .orderBy(desc(count(opcao.id)));

  const tempos = await db
    .select({
      convocacoes: count(convocacao.id),
      horasAteEncerrar: avg(
        sql<number>`extract(epoch from (${convocacao.encerradaEm} - ${convocacao.iniciadaEm})) / 3600`
      ),
      tentativasMedias: avg(
        sql<number>`(select count(*) from ${tentativa} where ${tentativa.convocacaoId} = ${convocacao.id})`
      ),
      unidadeId: opcao.unidadeId,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .where(inArray(convocacao.status, ['confirmada', 'expirada', 'cancelada']))
    .groupBy(opcao.unidadeId);

  const porUnidade = new Map(tempos.map((t) => [t.unidadeId, t]));

  return filas.map((f) => {
    const t = porUnidade.get(f.unidadeId);
    const confirmadas = Number(f.confirmadas ?? 0);
    return {
      ...f,
      confirmadas,
      convocacoesEncerradas: t?.convocacoes ?? 0,
      espera: Number(f.espera ?? 0),
      horasMediasAteEncerrar: t?.horasAteEncerrar ? Number(t.horasAteEncerrar) : null,
      selecionadas: Number(f.selecionadas ?? 0),
      taxaConfirmacao: f.total ? confirmadas / f.total : 0,
      tentativasMedias: t?.tentativasMedias ? Number(t.tentativasMedias) : null,
    };
  });
}

/** Fila e ocupação por bairro — o descompasso território × vaga do gap 5. */
export async function ocupacaoPorBairro(db: Database, creId?: number) {
  const condicoes = creId ? [eq(unidade.creId, creId)] : [];
  return await db
    .select({
      bairro: unidade.bairro,
      confirmadas: sql<number>`sum(case when ${opcao.situacao} = 'Confirmado' then 1 else 0 end)`,
      espera: sql<number>`sum(case when ${opcao.situacao} = 'Lista de espera' then 1 else 0 end)`,
      selecionadas: sql<number>`sum(case when ${opcao.situacao} = 'Selecionado' then 1 else 0 end)`,
      unidades: sql<number>`count(distinct ${unidade.escCodigo})`,
    })
    .from(unidade)
    .leftJoin(opcao, eq(opcao.unidadeId, unidade.escCodigo))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .groupBy(unidade.bairro)
    .orderBy(desc(sql`sum(case when ${opcao.situacao} = 'Lista de espera' then 1 else 0 end)`));
}

/** Cadastros com situações conflitantes, com o detalhe de onde cada uma está. */
export async function inconsistencias(db: Database) {
  const alunos = [...(await alunosInconsistentes(db))];
  if (alunos.length === 0) {
    return [];
  }

  return await db
    .select({
      alunoAnon: inscricao.alunoAnon,
      atualizadaEm: opcao.situacaoAtualizadaEm,
      grupamento: opcao.grupamento,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
      opcaoId: opcao.id,
      situacao: opcao.situacao,
      turno: opcao.turno,
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(opcao)
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(and(inArray(inscricao.alunoAnon, alunos), inArray(opcao.situacao, ['Selecionado'])))
    .orderBy(inscricao.alunoAnon, opcao.ordem);
}

/** Tentativas por canal e status no período — mostra o que o canal está entregando. */
export async function entregaPorCanal(
  db: Database,
  desde = new Date(Date.now() - 30 * 86_400_000)
) {
  return await db
    .select({ canal: tentativa.canal, status: tentativa.status, total: count() })
    .from(tentativa)
    .where(gte(tentativa.executadaEm, desde))
    .groupBy(tentativa.canal, tentativa.status);
}
