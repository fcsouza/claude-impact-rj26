import { convocacao, db, mensagemInbound, opcao } from '@fila-viva/db';
import { eq } from 'drizzle-orm';
import { type Autor, exigirUnidade } from './contexto.ts';

/**
 * A unidade não está na convocação nem na mensagem — está na opção. Estas funções
 * fazem esse caminho antes de qualquer leitura ou escrita, para que o servidor de
 * uma creche não alcance a fila de outra.
 */
export async function unidadeDaConvocacao(convocacaoId: string): Promise<string | null> {
  const [linha] = await db
    .select({ unidadeId: opcao.unidadeId })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .where(eq(convocacao.id, convocacaoId));
  return linha?.unidadeId ?? null;
}

export async function unidadeDoInbound(inboundId: string): Promise<string | null> {
  const [linha] = await db
    .select({ unidadeId: opcao.unidadeId })
    .from(mensagemInbound)
    .innerJoin(convocacao, eq(mensagemInbound.convocacaoId, convocacao.id))
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .where(eq(mensagemInbound.id, inboundId));
  return linha?.unidadeId ?? null;
}

/** Devolve o erro pronto quando a convocação está fora do alcance do autor. */
export async function exigirAcessoAConvocacao(autor: Autor, convocacaoId: string) {
  const unidadeId = await unidadeDaConvocacao(convocacaoId);
  if (!unidadeId) {
    return { erro: 'nao-encontrado' as const };
  }
  const negado = exigirUnidade(autor, unidadeId);
  return negado ? { erro: 'negado' as const, resposta: negado } : { erro: null, unidadeId };
}

export async function exigirAcessoAoInbound(autor: Autor, inboundId: string) {
  const unidadeId = await unidadeDoInbound(inboundId);
  if (!unidadeId) {
    return { erro: 'nao-encontrado' as const };
  }
  const negado = exigirUnidade(autor, unidadeId);
  return negado ? { erro: 'negado' as const, resposta: negado } : { erro: null, unidadeId };
}
