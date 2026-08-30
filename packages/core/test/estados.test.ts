import { describe, expect, test } from 'bun:test';
import { ARESTAS, arestaDe, transicoesPossiveis } from '../src/estados.ts';

describe('máquina de estados da opção', () => {
  test('abrir vaga leva da espera para selecionado', () => {
    expect(arestaDe('Lista de espera', 'Selecionado', 'abrir_vaga')).toBeDefined();
  });

  test('resposta SIM confirma quem está selecionado', () => {
    expect(arestaDe('Selecionado', 'Confirmado', 'resposta_sim')).toBeDefined();
  });

  test('prazo vencido cancela pelo sistema', () => {
    expect(arestaDe('Selecionado', 'Cancelado pelo sistema', 'prazo_vencido')).toBeDefined();
  });

  test('não se confirma quem está na lista de espera', () => {
    expect(arestaDe('Lista de espera', 'Confirmado', 'manual')).toBeUndefined();
  });

  test('não se reabre o que o sistema cancelou', () => {
    expect(transicoesPossiveis('Cancelado pelo sistema')).toHaveLength(0);
  });

  test('cancelamento manual exige justificativa escrita', () => {
    const aresta = arestaDe('Selecionado', 'Cancelado', 'desistiu');
    expect(aresta?.exigeMotivoTexto).toBe(true);
  });

  test('transição automática não exige texto', () => {
    const aresta = arestaDe('Selecionado', 'Cancelado pelo sistema', 'prazo_vencido');
    expect(aresta?.exigeMotivoTexto).toBe(false);
  });

  test('toda aresta declara ao menos um motivo', () => {
    for (const aresta of ARESTAS) {
      expect(aresta.motivos.length).toBeGreaterThan(0);
    }
  });
});
