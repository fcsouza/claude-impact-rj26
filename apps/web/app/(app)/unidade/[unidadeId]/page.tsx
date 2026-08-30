import Link from 'next/link';
import { Info } from '@/components/info';
import { Paginacao } from '@/components/paginacao';
import { api } from '@/lib/api';
import {
  DICAS,
  data,
  dataHora,
  numero,
  paginar,
  percentual,
  prazo,
  rotuloClassificacao,
} from '@/lib/formato';

interface VisaoUnidade {
  capacidades: {
    grupamento: string;
    id: string;
    matriculados: number;
    ocupacao: number | null;
    turno: string;
    vagas: number;
  }[];
  contatosVelhos: {
    grupamento: string;
    inscricaoId: string;
    meses: number | null;
    nome: string;
    turno: string;
  }[];
  convocacoes: {
    convocacaoId: string;
    diaDaRegua: number;
    extensoes: number;
    grupamento: string;
    inscricaoId: string;
    nome: string;
    prazoFim: string;
    respostas: number;
    tentativas: number;
    turno: string;
    vencido: boolean;
  }[];
  pendentes: {
    classificacao: string | null;
    id: string;
    inscricaoId: string;
    nome: string;
    recebidaEm: string;
    texto: string;
    trechoChave: string | null;
  }[];
  unidade: { bairro: string | null; escCodigo: string; nome: string } | null;
  vagasAbertas: { abertaEm: string; grupamento: string; id: string; turno: string }[];
}

