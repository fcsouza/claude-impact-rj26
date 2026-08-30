import { contele } from './contele.ts';
import { kapso } from './kapso.ts';
import { mock } from './mock.ts';
import { resend } from './resend.ts';
import type { CanalNome, Channel } from './tipos.ts';

export * from './mensagens.ts';
export * from './tipos.ts';
export { contele, kapso, mock, resend };

/** Um canal por variável de ambiente. Sem chave, tudo cai no mock. */
export function canal(nome: CanalNome): Channel {
  const escolha = {
    email: process.env.CANAL_EMAIL ?? 'mock',
    sms: process.env.CANAL_SMS ?? 'mock',
    whatsapp: process.env.CANAL_WHATSAPP ?? 'mock',
  }[nome];

  if (nome === 'whatsapp' && escolha === 'kapso') {
    return kapso();
  }
  if (nome === 'sms' && escolha === 'contele') {
    return contele();
  }
  if (nome === 'email' && escolha === 'resend') {
    return resend();
  }
  return mock(nome);
}

export function canalPorProvedor(provedor: string): Channel | null {
  switch (provedor) {
    case 'kapso':
      return kapso();
    case 'contele':
      return contele();
    case 'resend':
      return resend();
    case 'mock-whatsapp':
      return mock('whatsapp');
    case 'mock-sms':
      return mock('sms');
    case 'mock-email':
      return mock('email');
    default:
      return null;
  }
}
