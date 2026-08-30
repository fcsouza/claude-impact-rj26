import { auth } from '@fila-viva/auth';
import { Elysia, status } from 'elysia';
import { PROBLEMAS } from './erros.ts';

export interface Autor {
  creId: number | null;
  email: string;
  id: string;
  nome: string;
  papel: 'unidade' | 'cre';
  unidadeId: string | null;
}

/**
 * Macro de sessão. `sessao: true` exige usuário; `sessao: 'cre'` exige o papel CRE.
 * A checagem de unidade fica em `podeVerUnidade` porque depende do recurso pedido.
 */
export const contexto = new Elysia({ name: 'contexto' })
  .macro({
    sessao: (exigencia: boolean | 'cre') => ({
      async resolve({ request }) {
        if (!exigencia) {
          return { autor: null as Autor | null };
        }

        const s = await auth.api.getSession({ headers: request.headers });
        if (!s?.user) {
          return status(401, PROBLEMAS.semSessao());
        }

        const usuario = s.user as unknown as {
          id: string;
          name: string;
          email: string;
          papel?: 'unidade' | 'cre';
          unidadeId?: string | null;
          creId?: number | null;
        };

        const autor: Autor = {
          creId: usuario.creId ?? null,
          email: usuario.email,
          id: usuario.id,
          nome: usuario.name,
          papel: usuario.papel ?? 'unidade',
          unidadeId: usuario.unidadeId ?? null,
        };

        if (exigencia === 'cre' && autor.papel !== 'cre') {
          return status(403, PROBLEMAS.semPermissao('ação restrita à equipe da CRE'));
        }

        return { autor };
      },
    }),
  })
  .as('scoped');

/**
 * O macro `sessao` já devolve 401 quando não há usuário; este ajudante só estreita o tipo
 * para o corpo da rota, sem espalhar `!` por toda parte.
 */
export function exigirAutor(autor: Autor | null | undefined): Autor {
  if (!autor) {
    throw new Error('rota protegida executada sem autor na sessão');
  }
  return autor;
}

/** Servidor de unidade só enxerga a própria unidade; a CRE enxerga o polo inteiro. */
export function podeVerUnidade(autor: Autor, unidadeId: string): boolean {
  return autor.papel === 'cre' || autor.unidadeId === unidadeId;
}

export function exigirUnidade(autor: Autor, unidadeId: string) {
  if (!podeVerUnidade(autor, unidadeId)) {
    return status(403, PROBLEMAS.semPermissao('esta unidade está fora do seu acesso'));
  }
  return null;
}
