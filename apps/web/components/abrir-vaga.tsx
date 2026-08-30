'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { abrirVaga } from '@/app/(app)/acoes';

export function AbrirVaga({
  unidadeId,
  grupamentos,
}: {
  unidadeId: string;
  grupamentos: string[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [turno, setTurno] = useState('Integral');
  const [grupamento, setGrupamento] = useState(grupamentos[0] ?? 'Berçário');
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const abrir = () => setAberto(true);
  const fechar = () => setAberto(false);
  const mudarTurno = (e: React.ChangeEvent<HTMLSelectElement>) => setTurno(e.target.value);
  const mudarGrupamento = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setGrupamento(e.target.value);

  function convocar() {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await abrirVaga({ grupamento, turno, unidadeId });
        setAviso(
          `${resultado.candidato.nome} foi convocada. Prazo de 3 dias úteis, tentativa D0 por WhatsApp.`
        );
        router.refresh();
      } catch (falha) {
        setErro(
          falha instanceof Error && falha.message.includes('nenhuma criança')
            ? 'Não há criança elegível nesse turno e grupamento.'
            : 'Não foi possível abrir a vaga agora.'
        );
      }
    });
  }

  if (!aberto) {
    return (
      <button className="botao" onClick={abrir} type="button">
        Abrir vaga
      </button>
    );
  }

  return (
    <div className="cartao" style={{ minWidth: 340 }}>
      <div className="cartao-titulo">
        <h2>Abrir vaga</h2>
        <button
          className="botao botao-secundario"
          onClick={fechar}
          style={{ padding: '4px 10px' }}
          type="button"
        >
          fechar
        </button>
      </div>

      <p className="subtitulo" style={{ marginTop: 0 }}>
        A próxima criança elegível da fila é convocada automaticamente. Prazo de 3 dias úteis e
        primeira tentativa por WhatsApp.
      </p>

      <div className="linha-campos">
        <div className="campo">
          <label htmlFor="turno-vaga">Turno</label>
          <select id="turno-vaga" onChange={mudarTurno} value={turno}>
            <option value="Integral">Integral</option>
            <option value="Parcial">Parcial</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="grupamento-vaga">Grupamento</label>
          <select id="grupamento-vaga" onChange={mudarGrupamento} value={grupamento}>
            {grupamentos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aviso ? (
        <p className="aviso" style={{ marginTop: 'var(--fv-space-3)' }}>
          {aviso}
        </p>
      ) : null}
      {erro ? (
        <p className="erro" style={{ marginTop: 'var(--fv-space-3)' }}>
          {erro}
        </p>
      ) : null}

      <button
        className="botao"
        disabled={pendente}
        onClick={convocar}
        style={{ marginTop: 'var(--fv-space-3)' }}
        type="button"
      >
        {pendente ? 'Convocando…' : 'Convocar e registrar'}
      </button>
    </div>
  );
}
