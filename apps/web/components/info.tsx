'use client';

import { useRef, useState } from 'react';

const LARGURA = 280;
const MARGEM = 8;
/** Perto do topo da janela o balão não cabe acima do ícone e vira para baixo. */
const ALTURA_MINIMA_ACIMA = 90;

/**
 * Ícone de informação. O balão é posicionado em relação à janela, não ao pai:
 * assim ele não é cortado por tabela com rolagem nem estica a página.
 */
export function Info({ texto }: { texto: string }) {
  const alvo = useRef<HTMLButtonElement>(null);
  const [balao, setBalao] = useState<{ abaixo: boolean; left: number; top: number } | null>(null);

  const abrir = () => {
    const area = alvo.current?.getBoundingClientRect();
    if (!area) {
      return;
    }
    const centro = area.left + area.width / 2 - LARGURA / 2;
    setBalao({
      abaixo: area.top < ALTURA_MINIMA_ACIMA,
      left: Math.min(Math.max(MARGEM, centro), window.innerWidth - LARGURA - MARGEM),
      top: area.top,
    });
  };

  const fechar = () => setBalao(null);

  return (
    <>
      <button
        aria-label={texto}
        className="info"
        onBlur={fechar}
        onFocus={abrir}
        onMouseEnter={abrir}
        onMouseLeave={fechar}
        ref={alvo}
        type="button"
      >
        i
      </button>
      {balao ? (
        <span
          className="info-balao"
          data-abaixo={balao.abaixo}
          role="tooltip"
          style={{ left: balao.left, top: balao.top }}
        >
          {texto}
        </span>
      ) : null}
    </>
  );
}
