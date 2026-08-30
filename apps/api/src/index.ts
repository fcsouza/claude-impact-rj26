import { cors } from '@elysiajs/cors';
import { auth } from '@fila-viva/auth';
import { Elysia } from 'elysia';
import { PROBLEMAS } from './erros.ts';
import { convocacaoRotas } from './modulos/convocacao.ts';
import { fichaRotas } from './modulos/ficha.ts';
import { filaRotas } from './modulos/fila.ts';
import { inboundRotas } from './modulos/inbound.ts';
import { painelRotas } from './modulos/painel.ts';
import { webhookRotas } from './modulos/webhooks.ts';

const porta = Number(process.env.API_PORT ?? 3333);

export const app = new Elysia()
  .use(
    cors({
      credentials: true,
      origin: [process.env.WEB_URL ?? 'http://localhost:3000'],
    })
  )
  .onError(({ code, error, set, path }) => {
    set.headers['content-type'] = 'application/problem+json';

    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        ...PROBLEMAS.invalido('o corpo ou a query não passou na validação', String(error)),
        instance: path,
      };
    }
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { ...PROBLEMAS.naoEncontrado('rota inexistente'), instance: path };
    }

    set.status = 500;
    process.stderr.write(`[api] ${String(error)}\n`);
    return { ...PROBLEMAS.interno((error as Error).message), instance: path };
  })
  // Better Auth responde em /api/auth/* — o Next repassa por rewrite.
  .mount(auth.handler)
  // Resposta de erro de rota também sai como problem+json (RFC 7807).
  .onAfterHandle(({ response, set }) => {
    const corpo = response as { type?: string; status?: number } | null;
    if (
      corpo &&
      typeof corpo === 'object' &&
      typeof corpo.type === 'string' &&
      corpo.type.startsWith('https://fila-viva.rio/problemas/')
    ) {
      set.headers['content-type'] = 'application/problem+json';
    }
  })
  .get('/saude', () => ({ agora: new Date().toISOString(), ok: true, servico: 'fila-viva-api' }))
  .use(filaRotas)
  .use(fichaRotas)
  .use(convocacaoRotas)
  .use(inboundRotas)
  .use(painelRotas)
  .use(webhookRotas)
  .listen(porta);

process.stdout.write(`api ouvindo em http://localhost:${porta}\n`);

export type App = typeof app;
