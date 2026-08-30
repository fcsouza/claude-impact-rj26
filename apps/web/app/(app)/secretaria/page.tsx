import Link from 'next/link';
import { Paginacao } from '@/components/paginacao';
import { api } from '@/lib/api';
import { numero, paginar, percentual } from '@/lib/formato';

interface Secretaria {
  bairros: {
    bairro: string | null;
    deficit: number | null;
    espera: number;
    matriculados: number;
    unidades: number;
    vagas: number | null;
  }[];
  canais: { canal: string; status: string; total: number }[];
  cres: {
    confirmadas: number;
    convocacoesConfirmadas: number;
    convocacoesEncerradas: number;
    creId: number;
    espera: number;
    expiradasSemResposta: number;
    horasMediasDaVaga: number | null;
    nome: string;
    paradas: number;
    selecionadas: number;
    taxaConfirmacao: number | null;
    unidades: number;
  }[];
  grupamentos: { grupamento: string; total: number }[];
  inconsistencias: { alunoAnon: string }[];
  tempo: { horas: number | null; vagas: number };
}

const ENTREGUES = new Set(['entregue', 'lido', 'respondido']);

export default async function PainelSecretaria({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; pb?: string }>;
}) {
  const filtros = await searchParams;
  const { dias } = filtros;
  const limite = dias ?? '2';
  const p = await api<Secretaria>(`/api/painel/secretaria?dias=${limite}`);

  const espera = p.cres.reduce((a, c) => a + c.espera, 0);
  const confirmadas = p.cres.reduce((a, c) => a + c.convocacoesConfirmadas, 0);
  const encerradas = p.cres.reduce((a, c) => a + c.convocacoesEncerradas, 0);
  const paradas = p.cres.reduce((a, c) => a + c.paradas, 0);
  const semResposta = p.cres.reduce((a, c) => a + c.expiradasSemResposta, 0);
  const temCapacidade = p.bairros.some((b) => b.vagas !== null);
  const bairros = paginar(p.bairros, filtros.pb, 15);
  const entregues = p.canais
    .filter((c) => ENTREGUES.has(c.status))
    .reduce((a, c) => a + c.total, 0);
  const tentativas = p.canais.reduce((a, c) => a + c.total, 0);

  const kpis = [
    { dica: 'crianças aguardando na rede', rotulo: 'Fila em espera', valor: numero(espera) },
    {
      dica: `${numero(encerradas)} convocações encerradas`,
      rotulo: 'Confirmação da rede',
      valor: encerradas ? percentual(confirmadas / encerradas) : '—',
    },
    {
      dica: `${numero(p.tempo.vagas)} vagas preenchidas`,
      rotulo: 'Tempo médio da vaga',
      valor: p.tempo.horas ? `${p.tempo.horas.toFixed(1)} h` : '—',
    },
    {
      dica: `acima de ${limite} dias sem resposta`,
      rotulo: 'Vagas paradas',
      valor: numero(paradas),
    },
    {
      dica: 'convocação expirada sem contato',
      rotulo: 'Cadastro morto',
      valor: numero(semResposta),
    },
    {
      dica: `${numero(tentativas)} tentativas em 30 dias`,
      rotulo: 'Entrega dos canais',
      valor: tentativas ? percentual(entregues / tentativas) : '—',
    },
  ];

  return (
    <>
      <div className="titulo-linha" style={{ marginBottom: 'var(--fv-space-4)' }}>
        <div>
          <div className="eyebrow">Secretaria Municipal de Educação</div>
          <h1>Visão da rede</h1>
          <p className="subtitulo">
            {p.cres.length} coordenadorias · {numero(p.cres.reduce((a, c) => a + c.unidades, 0))}{' '}
            unidades · processo 195/2025
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
          <h2>Coordenadorias regionais</h2>
          <span className="cod">ordenadas pela fila</span>
        </div>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>CRE</th>
                <th style={{ textAlign: 'right', width: 90 }}>Unidades</th>
                <th style={{ textAlign: 'right', width: 90 }}>Fila</th>
                <th style={{ textAlign: 'right', width: 100 }}>Convocados</th>
                <th style={{ textAlign: 'right', width: 110 }}>Confirmação</th>
                <th style={{ textAlign: 'right', width: 110 }}>Tempo da vaga</th>
                <th style={{ textAlign: 'right', width: 90 }}>Paradas</th>
                <th style={{ textAlign: 'right', width: 110 }}>Sem contato</th>
              </tr>
            </thead>
            <tbody>
              {p.cres.map((c) => (
                <tr className={c.paradas > 0 ? 'alerta' : undefined} key={c.creId}>
                  <td>
                    <div className="nome-linha">{c.nome}</div>
                  </td>
                  <td className="num">{numero(c.unidades)}</td>
                  <td className="num">{numero(c.espera)}</td>
                  <td className="num">{numero(c.selecionadas)}</td>
                  <td className="num">
                    {c.taxaConfirmacao === null ? '—' : percentual(c.taxaConfirmacao)}
                  </td>
                  <td className="num">
                    {c.horasMediasDaVaga ? `${c.horasMediasDaVaga.toFixed(1)} h` : '—'}
                  </td>
                  <td className="num">{numero(c.paradas)}</td>
                  <td className="num">{numero(c.expiradasSemResposta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Demanda por grupamento</h2>
          <span className="cod">
            {numero(new Set(p.inconsistencias.map((i) => i.alunoAnon)).size)} cadastros em conflito
            na rede
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Grupamento</th>
              <th style={{ textAlign: 'right', width: 140 }}>Na fila</th>
              <th style={{ textAlign: 'right', width: 140 }}>Da fila total</th>
            </tr>
          </thead>
          <tbody>
            {p.grupamentos.map((g) => (
              <tr key={g.grupamento}>
                <td>{g.grupamento}</td>
                <td className="num">{numero(g.total)}</td>
                <td className="num">{espera ? percentual(g.total / espera) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Déficit por bairro</h2>
          <span className="cod">
            {temCapacidade
              ? 'fila menos vaga livre · capacidade vem do datalake da cidade'
              : 'fila em espera por bairro'}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bairro</th>
              <th style={{ textAlign: 'right', width: 90 }}>Unidades</th>
              <th style={{ textAlign: 'right', width: 90 }}>Na fila</th>
              {temCapacidade ? (
                <>
                  <th style={{ textAlign: 'right', width: 110 }}>Capacidade</th>
                  <th style={{ textAlign: 'right', width: 110 }}>Matriculados</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Déficit</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {bairros.itens.map((b) => (
              <tr key={b.bairro ?? 'sem-bairro'}>
                <td>{b.bairro ?? '—'}</td>
                <td className="num">{numero(b.unidades)}</td>
                <td className="num">{numero(b.espera)}</td>
                {temCapacidade ? (
                  <>
                    <td className="num">{b.vagas === null ? '—' : numero(b.vagas)}</td>
                    <td className="num">{b.vagas === null ? '—' : numero(b.matriculados)}</td>
                    <td className="num">{b.deficit === null ? '—' : numero(b.deficit)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {temCapacidade ? null : (
          <p className="cod" style={{ marginTop: 'var(--fv-space-3)' }}>
            Capacidade, matriculados e déficit ficam de fora até a carga do datalake rodar.
          </p>
        )}
        <Paginacao
          base="/secretaria"
          filtros={filtros}
          pagina={bairros.pagina}
          param="pb"
          porPagina={bairros.porPagina}
          total={bairros.total}
        />
      </div>

      <p className="subtitulo">
        Para cobrar uma coordenadoria, abra o <Link href="/painel">painel de gargalos</Link>.
      </p>
    </>
  );
}
