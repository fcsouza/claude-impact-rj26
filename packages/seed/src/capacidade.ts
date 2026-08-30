import { readFileSync } from 'node:fs';
import { capacidade, db, id, type Turno, unidade } from '@fila-viva/db';
import { sql } from 'drizzle-orm';

/**
 * Carga da capacidade instalada a partir do datalake da cidade.
 *
 * O arquivo é a saída de `bq query --format=json` sobre
 * `datario.educacao_basica.turma` — a consulta está no README. Nada de rede aqui:
 * quem tem acesso ao BigQuery exporta, este script só grava.
 *
 *   bun run --cwd packages/seed capacidade turmas.json
 */

interface LinhaTurma {
  ano: number | string;
  capacidade_sala?: number | string | null;
  grupamento?: string | null;
  id_escola: number | string;
  matriculados?: number | string | null;
  turno?: string | null;
}

/** O datalake fala em turno de aula; a fila fala em jornada da criança. */
function traduzirTurno(bruto: string | null | undefined): Turno | null {
  const limpo = (bruto ?? '').trim().toLowerCase();
  if (limpo === 'integral') {
    return 'Integral';
  }
  if (limpo === 'manhã' || limpo === 'manha' || limpo === 'tarde' || limpo === 'noite') {
    return 'Parcial';
  }
  return null;
}

function inteiro(valor: number | string | null | undefined): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

async function carregar(caminho: string) {
  const linhas = JSON.parse(readFileSync(caminho, 'utf8')) as LinhaTurma[];
  if (!Array.isArray(linhas)) {
    throw new Error('o arquivo precisa ser um array JSON de turmas');
  }

  const conhecidas = new Set(
    (await db.select({ escCodigo: unidade.escCodigo }).from(unidade)).map((u) => u.escCodigo)
  );

  const somadas = new Map<
    string,
    {
      ano: number;
      grupamento: string;
      matriculados: number;
      turno: Turno;
      unidadeId: string;
      vagas: number;
    }
  >();
  let ignoradas = 0;

  for (const linha of linhas) {
    const unidadeId = String(linha.id_escola).padStart(7, '0');
    const turno = traduzirTurno(linha.turno);
    const grupamento = linha.grupamento?.trim();

    if (!(conhecidas.has(unidadeId) && turno && grupamento)) {
      ignoradas += 1;
      continue;
    }

    const chave = `${unidadeId}|${linha.ano}|${grupamento}|${turno}`;
    const atual = somadas.get(chave) ?? {
      ano: Number(linha.ano),
      grupamento,
      matriculados: 0,
      turno,
      unidadeId,
      vagas: 0,
    };
    atual.vagas += inteiro(linha.capacidade_sala);
    atual.matriculados += inteiro(linha.matriculados);
    somadas.set(chave, atual);
  }

  const valores = [...somadas.values()].map((v) => ({ ...v, fonte: 'datalake', id: id('cap') }));

  for (let i = 0; i < valores.length; i += 500) {
    await db
      .insert(capacidade)
      .values(valores.slice(i, i + 500))
      .onConflictDoUpdate({
        // `excluded` é a linha que o insert tentou gravar: a carga nova vence a velha.
        set: {
          fonte: sql`excluded.fonte`,
          matriculados: sql`excluded.matriculados`,
          vagas: sql`excluded.vagas`,
        },
        target: [capacidade.unidadeId, capacidade.ano, capacidade.grupamento, capacidade.turno],
      });
  }

  process.stdout.write(
    `capacidade: ${valores.length} linhas gravadas, ${ignoradas} turmas ignoradas\n`
  );
}

const arquivo = process.argv[2];
if (!arquivo) {
  process.stderr.write('uso: bun run --cwd packages/seed capacidade <arquivo.json>\n');
  process.exit(1);
}

await carregar(arquivo);
process.exit(0);
