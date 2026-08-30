/**
 * Problem Details (RFC 7807). Todo erro da API sai neste formato,
 * com `application/problem+json`.
 */
export interface Problema {
  detail?: string;
  erros?: unknown;
  instance?: string;
  status: number;
  title: string;
  type: string;
}

const BASE = 'https://fila-viva.rio/problemas';

export function problema(args: {
  tipo: string;
  titulo: string;
  status: number;
  detalhe?: string;
  instancia?: string;
  erros?: unknown;
}): Problema {
  return {
    detail: args.detalhe,
    erros: args.erros,
    instance: args.instancia,
    status: args.status,
    title: args.titulo,
    type: `${BASE}/${args.tipo}`,
  };
}

export const PROBLEMAS = {
  conflito: (detalhe: string) =>
    problema({ detalhe, status: 409, tipo: 'conflito', titulo: 'Operação não permitida agora' }),
  interno: (detalhe: string) =>
    problema({ detalhe, status: 500, tipo: 'falha-interna', titulo: 'Falha interna' }),
  invalido: (detalhe: string, erros?: unknown) =>
    problema({ detalhe, erros, status: 400, tipo: 'dados-invalidos', titulo: 'Dados inválidos' }),
  naoEncontrado: (detalhe: string) =>
    problema({ detalhe, status: 404, tipo: 'nao-encontrado', titulo: 'Recurso não encontrado' }),
  semPermissao: (detalhe: string) =>
    problema({ detalhe, status: 403, tipo: 'sem-permissao', titulo: 'Acesso negado' }),
  semSessao: () =>
    problema({ status: 401, tipo: 'sem-sessao', titulo: 'Sessão ausente ou expirada' }),
} as const;
