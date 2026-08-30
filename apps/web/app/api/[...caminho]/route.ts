import type { NextRequest } from 'next/server';

/**
 * Repassa /api/* para o Elysia.
 *
 * Isso era um rewrite no next.config, mas o Next resolve rewrite no build e a
 * imagem saía com o endereço de desenvolvimento congelado. Aqui a variável é
 * lida a cada requisição, então a mesma imagem serve local e staging.
 */
const destino = () => process.env.API_URL ?? 'http://localhost:3333';

const CABECALHOS_IGNORADOS = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

async function repassar(pedido: NextRequest, caminho: string[]) {
  const url = new URL(`${destino()}/api/${caminho.join('/')}`);
  url.search = pedido.nextUrl.search;

  const cabecalhos = new Headers();
  pedido.headers.forEach((valor, chave) => {
    if (!CABECALHOS_IGNORADOS.has(chave.toLowerCase())) {
      cabecalhos.set(chave, valor);
    }
  });

  const temCorpo = pedido.method !== 'GET' && pedido.method !== 'HEAD';

  const resposta = await fetch(url, {
    body: temCorpo ? await pedido.arrayBuffer() : undefined,
    headers: cabecalhos,
    method: pedido.method,
    redirect: 'manual',
  });

  const saida = new Headers(resposta.headers);
  saida.delete('content-encoding');
  saida.delete('content-length');

  return new Response(resposta.body, { headers: saida, status: resposta.status });
}

type Contexto = { params: Promise<{ caminho: string[] }> };

const handler = async (pedido: NextRequest, contexto: Contexto) => {
  const { caminho } = await contexto.params;
  return await repassar(pedido, caminho);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;

export const dynamic = 'force-dynamic';
