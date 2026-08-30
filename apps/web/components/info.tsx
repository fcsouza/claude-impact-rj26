/** Ícone de informação: o texto aparece no hover e no foco por teclado. */
export function Info({ texto }: { texto: string }) {
  return (
    <button aria-label={texto} className="info" data-texto={texto} type="button">
      i
    </button>
  );
}
