import { auth } from '@fila-viva/auth';
import { db, type Papel, unidade } from '@fila-viva/db';
import { Elysia, status } from 'elysia';
import { PROBLEMAS } from './erros.ts';

export interface Autor {
  creId: number | null;
  email: string;
  id: string;
  nome: string;
  papel: Papel;
  unidadeId: string | null;
}

/** Exigência de sessão de uma rota, do mais aberto para o mais restrito. */
export type Exigencia = boolean | 'cre' | 'secretaria';

/**
 * Macro de sessão. `sessao: true` exige usuário; `sessao: 'cre'` exige CRE ou
 * Secretaria; `sessao: 'secretaria'` exige a visão da rede inteira.
 * A checagem de unidade fica em `exigirUnidade` porque depende do recurso pedido.
 */
export const contexto = new Elysia({ name: 'contexto' })
  .macro({
    sessao: (exigencia: Exigencia) => ({
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
          papel?: Papel;
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

        const negado = negarPorPapel(autor, exigencia);
        if (negado) {
          return negado;
        }

        return { autor };
      },
    }),
  })
  .as('scoped');

function negarPorPapel(autor: Autor, exigencia: Exigencia) {
  if (exigencia === 'secretaria' && autor.papel !== 'secretaria') {
    return status(403, PROBLEMAS.semPermissao('ação restrita à Secretaria'));
  }
  if (exigencia === 'cre' && autor.papel !== 'cre' && autor.papel !== 'secretaria') {
    return status(403, PROBLEMAS.semPermissao('ação restrita à equipe da CRE'));
  }
  return null;
}

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

/**
 * De qual CRE é cada unidade. A tabela só muda quando a SME abre ou fecha creche,
 * então vale um mapa em memória — a alternativa é um SELECT por linha da ficha.
 */
let polos: Map<string, number | null> | null = null;

export async function carregarPolos(): Promise<Map<string, number | null>> {
  if (!polos) {
    const linhas = await db
      .select({ creId: unidade.creId, escCodigo: unidade.escCodigo })
      .from(unidade);
    polos = new Map(linhas.map((l) => [l.escCodigo, l.creId]));
  }
  return polos;
}

/** Só para os testes e para o seed, que trocam o conteúdo da tabela debaixo do processo. */
export function esquecerPolos() {
  polos = null;
}

/**
 * Secretaria enxerga a rede; a CRE, as unidades do próprio polo; o servidor da creche,
 * só a dele. Sem o polo carregado a CRE não passa — negar é o lado seguro do erro.
 */
export function podeVerUnidade(
  autor: Autor,
  unidadeId: string,
  polosCarregados: Map<string, number | null>
): boolean {
  if (autor.papel === 'secretaria') {
    return true;
  }
  if (autor.papel === 'cre') {
    const creDaUnidade = polosCarregados.get(unidadeId);
    return autor.creId !== null && creDaUnidade === autor.creId;
  }
  return autor.unidadeId === unidadeId;
}

export async function exigirUnidade(autor: Autor, unidadeId: string) {
  const carregados = await carregarPolos();
  if (!podeVerUnidade(autor, unidadeId, carregados)) {
    return status(403, PROBLEMAS.semPermissao('esta unidade está fora do seu acesso'));
  }
  return null;
}
