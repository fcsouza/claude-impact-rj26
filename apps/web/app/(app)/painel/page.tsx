import Link from 'next/link';
import { api } from '@/lib/api';
import { data, numero, percentual, prazo } from '@/lib/formato';

interface Painel {
  bairros: {
    bairro: string | null;
    unidades: number;
    espera: number;
    confirmadas: number;
    selecionadas: number;
  }[];
  canais: { canal: string; status: string; total: number }[];
  expiradas: { unidadeId: string; unidade: string; total: number }[];
  inconsistencias: {
    alunoAnon: string;
    nome: string;
    inscricaoId: string;
    situacao: string;
    unidade: string;
    turno: string;
    grupamento: string;
  }[];
  paradas: {
    convocacaoId: string;
    inscricaoId: string;
    nome: string;
    unidade: string;
    turno: string;
    grupamento: string;
    iniciadaEm: string;
    prazoFim: string;
    tentativas: number;
    respostas: number;
  }[];
  prazos: {
    convocacaoId: string;
    inscricaoId: string;
    nome: string;
    unidade: string;
    unidadeId: string;
    grupamento: string;
    turno: string;
    prazoFim: string;
    vencido: boolean;
  }[];
  semMovimento: {
    unidadeId: string;
    unidade: string;
    bairro: string | null;
    espera: number;
    ultimaVaga: string | null;
  }[];
  unidades: {
    unidadeId: string;
    unidade: string;
    bairro: string | null;
    total: number;
    espera: number;
    selecionadas: number;
    confirmadas: number;
    taxaConfirmacao: number;
    horasMediasAteEncerrar: number | null;
    tentativasMedias: number | null;
  }[];
}

