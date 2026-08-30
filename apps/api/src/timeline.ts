import {
  contato,
  convocacao,
  db,
  eventoAuditoria,
  mensagemInbound,
  nota,
  opcao,
  tentativa,
  user,
} from '@fila-viva/db';
import { asc, desc, eq, inArray } from 'drizzle-orm';

export interface ItemTimeline {
  autor?: string | null;
  canal?: string | null;
  detalhe?: string | null;
  id: string;
  origem?: string | null;
  quando: Date;
  status?: string | null;
  tipo: 'tentativa' | 'inbound' | 'situacao' | 'nota' | 'contato' | 'convocacao';
  titulo: string;
}

/** Timeline unificada da inscrição: tentativa, resposta, status, nota e edição de contato. */
export async function timelineDaInscricao(inscricaoId: string): Promise<ItemTimeline[]> {
  const opcoes = await db
    .select({ id: opcao.id })
    .from(opcao)
    .where(eq(opcao.inscricaoId, inscricaoId));
  const opcaoIds = opcoes.map((o) => o.id);

  const convocacoes = opcaoIds.length
    ? await db.select().from(convocacao).where(inArray(convocacao.opcaoId, opcaoIds))
    : [];
  const convocacaoIds = convocacoes.map((c) => c.id);

  const [tentativas, inbounds, notas, contatos, eventos] = await Promise.all([
    convocacaoIds.length
      ? db.select().from(tentativa).where(inArray(tentativa.convocacaoId, convocacaoIds))
      : Promise.resolve([]),
    convocacaoIds.length
      ? db
          .select()
          .from(mensagemInbound)
          .where(inArray(mensagemInbound.convocacaoId, convocacaoIds))
      : Promise.resolve([]),
    db.select().from(nota).where(eq(nota.inscricaoId, inscricaoId)).orderBy(desc(nota.criadoEm)),
    db
      .select()
      .from(contato)
      .where(eq(contato.inscricaoId, inscricaoId))
      .orderBy(asc(contato.versao)),
    opcaoIds.length
      ? db
          .select()
          .from(eventoAuditoria)
          .where(inArray(eventoAuditoria.entidadeId, [...opcaoIds, ...convocacaoIds, inscricaoId]))
      : Promise.resolve([]),
  ]);

  const autores = new Map<string, string>();
  const idsAutores = [
    ...new Set(
      [...notas, ...contatos, ...eventos, ...tentativas]
        .map((r) => ('autorId' in r ? r.autorId : null))
        .filter((v): v is string => Boolean(v))
    ),
  ];
  if (idsAutores.length) {
    const linhas = await db
      .select({ id: user.id, nome: user.name })
      .from(user)
      .where(inArray(user.id, idsAutores));
    for (const l of linhas) {
      autores.set(l.id, l.nome);
    }
  }

  const itens: ItemTimeline[] = [];

  for (const t of tentativas) {
    itens.push({
      autor: t.autorId ? (autores.get(t.autorId) ?? null) : null,
      canal: t.canal.toUpperCase(),
      detalhe: t.resultado ?? (t.destino ? `para ${t.destino}` : null),
      id: t.id,
      origem: t.origem,
      quando: t.executadaEm ?? t.agendadaPara ?? new Date(),
      status: t.status,
      tipo: 'tentativa',
      titulo:
        t.origem === 'manual'
          ? `Tentativa manual por ${t.canal}`
          : `Tentativa automática por ${t.canal}`,
    });
  }

  for (const m of inbounds) {
    itens.push({
      canal: 'INBOUND',
      detalhe: m.texto,
      id: m.id,
      origem: m.origemIa,
      quando: m.recebidaEm,
      status: m.classificacao
        ? `${m.classificacao} · ${Math.round((m.confianca ?? 0) * 100)}%`
        : null,
      tipo: 'inbound',
      titulo: 'Resposta da família',
    });
  }

  for (const n of notas) {
    itens.push({
      autor: n.autorId ? (autores.get(n.autorId) ?? null) : null,
      canal: 'MANUAL',
      detalhe: n.texto,
      id: n.id,
      quando: n.criadoEm,
      tipo: 'nota',
      titulo: 'Nota',
    });
  }

  contatos.forEach((c, indice) => {
    itens.push({
      autor: c.autorId ? (autores.get(c.autorId) ?? null) : null,
      canal: 'MANUAL',
      detalhe: [c.telefone, c.whatsapp, c.email].filter(Boolean).join(' · '),
      id: c.id,
      quando: c.criadoEm,
      tipo: 'contato',
      titulo: indice === 0 ? 'Contato cadastrado' : `Contato atualizado (versão ${c.versao})`,
    });
  });

  for (const e of eventos) {
    if (e.entidade === 'contato' || e.entidade === 'nota') {
      continue;
    }
    const antes = (e.antesJson as { situacao?: string } | null)?.situacao;
    const depois = (e.depoisJson as { situacao?: string } | null)?.situacao;
    itens.push({
      autor: e.autorId ? (autores.get(e.autorId) ?? null) : null,
      canal: 'STATUS',
      detalhe: e.motivo,
      id: e.id,
      quando: e.criadoEm,
      tipo: e.entidade === 'convocacao' ? 'convocacao' : 'situacao',
      titulo:
        antes && depois
          ? `${antes} → ${depois}`
          : e.acao === 'abrir_vaga'
            ? 'Vaga aberta e criança selecionada'
            : e.acao.replace(/_/g, ' '),
    });
  }

  return itens.sort((a, b) => b.quando.getTime() - a.quando.getTime());
}
