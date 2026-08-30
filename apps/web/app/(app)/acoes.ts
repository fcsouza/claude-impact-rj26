'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

const json = (corpo: unknown) => ({ body: JSON.stringify(corpo), method: 'POST' });

export async function confirmarVaga(convocacaoId: string, inscricaoId: string) {
  const resultado = await api(`/api/convocacoes/${convocacaoId}/confirmar`, json({}));
  revalidatePath(`/ficha/${inscricaoId}`);
  return resultado;
}

export async function cancelarConvocacao(entrada: {
  convocacaoId: string;
  inscricaoId: string;
  motivo: 'desistiu' | 'nao_localizado' | 'manual';
  justificativa: string;
}) {
  const resultado = await api(
    `/api/convocacoes/${entrada.convocacaoId}/cancelar`,
    json({ justificativa: entrada.justificativa, motivo: entrada.motivo })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  return resultado;
}

export async function estenderPrazo(entrada: {
  convocacaoId: string;
  inscricaoId: string;
  justificativa: string;
}) {
  const resultado = await api(
    `/api/convocacoes/${entrada.convocacaoId}/estender`,
    json({ justificativa: entrada.justificativa })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  return resultado;
}

export async function registrarTentativaManual(entrada: {
  convocacaoId: string;
  inscricaoId: string;
  canal: string;
  status: string;
  resultado: string;
}) {
  const saida = await api(
    `/api/convocacoes/${entrada.convocacaoId}/tentativa-manual`,
    json({ canal: entrada.canal, resultado: entrada.resultado, status: entrada.status })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  return saida;
}

export async function salvarContato(entrada: {
  inscricaoId: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  melhorHorario?: string;
  obs?: string;
}) {
  const { inscricaoId, ...campos } = entrada;
  const saida = await api(`/api/ficha/${inscricaoId}/contato`, {
    body: JSON.stringify(campos),
    method: 'PUT',
  });
  revalidatePath(`/ficha/${inscricaoId}`);
  return saida;
}

export async function salvarNota(entrada: { inscricaoId: string; texto: string }) {
  const saida = await api(
    `/api/ficha/${entrada.inscricaoId}/notas`,
    json({ texto: entrada.texto })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  return saida;
}

export async function atualizarStatus(entrada: {
  opcaoId: string;
  inscricaoId: string;
  para: string;
  motivo: string;
  justificativa: string;
}) {
  const saida = await api(
    `/api/convocacoes/opcoes/${entrada.opcaoId}/situacao`,
    json({ justificativa: entrada.justificativa, motivo: entrada.motivo, para: entrada.para })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  return saida;
}

export async function notificarSecretaria(convocacaoId: string, inscricaoId: string) {
  const saida = await api<{ destinatarios: number; ok: boolean }>(
    `/api/convocacoes/${convocacaoId}/notificar-secretaria`,
    json({})
  );
  revalidatePath(`/ficha/${inscricaoId}`);
  if (!saida.ok) {
    throw new Error('O provedor de e-mail recusou o envio para a secretaria.');
  }
  return saida;
}

export async function simularResposta(entrada: {
  convocacaoId: string;
  inscricaoId: string;
  texto: string;
}) {
  const saida = await api(
    '/api/inbound/simular',
    json({ convocacaoId: entrada.convocacaoId, texto: entrada.texto })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  return saida;
}

export async function aplicarSugestao(entrada: {
  inboundId: string;
  inscricaoId: string;
  acao: 'confirmar' | 'estender' | 'cancelar' | 'nenhuma';
  justificativa?: string;
}) {
  const saida = await api(
    `/api/inbound/${entrada.inboundId}/aplicar`,
    json({ acao: entrada.acao, justificativa: entrada.justificativa })
  );
  revalidatePath(`/ficha/${entrada.inscricaoId}`);
  revalidatePath('/painel');
  return saida;
}
