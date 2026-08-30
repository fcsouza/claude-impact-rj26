import { api } from '@/lib/api';
import { dataHora, rotuloAcao, rotuloEntidade, valorAuditoria } from '@/lib/formato';

interface Evento {
  acao: string;
  antesJson: Record<string, unknown> | null;
  criadoEm: string;
  depoisJson: Record<string, unknown> | null;
  entidade: string;
  entidadeId: string;
  id: string;
  motivo: string | null;
}

const resumoDiff = (
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null
) => {
  if (!(antes || depois)) {
    return '—';
  }
  const chaves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])];
  return chaves
    .map((c) => `${c}: ${valorAuditoria(antes?.[c])} → ${valorAuditoria(depois?.[c])}`)
    .join(' · ');
};

export default async function Auditoria() {
  const eventos = await api<Evento[]>('/api/painel/auditoria?limite=150');

  return (
    <>
      <div className="eyebrow">evento_auditoria</div>
      <h1>Auditoria</h1>
      <p className="subtitulo" style={{ marginBottom: 'var(--fv-space-4)' }}>
        Toda mutação registrada, com antes, depois, autor e horário.
      </p>

      <div className="cartao">
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Quando</th>
                <th style={{ width: 120 }}>Entidade</th>
                <th style={{ width: 180 }}>Ação</th>
                <th>Mudança</th>
                <th style={{ width: 220 }}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{dataHora(e.criadoEm)}</td>
                  <td>
                    {rotuloEntidade(e.entidade)}
                    <div className="cod">{e.entidadeId}</div>
                  </td>
                  <td>
                    <div className="nome-linha">{rotuloAcao(e.acao)}</div>
                    <div className="cod">{e.acao}</div>
                  </td>
                  <td>{resumoDiff(e.antesJson, e.depoisJson)}</td>
                  <td>{e.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eventos.length === 0 ? (
          <p className="vazio">Nenhuma mutação registrada. Abra uma vaga ou edite um contato.</p>
        ) : null}
      </div>
    </>
  );
}
