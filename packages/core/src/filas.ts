import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const FILA_TENTATIVA = 'convocacao.tentativa';
export const FILA_EXPIRAR = 'convocacao.expirar';

export interface JobTentativa {
  canal: 'whatsapp' | 'sms' | 'email';
  convocacaoId: string;
  dia: number;
  /**
   * Disparo pedido por um servidor na ficha. A chave vem pronta de quem enfileirou:
   * gerá-la no worker mudaria a cada retry e mandaria a mesma mensagem duas vezes.
   */
  manual?: { chave: string; autorId: string };
}

export interface JobExpirar {
  convocacaoId: string;
}

/**
 * O BullMQ rodando sob Bun não consegue carregar o ioredis sozinho —
 * entregamos a conexão pronta. `maxRetriesPerRequest: null` é exigência do Worker.
 */
let _redis: IORedis | null = null;

export function redis(): IORedis {
  _redis ??= new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return _redis;
}

function conexao() {
  return { connection: redis() };
}

let _tentativas: Queue<JobTentativa> | null = null;
let _expiracoes: Queue<JobExpirar> | null = null;

export function filaTentativas(): Queue<JobTentativa> {
  _tentativas ??= new Queue<JobTentativa>(FILA_TENTATIVA, conexao());
  return _tentativas;
}

export function filaExpiracoes(): Queue<JobExpirar> {
  _expiracoes ??= new Queue<JobExpirar>(FILA_EXPIRAR, conexao());
  return _expiracoes;
}

/** Retentativa com backoff; o jobId repetido é descartado pelo próprio BullMQ. */
export const OPCOES_JOB = {
  attempts: 5,
  backoff: { delay: 5000, type: 'exponential' as const },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
};

export async function fecharFilas() {
  await Promise.all([_tentativas?.close(), _expiracoes?.close()]);
  _tentativas = null;
  _expiracoes = null;
  await _redis?.quit();
  _redis = null;
}