export default async function PainelUnidade({
  params,
  searchParams,
}: {
  params: Promise<{ unidadeId: string }>;
  searchParams: Promise<{ pc?: string }>;
}) {
  const { unidadeId } = await params;
  const filtros = await searchParams;
  const p = await api<VisaoUnidade>(`/api/painel/unidade/${unidadeId}`);
  const contatos = paginar(p.contatosVelhos, filtros.pc, 15);

  const vencendo = p.convocacoes.filter(
    (c) => c.vencido || new Date(c.prazoFim).toDateString() === new Date().toDateString()
  );

  const kpis = [
    { dica: 'esperando criança', rotulo: 'Vagas abertas', valor: numero(p.vagasAbertas.length) },
    {
      dica: 'com prazo correndo',
      rotulo: 'Convocações',
      valor: numero(p.convocacoes.length),
    },
    {
      dica: 'vencidos ou vencendo hoje',
      rotulo: 'Prazos no limite',
      valor: numero(vencendo.length),
    },
    {
      dica: 'aguardando sua decisão',
      rotulo: 'Respostas',
      valor: numero(p.pendentes.length),
    },
  ];

  return (
    <>
      <div className="titulo-linha" style={{ marginBottom: 'var(--fv-space-4)' }}>
        <div>
          <div className="eyebrow">{p.unidade?.bairro ?? 'Unidade escolar'}</div>
          <h1>{p.unidade?.nome ?? unidadeId}</h1>
          <p className="subtitulo">
            O dia da unidade · <Link href={`/fila/${unidadeId}`}>ver a fila completa</Link>
          </p>
        </div>
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
          <h2>Convocações em andamento</h2>
          <span className="cod">dia da régua, tentativas e prazo</span>
        </div>
        {p.convocacoes.length === 0 ? (
          <p className="vazio">Nenhuma convocação aberta.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Criança</th>
                <th style={{ width: 110 }}>
                  Dia
                  <Info texto={DICAS.diaDaRegua} />
                </th>
                <th style={{ width: 130 }}>Prazo</th>
                <th style={{ textAlign: 'right', width: 120 }}>Tentativas</th>
                <th style={{ width: 90 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {p.convocacoes.map((c) => {
                const prz = prazo(c.prazoFim);
                return (
                  <tr className={c.vencido ? 'alerta' : undefined} key={c.convocacaoId}>
                    <td>
                      <div className="nome-linha">{c.nome}</div>
                      <div className="cod">
                        {c.grupamento} · {c.turno}
                      </div>
                    </td>
                    <td className="mono">D{c.diaDaRegua}</td>
                    <td className={prz.classe}>{prz.texto}</td>
                    <td className="num">
                      {c.tentativas}
                      <div className="cod" style={{ textAlign: 'right' }}>
                        {c.respostas === 1 ? '1 resposta' : `${c.respostas} respostas`}
                      </div>
                    </td>
                    <td>
                      <Link href={`/ficha/${c.inscricaoId}`}>Abrir ficha</Link>
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
          <h2>Respostas aguardando decisão</h2>
          <span className="cod">a leitura é da IA; quem aplica é você</span>
        </div>
        {p.pendentes.length === 0 ? (
          <p className="vazio">Nenhuma resposta pendente.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Criança</th>
                <th>O que a família disse</th>
                <th style={{ width: 120 }}>Leitura</th>
                <th style={{ width: 140 }}>Recebida</th>
                <th style={{ width: 90 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {p.pendentes.map((m) => (
                <tr key={m.id}>
                  <td className="nome-linha">{m.nome}</td>
                  <td>{m.trechoChave ?? m.texto.slice(0, 90)}</td>
                  <td>
                    {m.classificacao ? (
                      <span className="termo">
                        <span className="badge badge-ia">
                          {rotuloClassificacao(m.classificacao)}
                        </span>
                        <Info texto={DICAS.leituraIa} />
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="mono">{dataHora(m.recebidaEm)}</td>
                  <td>
                    <Link href={`/ficha/${m.inscricaoId}`}>Abrir ficha</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Vagas abertas sem criança selecionada</h2>
        </div>
        {p.vagasAbertas.length === 0 ? (
          <p className="vazio">Nenhuma vaga aberta no momento.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Grupamento</th>
                <th style={{ width: 120 }}>Turno</th>
                <th style={{ width: 160 }}>Aberta em</th>
              </tr>
            </thead>
            <tbody>
              {p.vagasAbertas.map((v) => (
                <tr key={v.id}>
                  <td>{v.grupamento}</td>
                  <td>{v.turno}</td>
                  <td className="mono">{data(v.abertaEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Contato velho na frente da fila</h2>
          <span className="cod">corrigir antes de convocar</span>
        </div>
        {p.contatosVelhos.length === 0 ? (
          <p className="vazio">Nenhum contato desatualizado entre os próximos da fila.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Criança</th>
                <th style={{ width: 160 }}>Último contato</th>
                <th style={{ width: 140 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {contatos.itens.map((c) => (
                <tr key={c.inscricaoId}>
                  <td>
                    <div className="nome-linha">{c.nome}</div>
                    <div className="cod">
                      {c.grupamento} · {c.turno}
                    </div>
                  </td>
                  <td>{c.meses === null ? 'sem registro' : `há ${c.meses} meses`}</td>
                  <td>
                    <Link href={`/ficha/${c.inscricaoId}?aba=contato`}>Atualizar contato</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {p.contatosVelhos.length > 0 ? (
          <Paginacao
            base={`/unidade/${unidadeId}`}
            filtros={filtros}
            pagina={contatos.pagina}
            param="pc"
            porPagina={contatos.porPagina}
            total={contatos.total}
          />
        ) : null}
      </div>

      <div className="cartao">
        <div className="cartao-titulo">
          <h2>Ocupação por grupamento</h2>
          <span className="cod">capacidade vem do datalake da cidade</span>
        </div>
        {p.capacidades.length === 0 ? (
          <p className="vazio">Capacidade instalada ainda não importada para esta unidade.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Grupamento</th>
                <th style={{ width: 110 }}>Turno</th>
                <th style={{ textAlign: 'right', width: 110 }}>Matriculados</th>
                <th style={{ textAlign: 'right', width: 110 }}>Capacidade</th>
                <th style={{ textAlign: 'right', width: 110 }}>Ocupação</th>
              </tr>
            </thead>
            <tbody>
              {p.capacidades.map((c) => (
                <tr key={c.id}>
                  <td>{c.grupamento}</td>
                  <td>{c.turno}</td>
                  <td className="num">{numero(c.matriculados)}</td>
                  <td className="num">{numero(c.vagas)}</td>
                  <td className="num">{c.ocupacao === null ? '—' : percentual(c.ocupacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
