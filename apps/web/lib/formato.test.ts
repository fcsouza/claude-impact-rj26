import { describe, expect, test } from 'bun:test';
import { paginar, prazo, rotuloAcao, rotuloSituacao } from './formato.ts';

const LISTA = Array.from({ length: 32 }, (_, i) => i + 1);

describe('paginação de lista já carregada', () => {
  test('a primeira página traz o começo e o total inteiro', () => {
    const p = paginar(LISTA, undefined, 15);
    expect(p.itens).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(p.total).toBe(32);
    expect(p.pagina).toBe(1);
  });

  test('a última página traz o resto', () => {
    expect(paginar(LISTA, '3', 15).itens).toEqual([31, 32]);
  });

  test('página além do fim cai na última, não devolve vazio', () => {
    expect(paginar(LISTA, '99', 15).pagina).toBe(3);
  });

  test('página inválida ou negativa cai na primeira', () => {
    expect(paginar(LISTA, 'abc', 15).pagina).toBe(1);
    expect(paginar(LISTA, '-2', 15).pagina).toBe(1);
  });

  test('lista vazia continua na página 1', () => {
    const p = paginar([], '4', 15);
    expect(p.pagina).toBe(1);
    expect(p.total).toBe(0);
  });
});

describe('vocabulário da tela', () => {
  test('o banco grava Ativo; a tela diz Matriculado', () => {
    expect(rotuloSituacao('Ativo')).toBe('Matriculado');
    expect(rotuloSituacao('Selecionado')).toBe('Convocado');
  });

  test('ação de auditoria vira frase', () => {
    expect(rotuloAcao('situacao:prazo_vencido')).toBe('Cancelada pelo prazo');
  });

  test('prazo fala português em singular e plural', () => {
    expect(prazo(new Date(Date.now() + 12 * 3_600_000)).texto).toBe('falta 1 dia');
    expect(prazo(new Date(Date.now() + 48 * 3_600_000)).texto).toBe('faltam 2 dias');
    expect(prazo(new Date(Date.now() - 30 * 3_600_000)).texto).toBe('vencido ontem');
  });
});