export default async function PainelCre({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { dias } = await searchParams;
  const limite = dias ?? '2';
  const p = await api<Painel>(`/api/painel?dias=${limite}`);

  const entregues = p.canais
    .filter((c) => c.status === 'entregue' || c.status === 'lido' || c.status === 'respondido')
    .reduce((a, c) => a + c.total, 0);
  const totalTentativas = p.canais.reduce((a, c) => a + c.total, 0);

  const kpis = [
    {
      dica: `acima de ${limite} dias sem resposta`,
      rotulo: 'Vagas paradas',
      valor: numero(p.paradas.length),
    },
    {
      dica: 'cadastros em conflito',
      rotulo: 'Inconsistências',
      valor: numero(new Set(p.inconsistencias.map((i) => i.alunoAnon)).size),
    },
    {
      dica: `${numero(totalTentativas)} tentativas em 30 dias`,
      rotulo: 'Entrega dos canais',
      valor: totalTentativas ? percentual(entregues / totalTentativas) : '—',
    },
    {
      dica: 'vencidos ou vencendo hoje',
      rotulo: 'Prazos no limite',
      valor: numero(p.prazos.length),
    },
    { dica: 'processo 195/2025', rotulo: 'Unidades no polo', valor: numero(p.unidades.length) },
  ];

  return (
    <>
      <div className="titulo-linha" style={{ marginBottom: 'var(--fv-space-4)' }}>
        <div>
          <div className="eyebrow">Coordenadoria Regional de Educação</div>
          <h1>Painel de gargalos</h1>
          <p className="subtitulo">
            {p.unidades.length} unidades · processo 195/2025 · alerta acima de {limite} dias sem
            resposta
          </p>
        </div>
        <form className="filtros" method="get" style={{ margin: 0 }}>
          <div className="campo">
            <label htmlFor="dias">Dias sem resposta</label>
            <input defaultValue={limite} id="dias" name="dias" style={{ width: 80 }} type="text" />
          </div>
          <button className="botao botao-secundario" type="submit">
            Aplicar
          </button>
        </form>
      </div>

      <div className="kpis" style={{ marginBottom: 'var(--fv-space-4)' }}>
        {kpis.map((k) => (
          <div className="kpi" key={k.rotulo}>
            <div className="rotulo">{k.rotulo}</div>
            <div className="valor">{k.valor}</div>
            <div className="dica">{k.dica}</div>
          </div>
        ))}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Vagas paradas · convocado sem resposta</h2>
          <span className="cod">{p.paradas.length} casos</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Criança</th>
              <th>Unidade</th>
              <th style={{ width: 150 }}>Parada desde</th>
              <th style={{ width: 120 }}>Prazo</th>
              <th style={{ textAlign: 'right', width: 110 }}>Tentativas</th>
              <th style={{ width: 90 }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {p.paradas.map((linha) => {
              const prz = prazo(linha.prazoFim);
              return (
                <tr className="alerta" key={linha.convocacaoId}>
                  <td>
                    <div className="nome-linha">{linha.nome}</div>
                    <div className="cod">
                      {linha.grupamento} · {linha.turno}
                    </div>
                  </td>
                  <td>{linha.unidade}</td>
                  <td className="mono">{data(linha.iniciadaEm)}</td>
                  <td className={prz.classe}>{prz.texto}</td>
                  <td className="num">
                    {linha.tentativas}
                    <div className="cod" style={{ textAlign: 'right' }}>
                      {linha.respostas} resposta(s)
                    </div>
                  </td>
                  <td>
                    <Link href={`/ficha/${linha.inscricaoId}`}>Ver ficha</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {p.paradas.length === 0 ? (
          <p className="vazio">Nenhuma vaga parada acima de {limite} dias.</p>
        ) : null}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Inconsistências de cadastro</h2>
          <span className="cod">selecionado e lista de espera no mesmo cadastro</span>
        </div>
        {p.inconsistencias.length === 0 ? (
          <p className="vazio">Nenhuma inconsistência pendente.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Criança</th>
                <th>Onde</th>
                <th style={{ width: 130 }}>Situação</th>
                <th style={{ width: 90 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {p.inconsistencias.map((i) => (
                <tr key={`${i.alunoAnon}-${i.unidade}-${i.situacao}`}>
                  <td>
                    <div className="nome-linha">{i.nome}</div>
                    <div className="cod">{i.alunoAnon}</div>
                  </td>
                  <td>
                    {i.unidade}
                    <div className="cod">
                      {i.grupamento} · {i.turno}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-aviso">{i.situacao}</span>
                  </td>
                  <td>
                    <Link href={`/ficha/${i.inscricaoId}`}>Ver ficha</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Prazos vencidos e vencendo hoje</h2>
          <span className="cod">{p.prazos.length} convocações</span>
        </div>
        {p.prazos.length === 0 ? (
          <p className="vazio">Nenhum prazo no limite hoje.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Criança</th>
                <th>Unidade</th>
                <th style={{ width: 130 }}>Prazo</th>
                <th style={{ width: 90 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {p.prazos.map((linha) => {
                const prz = prazo(linha.prazoFim);
                return (
                  <tr className={linha.vencido ? 'alerta' : undefined} key={linha.convocacaoId}>
                    <td>
                      <div className="nome-linha">{linha.nome}</div>
                      <div className="cod">
                        {linha.grupamento} · {linha.turno}
                      </div>
                    </td>
                    <td>{linha.unidade}</td>
                    <td className={prz.classe}>{prz.texto}</td>
                    <td>
                      <Link href={`/ficha/${linha.inscricaoId}`}>Ver ficha</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Unidades sem movimento</h2>
          <span className="cod">fila cheia e nenhuma vaga aberta em 14 dias</span>
        </div>
        {p.semMovimento.length === 0 ? (
          <p className="vazio">Todas as unidades com fila movimentaram vaga no período.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Unidade</th>
                <th style={{ textAlign: 'right', width: 100 }}>Na fila</th>
                <th style={{ width: 160 }}>Última vaga</th>
                <th style={{ width: 90 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {p.semMovimento.map((u) => (
                <tr className="alerta" key={u.unidadeId}>
                  <td>
                    <div className="nome-linha">{u.unidade}</div>
                    <div className="cod">{u.bairro ?? ''}</div>
                  </td>
                  <td className="num">{numero(u.espera)}</td>
                  <td className="mono">{u.ultimaVaga ? data(u.ultimaVaga) : 'nunca'}</td>
                  <td>
                    <Link href={`/unidade/${u.unidadeId}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Convocação expirada sem resposta</h2>
          <span className="cod">contato da família não alcançou ninguém</span>
        </div>
        {p.expiradas.length === 0 ? (
          <p className="vazio">Nenhuma convocação expirou sem resposta.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Unidade</th>
                <th style={{ textAlign: 'right', width: 120 }}>Casos</th>
                <th style={{ width: 90 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {p.expiradas.map((e) => (
                <tr key={e.unidadeId}>
                  <td>{e.unidade}</td>
                  <td className="num">{numero(e.total)}</td>
                  <td>
                    <Link href={`/unidade/${e.unidadeId}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Desempenho por unidade</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Unidade</th>
                <th style={{ textAlign: 'right', width: 80 }}>Fila</th>
                <th style={{ textAlign: 'right', width: 90 }}>Convocados</th>
                <th style={{ textAlign: 'right', width: 110 }}>Confirmação</th>
                <th style={{ textAlign: 'right', width: 120 }}>Tempo médio</th>
                <th style={{ textAlign: 'right', width: 120 }}>Tentativas/resp.</th>
              </tr>
            </thead>
            <tbody>
              {p.unidades.slice(0, 25).map((u) => (
                <tr key={u.unidadeId}>
                  <td>
                    <Link className="nome-linha" href={`/unidade/${u.unidadeId}`}>
                      {u.unidade}
                    </Link>
                    <div className="cod">{u.bairro ?? ''}</div>
                  </td>
                  <td className="num">{numero(u.espera)}</td>
                  <td className="num">{numero(u.selecionadas)}</td>
                  <td className="num">{percentual(u.taxaConfirmacao)}</td>
                  <td className="num">
                    {u.horasMediasAteEncerrar ? `${u.horasMediasAteEncerrar.toFixed(1)} h` : '—'}
                  </td>
                  <td className="num">
                    {u.tentativasMedias ? u.tentativasMedias.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Fila e ocupação por bairro</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bairro</th>
              <th style={{ textAlign: 'right', width: 100 }}>Unidades</th>
              <th style={{ textAlign: 'right', width: 100 }}>Na fila</th>
              <th style={{ textAlign: 'right', width: 110 }}>Convocados</th>
              <th style={{ textAlign: 'right', width: 110 }}>Confirmados</th>
            </tr>
          </thead>
          <tbody>
            {p.bairros.slice(0, 15).map((b) => (
              <tr key={b.bairro ?? 'sem-bairro'}>
                <td>{b.bairro ?? '—'}</td>
                <td className="num">{numero(b.unidades)}</td>
                <td className="num">{numero(b.espera ?? 0)}</td>
                <td className="num">{numero(b.selecionadas ?? 0)}</td>
                <td className="num">{numero(b.confirmadas ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
