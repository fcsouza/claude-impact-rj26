import { describe, expect, test } from 'bun:test';
import { classificarPorPalavraChave } from '../src/classificar.ts';

describe('classificação por palavra-chave, a rede de segurança sem credencial', () => {
  test.each([
    ['SIM, confirmo a vaga', 'confirma'],
    ['nao quero mais, ja consegui outra creche', 'desiste'],
    ['consigo so na sexta de manha', 'extensao'],
    ['preciso de mais prazo para levar os documentos', 'extensao'],
    ['qual o horario de funcionamento?', 'duvida'],
  ])('lê "%s" como %s', (texto, esperado) => {
    expect(classificarPorPalavraChave(texto).classificacao).toBe(esperado);
  });

  test('o que não encaixa vira outro, com confiança baixa', () => {
    const leitura = classificarPorPalavraChave('kkkk');
    expect(leitura.classificacao).toBe('outro');
    expect(leitura.confianca).toBeLessThan(0.5);
  });

  test('a origem fica marcada como fallback', () => {
    expect(classificarPorPalavraChave('sim').origem).toBe('fallback');
  });
});
