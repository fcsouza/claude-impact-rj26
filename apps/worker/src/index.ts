import {
  abrirVaga,
  expirar,
  FILA_EXPIRAR,
  FILA_TENTATIVA,
  type JobExpirar,
  type JobTentativa,
  REDIS_URL,
  redis,
  SemCandidato,
} from '@fila-viva/core';
import { db } from '@fila-viva/db';
import { Worker } from 'bullmq';
import { executarTentativa } from './enviar.ts';

const conexao = { connection: redis() };

const tentativas = new Worker<JobTentativa>(
  FILA_TENTATIVA,
  async (job) => await executarTentativa(job.data, job.attemptsMade + 1),
  { ...conexao, concurrency: 5 }
);

const expiracoes = new Worker<JobExpirar>(
  FILA_EXPIRAR,
  async (job) => {
    const resultado = await expirar(db, job.data.convocacaoId);
    if (!resultado.expirada) {
      return resultado;
    }

    // Prazo vencido devolve a vaga para a fila e chama a próxima criança (RF3.7).
    try {
      const nova = await abrirVaga(db, {
        grupamento: resultado.grupamento,
        turno: resultado.turno,
        unidadeId: resultado.unidadeId,
      });
      return { expirada: true, reabertaPara: nova.candidato.nome };
    } catch (erro) {
      if (erro instanceof SemCandidato) {
        return { aviso: erro.message, expirada: true, reabertaPara: null };
      }
      throw erro;
    }
  },
  { ...conexao, concurrency: 2 }
);

for (const [nome, worker] of [
  ['tentativa', tentativas],
  ['expirar', expiracoes],
] as const) {
  worker.on('completed', (job, resultado) => {
    process.stdout.write(`[${nome}] ${job.id} → ${JSON.stringify(resultado)}\n`);
  });
  worker.on('failed', (job, erro) => {
    process.stderr.write(`[${nome}] ${job?.id} falhou: ${erro.message}\n`);
  });
}

process.stdout.write(`worker ligado em ${REDIS_URL}\n`);

async function encerrar() {
  await Promise.all([tentativas.close(), expiracoes.close()]);
  process.exit(0);
}

process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
