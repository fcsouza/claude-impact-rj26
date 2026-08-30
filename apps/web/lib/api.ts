import { cookies } from 'next/headers';

const BASE = process.env.API_URL ?? 'http://localhost:3333';

/** Chama a API repassando o cookie de sessão do servidor para o Elysia. */
export async function api<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const jar = await cookies();
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new ErroApi(resposta.status, corpo || resposta.statusText);
  }

  return (await resposta.json()) as T;
}

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export async function sessaoAtual() {
  try {
    return await api<{
      user: {
        id: string;
        name: string;
        email: string;
        papel?: string;
        unidadeId?: string;
        creId?: number;
      };
    } | null>('/api/auth/get-session');
  } catch {
    return null;
  }
}
