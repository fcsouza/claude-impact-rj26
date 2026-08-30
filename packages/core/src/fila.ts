import {
  convocacao,
  type Database,
  inscricao,
  opcao,
  type Situacao,
  type Turno,
  tentativa,
  unidade,
} from '@fila-viva/db';
import { and, asc, between, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { diaISO, diasCorridosDesde } from './dias-uteis.ts';

export const GRUPAMENTOS = ['Berçário', 'Maternal I', 'Maternal II'] as const;

export type Badge =
  | { tipo: 'selecionado_ha'; dias: number }
  | { tipo: 'prazo_vencido'; dias: number }
  | { tipo: 'inconsistencia'; detalhe: string }
  | { tipo: 'contato_desatualizado'; canais: string[] }
  | { tipo: 'bairro_diferente'; bairroFamilia: string; bairroUnidade: string };

export interface LinhaFila {
  alunoAnon: string;
  badges: Badge[];
  bairroFamilia: string | null;
  convocacaoId: string | null;
  dataCriacao: Date;
  grupamento: string;
  inscricaoId: string;
  nome: string;
  opcaoId: string;
  ordem: number;
  pontuacao: number;
  prazoFim: Date | null;
  situacao: Situacao;
  situacaoAtualizadaEm: Date;
  turno: Turno;
}

export interface FiltroFila {
  busca?: string;
  grupamento?: string;
  limite?: number;
  situacoes?: Situacao[];
  turno?: Turno;
  unidadeId: string;
}

/**
 * Fila viva de uma unidade: pontuação desc, empate pela inscrição mais antiga.
 * Cada linha já vem com os sinais que a tela precisa mostrar (RF1.4).
 */
export async function filaDaUnidade(db: Database, filtro: FiltroFila): Promise<LinhaFila[]> {
  const situacoes = filtro.situacoes?.length
    ? filtro.situacoes
    : (['Lista de espera', 'Selecionado', 'Ativo', 'Confirmado'] as Situacao[]);

  const condicoes = [eq(opcao.unidadeId, filtro.unidadeId), inArray(opcao.situacao, situacoes)];
  if (filtro.turno) {
    condicoes.push(eq(opcao.turno, filtro.turno));
  }
  if (filtro.grupamento) {
    condicoes.push(eq(opcao.grupamento, filtro.grupamento));
  }
  if (filtro.busca?.trim()) {
    const termo = `%${filtro.busca.trim().toLowerCase()}%`;
    condicoes.push(
      sql`(lower(${inscricao.nomeFicticio}) like ${termo} or lower(${inscricao.alunoAnon}) like ${termo})`
    );
  }

  const linhas = await db
    .select({
      alunoAnon: inscricao.alunoAnon,
      bairroFamilia: sql<
        string | null
      >`coalesce(${inscricao.bairroCorrigido}, ${inscricao.bairro})`,
      bairroUnidade: unidade.bairro,
      canaisSemEntrega: sql<string[] | null>`(
        select array_agg(distinct ${tentativa.canal}) from ${tentativa}
        where ${tentativa.convocacaoId} = ${convocacao.id} and ${tentativa.status} = 'falhou'
      )`,
      convocacaoId: convocacao.id,
      dataCriacao: inscricao.dataCriacao,
      grupamento: opcao.grupamento,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
      opcaoId: opcao.id,
      ordem: opcao.ordem,
      pontuacao: inscricao.pontuacaoTotal,
      prazoFim: convocacao.prazoFim,
      situacao: opcao.situacao,
      situacaoAtualizadaEm: opcao.situacaoAtualizadaEm,
      turno: opcao.turno,
    })
    .from(opcao)
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .leftJoin(convocacao, and(eq(convocacao.opcaoId, opcao.id), eq(convocacao.status, 'aberta')))
    .where(and(...condicoes))
    .orderBy(desc(inscricao.pontuacaoTotal), asc(inscricao.dataCriacao))
    .limit(filtro.limite ?? 200);

  const inconsistentes = await alunosInconsistentes(db);
  const agora = new Date();

  return linhas.map((l) => {
    const badges: Badge[] = [];

    if (l.situacao === 'Selecionado') {
      const dias = diasCorridosDesde(l.situacaoAtualizadaEm, agora);
      badges.push({ dias, tipo: 'selecionado_ha' });
      if (l.prazoFim && l.prazoFim.getTime() < agora.getTime()) {
        badges.push({ dias: diasCorridosDesde(l.prazoFim, agora), tipo: 'prazo_vencido' });
      }
    }

    if (inconsistentes.has(l.alunoAnon)) {
      badges.push({
        detalhe: 'convocada sem prazo aberto ou em mais de uma unidade',
        tipo: 'inconsistencia',
      });
    }

    // Contato desatualizado é falha de entrega, não idade do cadastro: o badge
    // aponta o canal por onde a mensagem não chegou.
    if (l.canaisSemEntrega?.length) {
      badges.push({ canais: [...l.canaisSemEntrega].sort(), tipo: 'contato_desatualizado' });
    }

    if (
      l.bairroFamilia &&
      l.bairroUnidade &&
      normalizar(l.bairroFamilia) !== normalizar(l.bairroUnidade)
    ) {
      badges.push({
        bairroFamilia: l.bairroFamilia,
        bairroUnidade: l.bairroUnidade,
        tipo: 'bairro_diferente',
      });
    }

    return {
      alunoAnon: l.alunoAnon,
      badges,
      bairroFamilia: l.bairroFamilia,
      convocacaoId: l.convocacaoId,
      dataCriacao: l.dataCriacao,
      grupamento: l.grupamento,
      inscricaoId: l.inscricaoId,
      nome: l.nome,
      opcaoId: l.opcaoId,
      ordem: l.ordem,
      pontuacao: l.pontuacao,
      prazoFim: l.prazoFim,
      situacao: l.situacao,
      situacaoAtualizadaEm: l.situacaoAtualizadaEm,
      turno: l.turno,
    };
  });
}

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Estado transitório não sinalizado — o gap 2 do briefing.
 *
 * Ter uma opção Selecionada e as outras na espera é o estado normal de quem acabou de
 * ser convocado, então isso não conta. Conta o que não fecha: a mesma criança Selecionada
 * em duas unidades, ou Selecionada sem convocação aberta para sustentar o prazo.
 */
export async function alunosInconsistentes(db: Database): Promise<Set<string>> {
  const selecionadas = await db
    .select({
      alunoAnon: inscricao.alunoAnon,
      convocacaoId: convocacao.id,
      opcaoId: opcao.id,
    })
    .from(opcao)
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .leftJoin(convocacao, and(eq(convocacao.opcaoId, opcao.id), eq(convocacao.status, 'aberta')))
    .where(eq(opcao.situacao, 'Selecionado'));

  const porAluno = new Map<string, { total: number; semConvocacao: number }>();
  for (const linha of selecionadas) {
    const atual = porAluno.get(linha.alunoAnon) ?? { semConvocacao: 0, total: 0 };
    atual.total += 1;
    if (!linha.convocacaoId) {
      atual.semConvocacao += 1;
    }
    porAluno.set(linha.alunoAnon, atual);
  }

  return new Set(
    [...porAluno.entries()]
      .filter(([, contagem]) => contagem.total > 1 || contagem.semConvocacao > 0)
      .map(([aluno]) => aluno)
  );
}

export type NomePeriodo = 'semana' | 'mes' | 'processo' | 'custom';

export interface Periodo {
  ate: Date;
  de: Date;
  nome: NomePeriodo;
}

const DIAS_POR_PERIODO: Record<'semana' | 'mes', number> = { mes: 30, semana: 7 };

/** Início do processo em curso; a régua vigente é a de 2025. */
const INICIO_DO_PROCESSO = new Date('2025-01-01T00:00:00-03:00');

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve o filtro da tela num intervalo fechado, sempre no fuso do Rio. */
export function resolverPeriodo(
  entrada: { periodo?: string; de?: string; ate?: string },
  agora = new Date()
): Periodo {
  const fim = fimDoDia(agora);

  if (entrada.periodo === 'processo') {
    return { ate: fim, de: INICIO_DO_PROCESSO, nome: 'processo' };
  }
  if (
    entrada.periodo === 'custom' &&
    DATA_ISO.test(entrada.de ?? '') &&
    DATA_ISO.test(entrada.ate ?? '')
  ) {
    return {
      ate: new Date(`${entrada.ate}T23:59:59-03:00`),
      de: new Date(`${entrada.de}T00:00:00-03:00`),
      nome: 'custom',
    };
  }

  const nome = entrada.periodo === 'semana' ? 'semana' : 'mes';
  return { ate: fim, de: new Date(fim.getTime() - DIAS_POR_PERIODO[nome] * 86_400_000), nome };
}

export function fimDoDia(agora = new Date()): Date {
  return new Date(`${diaISO(agora)}T23:59:59-03:00`);
}

export const ROTULO_PERIODO: Record<NomePeriodo, string> = {
  custom: 'no período escolhido',
  mes: 'no último mês',
  processo: 'no processo',
  semana: 'na última semana',
};

export interface KpisFila {
  acaoHoje: number;
  confirmados: number;
  convocados: number;
  fila: number;
  matriculados: number;
  perdidos: number;
}

/**
 * Cartões do topo da fila. Os três do período contam pela data da convocação —
 * é ela que marca o início dos três dias úteis de prazo.
 */
export async function kpisDaUnidade(
  db: Database,
  unidadeId: string,
  periodo: Periodo
): Promise<KpisFila> {
  const noPeriodo = and(
    eq(opcao.unidadeId, unidadeId),
    between(convocacao.iniciadaEm, periodo.de, periodo.ate)
  );

  const contarConvocacoes = async (extra: ReturnType<typeof and>) => {
    const [linha] = await db
      .select({ total: count() })
      .from(convocacao)
      .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
      .where(and(noPeriodo, extra));
    return linha?.total ?? 0;
  };

  const porSituacao = await db
    .select({ situacao: opcao.situacao, total: count() })
    .from(opcao)
    .where(
      and(
        eq(opcao.unidadeId, unidadeId),
        inArray(opcao.situacao, ['Lista de espera', 'Selecionado'])
      )
    )
    .groupBy(opcao.situacao);

  const [acao] = await db
    .select({ total: count() })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .where(
      and(
        eq(opcao.unidadeId, unidadeId),
        eq(convocacao.status, 'aberta'),
        lte(convocacao.prazoFim, fimDoDia())
      )
    );

  const [confirmados, matriculados, perdidos] = await Promise.all([
    contarConvocacoes(eq(convocacao.status, 'confirmada')),
    contarConvocacoes(eq(opcao.situacao, 'Ativo')),
    contarConvocacoes(eq(convocacao.status, 'expirada')),
  ]);

  const total = (situacao: Situacao) =>
    porSituacao.find((l) => l.situacao === situacao)?.total ?? 0;

  return {
    acaoHoje: acao?.total ?? 0,
    confirmados,
    convocados: total('Selecionado'),
    fila: total('Lista de espera'),
    matriculados,
    perdidos,
  };
}
