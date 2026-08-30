import { api } from '@/lib/api';
import { numero } from '@/lib/formato';

interface Criterio {
  desempate: boolean;
  ichPergId: number;
  id: string;
  ordem: number;
  pergId: number;
  pontos: number;
  texto: string;
}

export default async function Regua() {
  const criterios = await api<Criterio[]>('/api/fila/regua/2025');

  return (
    <>
      <div className="eyebrow">Query C · processo 195/2025</div>
      <h1>Régua de pontuação</h1>
      <p className="subtitulo" style={{ marginBottom: 'var(--fv-space-4)' }}>
        Somente leitura. A régua muda a cada processo e é carregada do ano vigente — a de 2024
        redesenhou o questionário e reescalonou os pesos.
      </p>

      <div className="cartao">
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Pergunta</th>
              <th style={{ textAlign: 'right', width: 120 }}>Peso</th>
            </tr>
          </thead>
          <tbody>
            {criterios.map((c) => (
              <tr key={c.id}>
                <td className="num">{c.ordem}</td>
                <td>{c.texto}</td>
                <td className="num">
                  {c.desempate ? (
                    <span className="badge badge-neutro">desempate</span>
                  ) : (
                    numero(c.pontos)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {criterios.length === 0 ? <p className="vazio">Régua não carregada. Rode o seed.</p> : null}
      </div>
    </>
  );
}
