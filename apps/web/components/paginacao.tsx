import Link from 'next/link';

/**
 * Paginação por URL: a tela é servida no servidor e os filtros já viajam na
 * query, então página é só mais um parâmetro. Sempre diz o total — lista cortada
 * em silêncio faz o servidor achar que a fila acabou.
 */
export function Paginacao({
  base,
  filtros,
  pagina,
  param = 'pagina',
  porPagina,
  total,
}: {
  base: string;
  filtros: Record<string, string | undefined>;
  pagina: number;
  /** Nome do parâmetro na URL — telas com mais de uma tabela usam um por tabela. */
  param?: string;
  porPagina: number;
  total: number;
}) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const primeiro = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);

  const href = (destino: number) => {
    const consulta = new URLSearchParams();
    for (const [chave, valor] of Object.entries(filtros)) {
      if (valor && chave !== param) {
        consulta.set(chave, valor);
      }
    }
    if (destino > 1) {
      consulta.set(param, String(destino));
    }
    const texto = consulta.toString();
    return texto ? `${base}?${texto}` : base;
  };

  return (
    <div className="paginacao">
      <span className="cod">
        {primeiro}–{ultimo} de {total}
      </span>
      {ultima > 1 ? (
        <span className="paginacao-botoes">
          {pagina > 1 ? (
            <Link className="botao botao-secundario" href={href(pagina - 1)} rel="prev">
              Anterior
            </Link>
          ) : (
            <span className="botao botao-secundario desligado">Anterior</span>
          )}
          <span className="cod">
            página {pagina} de {ultima}
          </span>
          {pagina < ultima ? (
            <Link className="botao botao-secundario" href={href(pagina + 1)} rel="next">
              Próxima
            </Link>
          ) : (
            <span className="botao botao-secundario desligado">Próxima</span>
          )}
        </span>
      ) : null}
    </div>
  );
}
