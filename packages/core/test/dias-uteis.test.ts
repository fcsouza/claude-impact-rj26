import { describe, expect, test } from 'bun:test';
import { ehDiaUtil, proximoDiaUtil, somarDiasUteis } from '../src/dias-uteis.ts';

const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe('dias úteis no calendário do Rio', () => {
  test('fim de semana não é dia útil', () => {
    expect(ehDiaUtil(dia('2026-08-29'))).toBe(false); // sábado
    expect(ehDiaUtil(dia('2026-08-30'))).toBe(false); // domingo
    expect(ehDiaUtil(dia('2026-08-31'))).toBe(true); // segunda
  });

  test('feriado municipal não é dia útil', () => {
    expect(ehDiaUtil(dia('2026-01-20'))).toBe(false); // São Sebastião
    expect(ehDiaUtil(dia('2026-04-23'))).toBe(false); // São Jorge
    expect(ehDiaUtil(dia('2026-01-21'))).toBe(true);
  });

  test('prazo de três dias úteis pula o fim de semana', () => {
    // quarta 26/08 + 3 úteis = segunda 31/08, porque 29 e 30 são fim de semana
    const prazo = somarDiasUteis(dia('2026-08-26'), 3);
    expect(prazo.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  test('prazo pula o feriado que cai no meio', () => {
    // sexta 04/09 + 3 úteis: 07/09 é Independência, então 08, 09 e 10
    const prazo = somarDiasUteis(dia('2026-09-04'), 3);
    expect(prazo.toISOString().slice(0, 10)).toBe('2026-09-10');
  });

  test('próximo dia útil a partir do domingo é segunda', () => {
    expect(proximoDiaUtil(dia('2026-08-30')).toISOString().slice(0, 10)).toBe('2026-08-31');
  });
});
