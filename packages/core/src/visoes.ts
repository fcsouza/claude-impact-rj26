import {
  capacidade,
  contato,
  convocacao,
  cre,
  type Database,
  inscricao,
  mensagemInbound,
  opcao,
  tentativa,
  unidade,
  vaga,
} from '@fila-viva/db';
import { and, asc, avg, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { diaISO, diasCorridosDesde, fimDoDiaNoRio } from './dias-uteis.ts';

export const DIAS_SEM_MOVIMENTO = 14;
const MESES_ATE_CONTATO_ENVELHECER = 12;

const ESPERA = sql<number>`sum(case when ${opcao.situacao} = 'Lista de espera' then 1 else 0 end)`;
const SELECIONADAS = sql<number>`sum(case when ${opcao.situacao} = 'Selecionado' then 1 else 0 end)`;
const CONFIRMADAS = sql<number>`sum(case when ${opcao.situacao} in ('Confirmado', 'Ativo') then 1 else 0 end)`;

/** Convocação encerrada sem que a família tenha respondido em canal nenhum. */
const SEM_RESPOSTA = sql`not exists (
  select 1 from ${tentativa}
  where ${tentativa.convocacaoId} = ${convocacao.id} and ${tentativa.status} = 'respondido'
)`;

/* ------------------------------------------------------------ nível 1: rede */

export interface LinhaCre {
  confirmadas: number;
  convocacoesConfirmadas: number;
  convocacoesEncerradas: number;
  creId: number;
  espera: number;
  expiradasSemResposta: number;
  horasMediasDaVaga: number | null;
  nome: string;
  paradas: number;
  selecionadas: number;
  taxaConfirmacao: number | null;
  unidades: number;
}

/**
 * As 12 CREs lado a lado. É a tela da Secretaria: uma linha por polo, ordenada
 * pela fila, com o que cobrar em cada uma.
 */
export async function redePorCre(db: Database, dias = 2): Promise<LinhaCre[]> {
  const janela = Number.isFinite(dias) ? dias : 2;
  const limite = new Date(Date.now() - janela * 86_400_000);

  const [filas, paradas, tempos, expiradas, encerradas] = await Promise.all([
    db
      .select({
        confirmadas: CONFIRMADAS,
        creId: unidade.creId,
        espera: ESPERA,
        nome: cre.nome,
        selecionadas: SELECIONADAS,
        unidades: sql<number>`count(distinct ${unidade.escCodigo})`,
      })
      .from(unidade)
      .innerJoin(cre, eq(unidade.creId, cre.id))
      .leftJoin(opcao, eq(opcao.unidadeId, unidade.escCodigo))
      .groupBy(unidade.creId, cre.nome),

    db
      .select({ creId: unidade.creId, total: count() })
      .from(convocacao)
      .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
      .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
      .where(and(eq(convocacao.status, 'aberta'), lte(convocacao.iniciadaEm, limite)))
      .groupBy(unidade.creId),

    db
      .select({
        creId: unidade.creId,
        horas: avg(
          sql<number>`extract(epoch from (${convocacao.encerradaEm} - ${vaga.abertaEm})) / 3600`
        ),
      })
      .from(vaga)
      .innerJoin(convocacao, eq(convocacao.vagaId, vaga.id))
      .innerJoin(unidade, eq(vaga.unidadeId, unidade.escCodigo))
      .where(eq(convocacao.status, 'confirmada'))
      .groupBy(unidade.creId),

    db
      .select({ creId: unidade.creId, total: count() })
      .from(convocacao)
      .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
      .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
      .where(and(eq(convocacao.status, 'expirada'), SEM_RESPOSTA))
      .groupBy(unidade.creId),

    db
      .select({
        confirmadas: sql<number>`sum(case when ${convocacao.status} = 'confirmada' then 1 else 0 end)`,
        creId: unidade.creId,
        encerradas: count(),
      })
      .from(convocacao)
      .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
      .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
      .where(inArray(convocacao.status, ['confirmada', 'expirada', 'cancelada']))
      .groupBy(unidade.creId),
  ]);

  const porCre = new Map(paradas.map((p) => [p.creId, p.total]));
  const porTempo = new Map(tempos.map((t) => [t.creId, t.horas]));
  const porExpirada = new Map(expiradas.map((e) => [e.creId, e.total]));
  const porEncerrada = new Map(encerradas.map((e) => [e.creId, e]));

  return filas
    .filter((f): f is typeof f & { creId: number } => f.creId !== null)
    .map((f) => {
      const horas = porTempo.get(f.creId);
      // Taxa sobre convocação encerrada, não sobre quem ainda está com prazo correndo.
      const decididas = porEncerrada.get(f.creId);
      const total = Number(decididas?.encerradas ?? 0);
      return {
        confirmadas: Number(f.confirmadas ?? 0),
        convocacoesConfirmadas: Number(decididas?.confirmadas ?? 0),
        convocacoesEncerradas: total,
        creId: f.creId,
        espera: Number(f.espera ?? 0),
        expiradasSemResposta: porExpirada.get(f.creId) ?? 0,
        horasMediasDaVaga: horas ? Number(horas) : null,
        nome: f.nome,
        paradas: porCre.get(f.creId) ?? 0,
        selecionadas: Number(f.selecionadas ?? 0),
        // Sem convocação encerrada não existe taxa. Zero por cento seria mentira.
        taxaConfirmacao: total ? Number(decididas?.confirmadas ?? 0) / total : null,
        unidades: Number(f.unidades ?? 0),
      };
    })
    .sort((a, b) => b.espera - a.espera);
}

/** Fila em espera por grupamento — a demanda que a rede precisa cobrir. */
export async function filaPorGrupamento(db: Database, creId?: number) {
  return await db
    .select({ grupamento: opcao.grupamento, total: count() })
    .from(opcao)
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(and(eq(opcao.situacao, 'Lista de espera'), ...(creId ? [eq(unidade.creId, creId)] : [])))
    .groupBy(opcao.grupamento)
    .orderBy(desc(count()));
}

/** Da abertura da vaga à confirmação, em horas. O SLA que a rede promete. */
export async function tempoMedioDaVaga(db: Database, creId?: number) {
  const [linha] = await db
    .select({
      horas: avg(
        sql<number>`extract(epoch from (${convocacao.encerradaEm} - ${vaga.abertaEm})) / 3600`
      ),
      vagas: count(),
    })
    .from(vaga)
    .innerJoin(convocacao, eq(convocacao.vagaId, vaga.id))
    .innerJoin(unidade, eq(vaga.unidadeId, unidade.escCodigo))
    .where(and(eq(convocacao.status, 'confirmada'), ...(creId ? [eq(unidade.creId, creId)] : [])));

  return { horas: linha?.horas ? Number(linha.horas) : null, vagas: Number(linha?.vagas ?? 0) };
}

/**
 * Fila contra capacidade instalada, por bairro. A capacidade vem do datalake
 * (`datario.educacao_basica.turma`); sem ela o bairro aparece com vagas nulas,
 * que a tela mostra como traço em vez de fingir zero.
 */
export async function deficitPorBairro(db: Database, creId?: number) {
  const condicao = creId ? [eq(unidade.creId, creId)] : [];

  const [filas, instalada] = await Promise.all([
    db
      .select({
        bairro: unidade.bairro,
        espera: ESPERA,
        unidades: sql<number>`count(distinct ${unidade.escCodigo})`,
      })
      .from(unidade)
      .leftJoin(opcao, eq(opcao.unidadeId, unidade.escCodigo))
      .where(condicao.length ? and(...condicao) : undefined)
      .groupBy(unidade.bairro),

    db
      .select({
        bairro: unidade.bairro,
        matriculados: sql<number>`sum(${capacidade.matriculados})`,
        vagas: sql<number>`sum(${capacidade.vagas})`,
      })
      .from(capacidade)
      .innerJoin(unidade, eq(capacidade.unidadeId, unidade.escCodigo))
      .where(condicao.length ? and(...condicao) : undefined)
      .groupBy(unidade.bairro),
  ]);

  const porBairro = new Map(instalada.map((i) => [i.bairro, i]));

  return filas
    .map((f) => {
      const cap = porBairro.get(f.bairro);
      const vagas = cap?.vagas === undefined || cap.vagas === null ? null : Number(cap.vagas);
      const matriculados = cap?.matriculados ? Number(cap.matriculados) : 0;
      return {
        bairro: f.bairro,
        deficit: vagas === null ? null : Number(f.espera ?? 0) - (vagas - matriculados),
        espera: Number(f.espera ?? 0),
        matriculados,
        unidades: Number(f.unidades ?? 0),
        vagas,
      };
    })
    .sort((a, b) => b.espera - a.espera);
}

/* -------------------------------------------------------------- nível 2: CRE */

/** Prazos vencidos e vencendo hoje — a lista de cobrança do dia. */
export async function prazosDoDia(db: Database, creId?: number) {
  const fimDeHoje = fimDoDiaNoRio();

  const linhas = await db
    .select({
      convocacaoId: convocacao.id,
      grupamento: opcao.grupamento,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
      prazoFim: convocacao.prazoFim,
      turno: opcao.turno,
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(
      and(
        eq(convocacao.status, 'aberta'),
        lte(convocacao.prazoFim, fimDeHoje),
        ...(creId ? [eq(unidade.creId, creId)] : [])
      )
    )
    .orderBy(asc(convocacao.prazoFim));

  const agora = Date.now();
  const hoje = diaISO(new Date());
  return linhas.map((l) => ({
    ...l,
    venceHoje: diaISO(l.prazoFim) === hoje,
    vencido: l.prazoFim.getTime() < agora,
  }));
}

/** Convocação que expirou sem uma resposta sequer, por unidade: contato morto. */
export async function expiradasSemResposta(db: Database, creId?: number) {
  return await db
    .select({
      total: count(),
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(
      and(
        eq(convocacao.status, 'expirada'),
        SEM_RESPOSTA,
        ...(creId ? [eq(unidade.creId, creId)] : [])
      )
    )
    .groupBy(unidade.escCodigo, unidade.nome)
    .orderBy(desc(count()));
}

/** Unidade que não abriu vaga nem convocou ninguém no período — a creche que sumiu. */
export async function unidadesSemMovimento(
  db: Database,
  args: { creId?: number; dias?: number } = {}
) {
  // Data crua dentro de `sql` vira parâmetro sem tipo e o driver não serializa; ISO com cast.
  const desde = new Date(Date.now() - (args.dias ?? DIAS_SEM_MOVIMENTO) * 86_400_000).toISOString();

  const linhas = await db
    .select({
      bairro: unidade.bairro,
      espera: ESPERA,
      ultimaVaga: sql<Date | null>`(
        select max(${vaga.abertaEm}) from ${vaga} where ${vaga.unidadeId} = ${unidade.escCodigo}
      )`,
      unidade: unidade.nome,
      unidadeId: unidade.escCodigo,
    })
    .from(unidade)
    .leftJoin(opcao, eq(opcao.unidadeId, unidade.escCodigo))
    .where(
      and(
        ...(args.creId ? [eq(unidade.creId, args.creId)] : []),
        sql`not exists (
          select 1 from ${vaga}
          where ${vaga.unidadeId} = ${unidade.escCodigo} and ${vaga.abertaEm} >= ${desde}::timestamptz
        )`,
        sql`not exists (
          select 1 from ${convocacao}
          join ${opcao} as o2 on o2.id = ${convocacao.opcaoId}
          where o2.unidade_id = ${unidade.escCodigo} and ${convocacao.iniciadaEm} >= ${desde}::timestamptz
        )`
      )
    )
    .groupBy(unidade.escCodigo, unidade.nome, unidade.bairro)
    .having(sql`${ESPERA} > 0`)
    .orderBy(desc(ESPERA));

  // `sum()` volta como texto no driver; a tela formata número.
  return linhas.map((l) => ({ ...l, espera: Number(l.espera) }));
}

/* ---------------------------------------------------------- nível 3: unidade */

/** Tudo que o diretor precisa decidir hoje, numa consulta só. */
export async function visaoDaUnidade(db: Database, unidadeId: string) {
  const agora = new Date();

  const [vagasAbertas, convocacoes, pendentes, capacidades, filaEspera] = await Promise.all([
    db
      .select()
      .from(vaga)
      .where(and(eq(vaga.unidadeId, unidadeId), eq(vaga.status, 'aberta')))
      .orderBy(asc(vaga.abertaEm)),

    db
      .select({
        convocacaoId: convocacao.id,
        extensoes: convocacao.extensoes,
        grupamento: opcao.grupamento,
        iniciadaEm: convocacao.iniciadaEm,
        inscricaoId: inscricao.id,
        nome: inscricao.nomeFicticio,
        prazoFim: convocacao.prazoFim,
        respostas: sql<number>`(
          select count(*) from ${tentativa}
          where ${tentativa.convocacaoId} = ${convocacao.id} and ${tentativa.status} = 'respondido'
        )`,
        tentativas: sql<number>`(
          select count(*) from ${tentativa} where ${tentativa.convocacaoId} = ${convocacao.id}
        )`,
        turno: opcao.turno,
      })
      .from(convocacao)
      .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
      .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
      .where(and(eq(opcao.unidadeId, unidadeId), eq(convocacao.status, 'aberta')))
      .orderBy(asc(convocacao.prazoFim)),

    db
      .select({
        classificacao: mensagemInbound.classificacao,
        convocacaoId: mensagemInbound.convocacaoId,
        id: mensagemInbound.id,
        inscricaoId: inscricao.id,
        nome: inscricao.nomeFicticio,
        recebidaEm: mensagemInbound.recebidaEm,
        texto: mensagemInbound.texto,
        trechoChave: mensagemInbound.trechoChave,
      })
      .from(mensagemInbound)
      .innerJoin(convocacao, eq(mensagemInbound.convocacaoId, convocacao.id))
      .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
      .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
      .where(and(eq(opcao.unidadeId, unidadeId), eq(mensagemInbound.acaoAplicada, false)))
      .orderBy(desc(mensagemInbound.recebidaEm)),

    db
      .select()
      .from(capacidade)
      .where(eq(capacidade.unidadeId, unidadeId))
      .orderBy(asc(capacidade.grupamento), asc(capacidade.turno)),

    db
      .select({
        contatoEm: sql<Date | null>`(
          select max(${contato.criadoEm}) from ${contato}
          where ${contato.inscricaoId} = ${inscricao.id}
        )`,
        grupamento: opcao.grupamento,
        inscricaoId: inscricao.id,
        nome: inscricao.nomeFicticio,
        pontuacao: inscricao.pontuacaoTotal,
        turno: opcao.turno,
      })
      .from(opcao)
      .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
      .where(and(eq(opcao.unidadeId, unidadeId), eq(opcao.situacao, 'Lista de espera')))
      .orderBy(desc(inscricao.pontuacaoTotal), asc(inscricao.dataCriacao))
      .limit(30),
  ]);

  const contatosVelhos = filaEspera
    .map((l) => ({
      ...l,
      meses: l.contatoEm ? Math.floor(diasCorridosDesde(new Date(l.contatoEm), agora) / 30) : null,
    }))
    .filter((l) => l.meses === null || l.meses >= MESES_ATE_CONTATO_ENVELHECER);

  return {
    capacidades: capacidades.map((c) => ({
      ...c,
      ocupacao: c.vagas ? c.matriculados / c.vagas : null,
    })),
    contatosVelhos,
    convocacoes: convocacoes.map((c) => ({
      ...c,
      diaDaRegua: diasCorridosDesde(c.iniciadaEm, agora),
      respostas: Number(c.respostas),
      tentativas: Number(c.tentativas),
      vencido: c.prazoFim.getTime() < agora.getTime(),
    })),
    pendentes,
    vagasAbertas,
  };
}
