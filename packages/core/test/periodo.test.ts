import { describe, expect, test } from 'bun:test';
import { resolverPeriodo } from '../src/fila.ts';

const AGORA = new Date('2026-03-10T15:00:00-03:00');

describe('período dos cartões da fila', () => {
  test('sem filtro, o padrão é o último mês', () => {
    const periodo = resolverPeriodo({}, AGORA);
    expect(periodo.nome).toBe('mes');
    expect(Math.round((periodo.ate.getTime() - periodo.de.getTime()) / 86_400_000)).toBe(30);
  });

  test('última semana cobre sete dias', () => {
    const periodo = resolverPeriodo({ periodo: 'semana' }, AGORA);
    expect(Math.round((periodo.ate.getTime() - periodo.de.getTime()) / 86_400_000)).toBe(7);
  });

  test('processo começa no início do ciclo', () => {
    expect(resolverPeriodo({ periodo: 'processo' }, AGORA).de.getUTCFullYear()).toBe(2025);
  });

  test('personalizado sem as duas datas cai no padrão', () => {
    expect(resolverPeriodo({ de: '2026-03-01', periodo: 'custom' }, AGORA).nome).toBe('mes');
  });

  test('personalizado fecha o intervalo no fim do dia final', () => {
    const periodo = resolverPeriodo(
      { ate: '2026-03-05', de: '2026-03-01', periodo: 'custom' },
      AGORA
    );
    expect(periodo.nome).toBe('custom');
    expect(periodo.de.toISOString()).toBe('2026-03-01T03:00:00.000Z');
    expect(periodo.ate.toISOString()).toBe('2026-03-06T02:59:59.000Z');
  });
});

describe('período personalizado com data inválida', () => {
  test('cai no padrão em vez de quebrar a consulta', () => {
    const periodo = resolverPeriodo({ ate: 'ontem', de: 'hoje', periodo: 'custom' }, AGORA);
    expect(periodo.nome).toBe('mes');
    expect(Number.isNaN(periodo.de.getTime())).toBe(false);
  });
});
