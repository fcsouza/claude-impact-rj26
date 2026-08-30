'use client';

import { useState } from 'react';

/**
 * Em tela estreita a barra lateral vira faixa no topo e a navegação recolhe
 * atrás de um botão; no desktop o conteúdo está sempre aberto e o botão some
 * pelo CSS. O estado vive aqui porque `details` fechado é escondido pelo
 * navegador de um jeito que a folha de estilo não consegue reverter.
 */
export function MenuLateral({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="menu-lateral">
      <button
        aria-expanded={aberto}
        className="menu-abrir"
        onClick={() => setAberto(!aberto)}
        type="button"
      >
        <span>Menu</span>
        <span className="menu-seta" data-aberto={aberto} />
      </button>

      <div className="menu-conteudo" data-aberto={aberto}>
        {children}
      </div>
    </div>
  );
}
