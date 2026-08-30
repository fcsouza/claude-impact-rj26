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
import { and, asc, desc, eq, inArray, like, ne, notInArray, or } from 'drizzle-orm';
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

// 'Selecionado da lista' vem do sistema de origem e vale como seleção: quem está
// nesse estado não pode ser chamado de novo em outra unidade.
const SITUACOES_QUE_BLOQUEIAM = [
  'Confirmado',
  'Selecionado',
  'Selecionado da lista',
  'Ativo',
] as const;

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
    .where(and(eq(convocacao.id, args.convocacaoId), eq(convocacao.status, 'aberta')));

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

  // Condicional: se a família confirmou entre a leitura e aqui, o UPDATE não pega
  // e a expiração desiste em vez de sobrescrever a confirmação.
  const encerradas = await db
    .update(convocacao)
    .set({ encerradaEm: new Date(), status: 'expirada' })
    .where(and(eq(convocacao.id, convocacaoId), eq(convocacao.status, 'aberta')))
    .returning({ id: convocacao.id });

  if (encerradas.length === 0) {
    return { expirada: false as const, motivo: 'a convocação mudou de estado antes da expiração' };
  }

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

/**
 * Acha a convocação aberta de quem escreveu, pelo telefone.
 *
 * A família quase nunca responde citando a mensagem original, então o webhook chega
 * sem o id da mensagem. O que sobra é o número: comparamos pelos últimos oito dígitos,
 * que sobrevivem ao nono dígito, ao DDI e à formatação de cada provedor.
 */
export async function convocacaoAbertaPorTelefone(db: Database, telefone: string) {
  const digitos = telefone.replace(/\D/g, '');
  if (digitos.length < 8) {
    return null;
  }
  const finalDoNumero = `%${digitos.slice(-8)}`;

  const [linha] = await db
    .select({
      convocacaoId: convocacao.id,
      iniciadaEm: convocacao.iniciadaEm,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(contato, eq(contato.inscricaoId, inscricao.id))
    .where(
      and(
        eq(convocacao.status, 'aberta'),
        or(like(contato.whatsapp, finalDoNumero), like(contato.telefone, finalDoNumero))
      )
    )
    .orderBy(desc(convocacao.iniciadaEm))
    .limit(1);

  return linha ?? null;
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

/** Situações que o servidor pode gravar à mão na tela da ficha. */
export type SituacaoManual = 'Ativo' | 'Confirmado' | 'Cancelado' | 'Cancelado pelo sistema';

const STATUS_DA_CONVOCACAO: Record<SituacaoManual, 'cancelada' | 'confirmada' | 'expirada'> = {
  Ativo: 'confirmada',
  Cancelado: 'cancelada',
  'Cancelado pelo sistema': 'expirada',
  Confirmado: 'confirmada',
};

/**
 * Atualiza o status da convocação a partir da ficha: transiciona a opção, encerra a
 * convocação aberta e, quando a criança fica na unidade, cancela as demais opções do
 * cadastro. Sem isso o worker seguiria disparando tentativa de uma convocação já decidida.
 */
export async function atualizarStatusDaConvocacao(
  db: Database,
  args: {
    autorId?: string | null;
    justificativa: string;
    motivo: 'manual' | 'desistiu' | 'nao_localizado' | 'prazo_vencido';
    opcaoId: string;
    para: SituacaoManual;
  }
) {
  const alvo = await db.query.opcao.findFirst({ where: eq(opcao.id, args.opcaoId) });
  if (!alvo) {
    throw new Error(`opção ${args.opcaoId} não encontrada`);
  }

  await transicionar(db, {
    autorId: args.autorId,
    justificativa: args.justificativa,
    motivo: args.motivo,
    opcaoId: args.opcaoId,
    para: args.para,
  });

  let opcoesCanceladas = 0;
  if (args.para === 'Confirmado' || args.para === 'Ativo') {
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
    opcoesCanceladas = irmas.length;
  }

  const encerradas = await db
    .update(convocacao)
    .set({ encerradaEm: new Date(), status: STATUS_DA_CONVOCACAO[args.para] })
    .where(and(eq(convocacao.opcaoId, args.opcaoId), eq(convocacao.status, 'aberta')))
    .returning({ id: convocacao.id });

  return { convocacoesEncerradas: encerradas.length, opcoesCanceladas };
}
