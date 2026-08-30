import { canal as escolherCanal, textoEmail, textoSms, textoWhatsapp } from '@fila-viva/channels';
import type { JobTentativa } from '@fila-viva/core';
import { contatoVigente } from '@fila-viva/core';
import { convocacao, db, id, inscricao, opcao, tentativa, unidade } from '@fila-viva/db';
import { eq } from 'drizzle-orm';

/**
 * Executa uma tentativa. A chave `convocacao:canal:dia` marca o envio que deu certo —
 * se ela já existe, o job sai sem mandar nada de novo. Falha transitória grava linha
 * própria e deixa o BullMQ repetir com backoff; falha definitiva ocupa a chave do dia (RNF2).
 */
/** WhatsApp cai no telefone quando não há número dedicado, e vice-versa. */
function escolherDestino(
  canal: JobTentativa['canal'],
  contato: { telefone: string | null; whatsapp: string | null; email: string | null } | null
): string | null {
  if (canal === 'email') {
    return contato?.email ?? null;
  }
  if (canal === 'whatsapp') {
    return contato?.whatsapp ?? contato?.telefone ?? null;
  }
  return contato?.telefone ?? contato?.whatsapp ?? null;
}

function montarTexto(
  canal: JobTentativa['canal'],
  dados: Parameters<typeof textoWhatsapp>[0],
  email: ReturnType<typeof textoEmail> | null
): string {
  if (canal === 'whatsapp') {
    return textoWhatsapp(dados);
  }
  if (canal === 'sms') {
    return textoSms(dados);
  }
  return email?.corpo ?? textoSms(dados);
}

export async function executarTentativa(job: JobTentativa, numeroDaTentativa = 1) {
  const [contextoLinha] = await db
    .select({
      bairro: unidade.bairro,
      convocacaoId: convocacao.id,
      grupamento: opcao.grupamento,
      inscricaoId: inscricao.id,
      nome: inscricao.nomeFicticio,
      prazoFim: convocacao.prazoFim,
      situacao: opcao.situacao,
      statusConvocacao: convocacao.status,
      turno: opcao.turno,
      unidade: unidade.nome,
    })
    .from(convocacao)
    .innerJoin(opcao, eq(convocacao.opcaoId, opcao.id))
    .innerJoin(inscricao, eq(opcao.inscricaoId, inscricao.id))
    .innerJoin(unidade, eq(opcao.unidadeId, unidade.escCodigo))
    .where(eq(convocacao.id, job.convocacaoId));

  if (!contextoLinha) {
    return { pulado: 'convocação inexistente' };
  }
  if (contextoLinha.statusConvocacao !== 'aberta') {
    return { pulado: `convocação ${contextoLinha.statusConvocacao}` };
  }
  if (contextoLinha.situacao !== 'Selecionado') {
    return { pulado: `opção em ${contextoLinha.situacao}` };
  }

  const chave = `${job.convocacaoId}:${job.canal}:${job.dia}`;
  const jaExiste = await db.query.tentativa.findFirst({
    where: eq(tentativa.chaveIdempotencia, chave),
  });
  if (jaExiste) {
    return { pulado: 'tentativa já registrada neste dia e canal' };
  }

  const contato = await contatoVigente(db, contextoLinha.inscricaoId);
  const destino = escolherDestino(job.canal, contato);

  const dados = {
    endereco: contextoLinha.bairro ?? 'consulte a secretaria da unidade',
    grupamento: contextoLinha.grupamento,
    nomeCrianca: contextoLinha.nome,
    prazoFim: contextoLinha.prazoFim,
    turno: contextoLinha.turno,
    unidade: contextoLinha.unidade,
  };

  if (!destino) {
    await db.insert(tentativa).values({
      canal: job.canal,
      chaveIdempotencia: chave,
      convocacaoId: job.convocacaoId,
      dia: job.dia,
      executadaEm: new Date(),
      id: id('tent'),
      origem: 'auto',
      resultado: `sem ${job.canal} cadastrado para a família`,
      status: 'falhou',
    });
    // Contato ausente não melhora com retry: ocupa a chave do dia e encerra.
    return { falhou: 'contato ausente' };
  }

  const canal = escolherCanal(job.canal);
  const email = job.canal === 'email' ? textoEmail(dados) : null;
  const texto = montarTexto(job.canal, dados, email);

  const resultado = await canal.send({
    assunto: email?.assunto,
    destino,
    referencia: chave,
    texto,
  });

  await db.insert(tentativa).values({
    canal: job.canal,
    // Só o envio que deu certo ocupa a chave do dia; a falha fica numerada e libera o retry.
    chaveIdempotencia: resultado.ok ? chave : `${chave}:falha:${numeroDaTentativa}`,
    convocacaoId: job.convocacaoId,
    destino,
    dia: job.dia,
    executadaEm: new Date(),
    id: id('tent'),
    origem: 'auto',
    payloadJson: resultado.payload ?? null,
    providerId: resultado.providerId ?? null,
    resultado: resultado.erro ?? `enviado por ${canal.provedor}`,
    status: resultado.status,
  });

  if (!resultado.ok) {
    throw new Error(`envio falhou em ${canal.provedor}: ${resultado.erro}`);
  }

  return { enviado: true, provedor: canal.provedor, providerId: resultado.providerId };
}
