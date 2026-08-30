import {
  contato,
  convocacao,
  type Database,
  inscricao,
  opcao,
  type Situacao,
  type Turno,
  unidade,
} from '@fila-viva/db';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { diasCorridosDesde } from './dias-uteis.ts';

export const GRUPAMENTOS = ['Berçário', 'Maternal I', 'Maternal II'] as const;

export type Badge =
  | { tipo: 'selecionado_ha'; dias: number }
  | { tipo: 'prazo_vencido'; dias: number }
  | { tipo: 'inconsistencia'; detalhe: string }
  | { tipo: 'contato_desatualizado'; meses: number }
  | { tipo: 'bairro_diferente'; bairroFamilia: string; bairroUnidade: string };

const MESES_ATE_CONTATO_ENVELHECER = 12;

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
      contatoEm: sql<Date | null>`(
        select max(${contato.criadoEm}) from ${contato} where ${contato.inscricaoId} = ${inscricao.id}
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

    if (l.contatoEm) {
      const meses = Math.floor(diasCorridosDesde(new Date(l.contatoEm), agora) / 30);
      if (meses >= MESES_ATE_CONTATO_ENVELHECER) {
        badges.push({ meses, tipo: 'contato_desatualizado' });
      }
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

export async function resumoDaUnidade(db: Database, unidadeId: string) {
  const linhas = await db
    .select({ situacao: opcao.situacao, total: count() })
    .from(opcao)
    .where(eq(opcao.unidadeId, unidadeId))
    .groupBy(opcao.situacao);

  return Object.fromEntries(linhas.map((l) => [l.situacao, l.total])) as Record<Situacao, number>;
}
