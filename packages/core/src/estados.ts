import { type Database, eventoAuditoria, id, opcao, type Situacao } from '@fila-viva/db';
import { eq } from 'drizzle-orm';

export type MotivoTransicao =
  | 'abrir_vaga'
  | 'manual'
  | 'resposta_sim'
  | 'prazo_vencido'
  | 'desistiu'
  | 'nao_localizado'
  | 'confirmado_em_outra_opcao';

interface Aresta {
  de: Situacao;
  exigeMotivoTexto: boolean;
  motivos: MotivoTransicao[];
  para: Situacao;
}

/**
 * Máquina de estados da opção. Toda mudança de situação passa por aqui —
 * não existe update direto de `situacao` em lugar nenhum do sistema.
 */
export const ARESTAS: Aresta[] = [
  {
    de: 'Lista de espera',
    exigeMotivoTexto: false,
    motivos: ['abrir_vaga', 'manual'],
    para: 'Selecionado',
  },
  {
    de: 'Selecionado',
    exigeMotivoTexto: false,
    motivos: ['resposta_sim', 'manual'],
    para: 'Confirmado',
  },
  {
    de: 'Selecionado',
    exigeMotivoTexto: false,
    motivos: ['prazo_vencido'],
    para: 'Cancelado pelo sistema',
  },
  {
    de: 'Selecionado',
    exigeMotivoTexto: true,
    motivos: ['desistiu', 'nao_localizado', 'manual'],
    para: 'Cancelado',
  },
  {
    de: 'Lista de espera',
    exigeMotivoTexto: false,
    motivos: ['confirmado_em_outra_opcao'],
    para: 'Cancelado na confirmacao',
  },
  {
    de: 'Selecionado',
    exigeMotivoTexto: false,
    motivos: ['confirmado_em_outra_opcao'],
    para: 'Cancelado na confirmacao',
  },
  { de: 'Ativo', exigeMotivoTexto: false, motivos: ['resposta_sim', 'manual'], para: 'Confirmado' },
  {
    de: 'Selecionado da lista',
    exigeMotivoTexto: false,
    motivos: ['resposta_sim', 'manual'],
    para: 'Confirmado',
  },
];

export class TransicaoInvalida extends Error {
  constructor(de: Situacao, para: Situacao, motivo: MotivoTransicao) {
    super(`transição não permitida: ${de} → ${para} por ${motivo}`);
    this.name = 'TransicaoInvalida';
  }
}

export class MotivoObrigatorio extends Error {
  constructor(de: Situacao, para: Situacao) {
    super(`${de} → ${para} exige justificativa escrita`);
    this.name = 'MotivoObrigatorio';
  }
}

export function arestaDe(
  de: Situacao,
  para: Situacao,
  motivo: MotivoTransicao
): Aresta | undefined {
  return ARESTAS.find((a) => a.de === de && a.para === para && a.motivos.includes(motivo));
}

export function transicoesPossiveis(de: Situacao): Situacao[] {
  return [...new Set(ARESTAS.filter((a) => a.de === de).map((a) => a.para))];
}

export interface ArgsTransicao {
  autorId?: string | null;
  justificativa?: string | null;
  motivo: MotivoTransicao;
  opcaoId: string;
  para: Situacao;
}

/** Valida a aresta, grava a nova situação e registra o evento de auditoria. */
export async function transicionar(db: Database, args: ArgsTransicao) {
  const atual = await db.query.opcao.findFirst({ where: eq(opcao.id, args.opcaoId) });
  if (!atual) {
    throw new Error(`opção ${args.opcaoId} não encontrada`);
  }

  const aresta = arestaDe(atual.situacao, args.para, args.motivo);
  if (!aresta) {
    throw new TransicaoInvalida(atual.situacao, args.para, args.motivo);
  }
  if (aresta.exigeMotivoTexto && !args.justificativa?.trim()) {
    throw new MotivoObrigatorio(atual.situacao, args.para);
  }

  const agora = new Date();

  // Situação e auditoria numa transação só: registro sem rastro é pior que erro.
  return await db.transaction(async (tx) => {
    const [atualizada] = await tx
      .update(opcao)
      .set({ situacao: args.para, situacaoAtualizadaEm: agora })
      .where(eq(opcao.id, args.opcaoId))
      .returning();

    await tx.insert(eventoAuditoria).values({
      acao: `situacao:${args.motivo}`,
      antesJson: { situacao: atual.situacao },
      autorId: args.autorId ?? null,
      criadoEm: agora,
      depoisJson: { situacao: args.para },
      entidade: 'opcao',
      entidadeId: args.opcaoId,
      id: id('aud'),
      motivo: args.justificativa ?? null,
    });

    return atualizada;
  });
}

/** Auditoria de qualquer entidade que não seja transição de situação. */
export async function auditar(
  db: Database,
  args: {
    entidade: string;
    entidadeId: string;
    acao: string;
    antes?: Record<string, unknown> | null;
    depois?: Record<string, unknown> | null;
    motivo?: string | null;
    autorId?: string | null;
  }
) {
  await db.insert(eventoAuditoria).values({
    acao: args.acao,
    antesJson: args.antes ?? null,
    autorId: args.autorId ?? null,
    depoisJson: args.depois ?? null,
    entidade: args.entidade,
    entidadeId: args.entidadeId,
    id: id('aud'),
    motivo: args.motivo ?? null,
  });
}
