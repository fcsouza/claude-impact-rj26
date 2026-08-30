'use client';

import { useState } from 'react';

type Nome = 'semana' | 'mes' | 'processo' | 'custom';

/**
 * Seletor de período dos cartões. As datas só aparecem em "Personalizado" —
 * dois campos vazios ao lado de "Último mês" só confundem quem opera.
 */
export function PeriodoFiltro({
  ate,
  de,
  ocultos,
  periodo,
}: {
  ate: string;
  de: string;
  ocultos: React.ReactNode;
  periodo: Nome;
}) {
  const [escolha, setEscolha] = useState<Nome>(periodo);

  return (
    <form className="filtros" method="get" style={{ margin: 0 }}>
      {ocultos}
      <div className="campo">
        <label htmlFor="periodo">Período dos cartões</label>
        <select
          id="periodo"
          name="periodo"
          onChange={(e) => setEscolha(e.target.value as Nome)}
          value={escolha}
        >
          <option value="semana">Última semana</option>
          <option value="mes">Último mês</option>
          <option value="processo">Processo atual</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>

      {escolha === 'custom' ? (
        <>
          <div className="campo">
            <label htmlFor="de">De</label>
            <input defaultValue={de} id="de" name="de" required type="date" />
          </div>
          <div className="campo">
            <label htmlFor="ate">Até</label>
            <input defaultValue={ate} id="ate" name="ate" required type="date" />
          </div>
        </>
      ) : null}

      <button className="botao botao-secundario" type="submit">
        Aplicar
      </button>
    </form>
  );
}
