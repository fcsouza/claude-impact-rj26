import {
  contato,
  convocacao,
  type Database,
  id,
  inscricao,
  opcao,
  type Turno,
  tentativa,
  vaga,
} from '@fila-viva/db';
import { and, asc, desc, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { proximoDiaUtil, somarDiasUteis } from './dias-uteis.ts';
import { auditar, transicionar } from './estados.ts';
import { filaExpiracoes, filaTentativas, OPCOES_JOB } from './filas.ts';

/** Cadência do PRD: D0 WhatsApp, D1 WhatsApp e SMS, D2 SMS e e-mail. */
export const CADENCIA: { dia: number; canais: ('whatsapp' | 'sms' | 'email')[] }[] = [
  { canais: ['whatsapp'], dia: 0 },
  { canais: ['whatsapp', 'sms'], dia: 1 },
  { canais: ['sms', 'email'], dia: 2 },
];

export const PRAZO_DIAS_UTEIS = 3;

export class SemCandidato extends Error {
  constructor(unidadeId: string, turno: string, grupamento: string) {
    super(`nenhuma criança elegível em ${unidadeId} / ${turno} / ${grupamento}`);
    this.name = 'SemCandidato';
  }
}

const SITUACOES_QUE_BLOQUEIAM = ['Confirmado', 'Selecionado', 'Ativo'] as const;

/**
 * Próxima criança da fila: maior pontuação, empate pela inscrição mais antiga.
 * Fica de fora quem já tem confirmação em qualquer unidade, quem já está
 * selecionado em outra opção e quem tem convocação aberta.
 */
export async function proximoCandidato(
  db: Database,
  args: { unidadeId: string; turno: Turno; grupamento: string }
) {
  const bloqueados = db
    .select({ alunoAnon: inscricao.alunoAnon })
    .from(opcao)
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .where(inArray(opcao.situacao, [...SITUACOES_QUE_BLOQUEIAM]));

  const [candidato] = await db
    .select({
      alunoAnon: inscricao.alunoAnon,
      dataCriacao: inscricao.dataCriacao,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
      opcaoId: opcao.id,
      pontuacao: inscricao.pontuacaoTotal,
    })
    .from(opcao)
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .where(
      and(
        eq(opcao.unidadeId, args.unidadeId),
        eq(opcao.turno, args.turno),
        eq(opcao.grupamento, args.grupamento),
        eq(opcao.situacao, 'Lista de espera'),
        notInArray(inscricao.alunoAnon, bloqueados)
      )
    )
    .orderBy(desc(inscricao.pontuacaoTotal), asc(inscricao.dataCriacao))
    .limit(1);

  return candidato ?? null;
}

/** Abre a vaga, seleciona a próxima criança, cria a convocação e agenda a cadência. */
export async function abrirVaga(
  db: Database,
  args: { unidadeId: string; turno: Turno; grupamento: string; autorId?: string | null }
) {
  const candidato = await proximoCandidato(db, args);
  if (!candidato) {
    throw new SemCandidato(args.unidadeId, args.turno, args.grupamento);
  }

  const vagaId = id('vaga');
  await db.insert(vaga).values({
    abertaPor: args.autorId ?? null,
    grupamento: args.grupamento,
    id: vagaId,
    status: 'aberta',
    turno: args.turno,
    unidadeId: args.unidadeId,
  });

  await transicionar(db, {
    autorId: args.autorId,
    motivo: 'abrir_vaga',
    opcaoId: candidato.opcaoId,
    para: 'Selecionado',
  });

  const agora = new Date();
  const prazoFim = somarDiasUteis(agora, PRAZO_DIAS_UTEIS);
  const convocacaoId = id('conv');

  await db.insert(convocacao).values({
    id: convocacaoId,
    iniciadaEm: agora,
    opcaoId: candidato.opcaoId,
    prazoFim,
    status: 'aberta',
    vagaId,
  });

  await db
    .update(vaga)
    .set({ preenchidaPorOpcaoId: candidato.opcaoId, status: 'preenchida' })
    .where(eq(vaga.id, vagaId));

  await auditar(db, {
    acao: 'abrir_vaga',
    autorId: args.autorId,
    depois: { opcaoId: candidato.opcaoId, prazoFim: prazoFim.toISOString() },
    entidade: 'convocacao',
    entidadeId: convocacaoId,
  });

  await agendarCadencia(convocacaoId, agora, prazoFim);
  return { candidato, convocacaoId, prazoFim, vagaId };
}

/** Um job por canal por dia, com `jobId` fixo — reenfileirar não duplica envio. */
export async function agendarCadencia(convocacaoId: string, inicio: Date, prazoFim: Date) {
  const tentativas = filaTentativas();
  for (const passo of CADENCIA) {
    // D0 sai na hora em que o servidor abre a vaga, inclusive fora de dia útil.
    // As tentativas seguintes respeitam o calendário: ninguém liga no domingo.
    const quando =
      passo.dia === 0
        ? inicio
        : proximoDiaUtil(new Date(inicio.getTime() + passo.dia * 86_400_000));
    for (const canal of passo.canais) {
      // biome-ignore lint/performance/noAwaitInLoops: a fila aceita um job por vez, em ordem
      await tentativas.add(
        `${canal}-d${passo.dia}`,
        { canal, convocacaoId, dia: passo.dia },
        {
          ...OPCOES_JOB,
          delay: Math.max(0, quando.getTime() - Date.now()),
          jobId: `${convocacaoId}-${canal}-d${passo.dia}`,
        }
      );
    }
  }

  await filaExpiracoes().add(
    'expirar',
    { convocacaoId },
    {
      ...OPCOES_JOB,
      delay: Math.max(0, prazoFim.getTime() - Date.now()),
      jobId: `${convocacaoId}-expirar`,
    }
  );
}

/** Confirma a criança e cancela as demais opções do mesmo cadastro. */
export async function confirmar(
  db: Database,
  args: { convocacaoId: string; autorId?: string | null; motivo?: 'resposta_sim' | 'manual' }
) {
  const conv = await db.query.convocacao.findFirst({
    where: eq(convocacao.id, args.convocacaoId),
  });
  if (!conv) {
    throw new Error(`convocação ${args.convocacaoId} não encontrada`);
  }

  const alvo = await db.query.opcao.findFirst({ where: eq(opcao.id, conv.opcaoId) });
  if (!alvo) {
    throw new Error(`opção ${conv.opcaoId} não encontrada`);
  }

  await transicionar(db, {
    autorId: args.autorId,
    motivo: args.motivo ?? 'resposta_sim',
    opcaoId: conv.opcaoId,
    para: 'Confirmado',
  });

  const irmas = await db
    .select({ id: opcao.id })
    .from(opcao)
    .where(
      and(
        eq(opcao.inscricaoId, alvo.inscricaoId),
        ne(opcao.id, alvo.id),
        inArray(opcao.situacao, ['Lista de espera', 'Selecionado'])
      )
    );

  for (const irma of irmas) {
    // biome-ignore lint/performance/noAwaitInLoops: cada cancelamento grava sua própria auditoria
    await transicionar(db, {
      autorId: args.autorId,
      motivo: 'confirmado_em_outra_opcao',
      opcaoId: irma.id,
      para: 'Cancelado na confirmacao',
    });
  }

  await db
    .update(convocacao)
    .set({ encerradaEm: new Date(), status: 'confirmada' })
    .where(eq(convocacao.id, args.convocacaoId));

  return { opcoesCanceladas: irmas.length };
}

/** Prazo vencido: cancela pelo sistema e devolve a vaga para a fila. */
export async function expirar(db: Database, convocacaoId: string) {
  const conv = await db.query.convocacao.findFirst({ where: eq(convocacao.id, convocacaoId) });
  if (conv?.status !== 'aberta') {
    return { expirada: false as const };
  }
  if (conv.prazoFim.getTime() > Date.now()) {
    return { expirada: false as const, motivo: 'prazo ainda vigente' };
  }

  const alvo = await db.query.opcao.findFirst({ where: eq(opcao.id, conv.opcaoId) });
  if (alvo?.situacao !== 'Selecionado') {
    await db
      .update(convocacao)
      .set({ encerradaEm: new Date(), status: 'cancelada' })
      .where(eq(convocacao.id, convocacaoId));
    return { expirada: false as const };
  }

  await transicionar(db, {
    motivo: 'prazo_vencido',
    opcaoId: conv.opcaoId,
    para: 'Cancelado pelo sistema',
  });

  await db
    .update(convocacao)
    .set({ encerradaEm: new Date(), status: 'expirada' })
    .where(eq(convocacao.id, convocacaoId));

  return {
    expirada: true as const,
    grupamento: alvo.grupamento,
    turno: alvo.turno,
    unidadeId: alvo.unidadeId,
  };
}

/** Extensão de prazo: um dia útil, uma vez, só a CRE, com justificativa. */
export async function estenderPrazo(
  db: Database,
  args: { convocacaoId: string; justificativa: string; autorId: string }
) {
  const conv = await db.query.convocacao.findFirst({ where: eq(convocacao.id, args.convocacaoId) });
  if (!conv) {
    throw new Error(`convocação ${args.convocacaoId} não encontrada`);
  }
  if (conv.extensoes >= 1) {
    throw new Error('a convocação já recebeu a extensão permitida');
  }
  if (!args.justificativa.trim()) {
    throw new Error('extensão exige justificativa');
  }

  const novoPrazo = somarDiasUteis(conv.prazoFim, 1);
  await db
    .update(convocacao)
    .set({ extensoes: conv.extensoes + 1, prazoFim: novoPrazo })
    .where(eq(convocacao.id, args.convocacaoId));

  await auditar(db, {
    acao: 'extensao_prazo',
    antes: { prazoFim: conv.prazoFim.toISOString() },
    autorId: args.autorId,
    depois: { prazoFim: novoPrazo.toISOString() },
    entidade: 'convocacao',
    entidadeId: args.convocacaoId,
    motivo: args.justificativa,
  });

  await filaExpiracoes().add(
    'expirar',
    { convocacaoId: args.convocacaoId },
    {
      ...OPCOES_JOB,
      delay: Math.max(0, novoPrazo.getTime() - Date.now()),
      jobId: `${args.convocacaoId}-expirar-${conv.extensoes + 1}`,
    }
  );

  return { prazoFim: novoPrazo };
}

/** Contato vigente da inscrição — a maior versão. */
export async function contatoVigente(db: Database, inscricaoId: string) {
  const [atual] = await db
    .select()
    .from(contato)
    .where(eq(contato.inscricaoId, inscricaoId))
    .orderBy(desc(contato.versao))
    .limit(1);
  return atual ?? null;
}

export async function tentativasDaConvocacao(db: Database, convocacaoId: string) {
  return await db
    .select()
    .from(tentativa)
    .where(eq(tentativa.convocacaoId, convocacaoId))
    .orderBy(asc(tentativa.executadaEm));
}
