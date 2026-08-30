/**
 * Calendário do Rio de Janeiro em 2026: feriados nacionais, estaduais e municipais.
 * Editar aqui quando virar o ano — nada mais no sistema conhece datas de feriado.
 */
export const FERIADOS_RIO_2026 = [
  '2026-01-01', // Confraternização Universal
  '2026-01-20', // São Sebastião, padroeiro da cidade
  '2026-02-16', // Carnaval
  '2026-02-17', // Carnaval
  '2026-03-01', // Aniversário da cidade
  '2026-04-03', // Sexta-feira Santa
  '2026-04-21', // Tiradentes
  '2026-04-23', // São Jorge
  '2026-05-01', // Dia do Trabalho
  '2026-06-04', // Corpus Christi
  '2026-09-07', // Independência
  '2026-10-12', // Nossa Senhora Aparecida
  '2026-11-02', // Finados
  '2026-11-15', // Proclamação da República
  '2026-11-20', // Consciência Negra
  '2026-12-25', // Natal
] as const;

const FERIADOS = new Set<string>(FERIADOS_RIO_2026);

/** Data no fuso do Rio, em `yyyy-mm-dd`. */
export function diaISO(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).format(data);
}

export function ehDiaUtil(data: Date): boolean {
  const semana = new Date(`${diaISO(data)}T12:00:00-03:00`).getUTCDay();
  const fimDeSemana = semana === 0 || semana === 6;
  return !(fimDeSemana || FERIADOS.has(diaISO(data)));
}

/** Soma dias úteis. `somarDiasUteis(sexta, 1)` cai na segunda. */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const data = new Date(inicio);
  let restantes = dias;
  while (restantes > 0) {
    data.setUTCDate(data.getUTCDate() + 1);
    if (ehDiaUtil(data)) {
      restantes -= 1;
    }
  }
  return data;
}

/** Próximo instante útil a partir de uma data — usado para agendar tentativa. */
export function proximoDiaUtil(data: Date): Date {
  const proximo = new Date(data);
  while (!ehDiaUtil(proximo)) {
    proximo.setUTCDate(proximo.getUTCDate() + 1);
  }
  return proximo;
}

export function diasCorridosDesde(data: Date, agora = new Date()): number {
  return Math.floor((agora.getTime() - data.getTime()) / 86_400_000);
}
