import Link from 'next/link';
import { Info } from '@/components/info';
import { Paginacao } from '@/components/paginacao';
import { PeriodoFiltro } from '@/components/periodo-filtro';
import { api } from '@/lib/api';
import {
  classeSituacao,
  DICAS,
  data,
  dicaSituacao,
  numero,
  prazo,
  rotuloSituacao,
} from '@/lib/formato';

type Badge =
  | { tipo: 'selecionado_ha'; dias: number }
  | { tipo: 'prazo_vencido'; dias: number }
  | { tipo: 'inconsistencia'; detalhe: string }
  | { tipo: 'contato_desatualizado'; canais: string[] };

interface Linha {
  alunoAnon: string;
  badges: Badge[];
  bairroFamilia: string | null;
  convocacaoId: string | null;
  dataCriacao: string;
  grupamento: string;
  inscricaoId: string;
  nome: string;
  opcaoId: string;
  ordem: number;
  pontuacao: number;
  prazoFim: string | null;
  situacao: string;
  turno: string;
}

interface Resposta {
  grupamentos: string[];
  kpis: {
    acaoHoje: number;
    confirmados: number;
    convocados: number;
    fila: number;
    matriculados: number;
    perdidos: number;
  };
  linhas: Linha[];
  pagina: number;
  periodo: { ate: string; de: string; nome: 'semana' | 'mes' | 'processo' | 'custom' };
  porPagina: number;
  total: number;
  unidade: { escCodigo: string; nome: string; bairro: string | null; creId: number | null } | null;
}

interface Filtros extends Record<string, string | undefined> {
  ate?: string;
  busca?: string;
  de?: string;
  grupamento?: string;
  pagina?: string;
  periodo?: string;
  situacao?: string;
  turno?: string;
}

const ROTULO_CANAL: Record<string, string> = {
  email: 'e-mail',
  presencial: 'presencial',
  sms: 'SMS',
  telefone: 'telefone',
  whatsapp: 'WhatsApp',
};

const rotuloBadge = (b: Badge) => {
  switch (b.tipo) {
    case 'selecionado_ha':
      return {
        classe: 'badge badge-neutro',
        dica: dicaSituacao('Selecionado'),
        texto: `convocado ${emDias(b.dias)}`,
      };
    case 'prazo_vencido':
      return {
        classe: 'badge badge-prazo',
        dica: DICAS.prazoVencido,
        texto: `prazo vencido ${emDias(b.dias)}`,
      };
    case 'inconsistencia':
      return { classe: 'badge badge-prazo', dica: DICAS.estadoDuplo, texto: 'estado duplo' };
    case 'contato_desatualizado':
      return {
        classe: 'badge badge-aviso',
        dica: DICAS.contatoDesatualizado,
        texto: `contato desatualizado: ${b.canais.map((c) => ROTULO_CANAL[c] ?? c).join(', ')}`,
      };
    // Sinal que esta versão da tela não conhece: melhor nada do que uma etiqueta vazia.
    default:
      return null;
  }
};

/** "há 0 dia(s)" não é português de tela: conta em dias falados. */
const emDias = (dias: number) => {
  if (dias === 0) {
    return 'hoje';
  }
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
};

/** Nome do recorte para o texto de apoio dos cartões. */
function nomeDoPeriodo(periodo: Resposta['periodo']): string {
  switch (periodo.nome) {
    case 'semana':
      return 'última semana';
    case 'processo':
      return 'processo 195/2025';
    case 'custom':
      return `${data(periodo.de)} a ${data(periodo.ate)}`;
    default:
      return 'último mês';
  }
}

/** Mantém os demais filtros ao enviar cada formulário da tela. */
function ocultos(filtros: Filtros, exceto: (keyof Filtros)[]) {
  return Object.entries(filtros)
    .filter(([chave, valor]) => valor && !exceto.includes(chave as keyof Filtros))
    .map(([chave, valor]) => <input defaultValue={valor} key={chave} name={chave} type="hidden" />);
}

export default async function Fila({
  params,
  searchParams,
}: {
  params: Promise<{ unidadeId: string }>;
  searchParams: Promise<Filtros>;
}) {
  const { unidadeId } = await params;
  const filtros = await searchParams;

  const consulta = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) {
      consulta.set(chave, valor);
    }
  }

  const dados = await api<Resposta>(`/api/fila/${unidadeId}?${consulta.toString()}`);
  const recorte = nomeDoPeriodo(dados.periodo);

  // Fila Viva, Ação hoje e Perdidos ficam sem dica nesta versão, como pediu o handoff.
  const kpis: {
    apoio?: string;
    atencao?: boolean;
    dica?: string;
    rotulo: string;
    valor: string;
  }[] = [
    { rotulo: 'Fila Viva', valor: numero(dados.kpis.fila) },
    { dica: DICAS.convocados, rotulo: 'Convocados', valor: numero(dados.kpis.convocados) },
    {
      atencao: dados.kpis.acaoHoje > 0,
      rotulo: 'Ação hoje',
      valor: numero(dados.kpis.acaoHoje),
    },
    {
      apoio: recorte,
      dica: DICAS.confirmados,
      rotulo: 'Confirmados no período',
      valor: numero(dados.kpis.confirmados),
    },
    {
      apoio: recorte,
      dica: DICAS.matriculados,
      rotulo: 'Matriculados no período',
      valor: numero(dados.kpis.matriculados),
    },
    { apoio: recorte, rotulo: 'Perdidos no período', valor: numero(dados.kpis.perdidos) },
  ];

  return (
    <>
      <div className="titulo-linha" style={{ marginBottom: 'var(--fv-space-4)' }}>
        <div>
          <div className="eyebrow">
            Unidade · {dados.unidade?.creId ? `${dados.unidade.creId}ª CRE` : 'CRE'} ·{' '}
            {dados.unidade?.bairro ?? ''}
          </div>
          <h1>{dados.unidade?.nome ?? unidadeId}</h1>
          <p className="subtitulo">
            <span className="mono">esc_codigo {unidadeId}</span> · processo 195/2025 · régua vigente
            2025
          </p>
        </div>

        <PeriodoFiltro
          ate={filtros.ate ?? ''}
          de={filtros.de ?? ''}
          key={dados.periodo.nome}
          ocultos={ocultos(filtros, ['periodo', 'de', 'ate'])}
          periodo={dados.periodo.nome}
        />
      </div>

      <div className="kpis" style={{ marginBottom: 'var(--fv-space-4)' }}>
        {kpis.map((k) => (
          <div className={k.atencao ? 'kpi kpi-alerta' : 'kpi'} key={k.rotulo}>
            <div className="rotulo">
              {k.rotulo}
              {k.dica ? <Info texto={k.dica} /> : null}
            </div>
            <div className="valor">{k.valor}</div>
            <div className="dica">{k.apoio ?? ''}</div>
          </div>
        ))}
      </div>

      <div className="filtros-caixa">
        <form className="filtros" method="get">
          {ocultos(filtros, ['turno', 'grupamento', 'situacao', 'busca'])}
          <div className="campo">
            <label htmlFor="turno">Turno</label>
            <select defaultValue={filtros.turno ?? ''} id="turno" name="turno">
              <option value="">Todos</option>
              <option value="Integral">Integral</option>
              <option value="Parcial">Parcial</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="grupamento">Grupamento</label>
            <select defaultValue={filtros.grupamento ?? ''} id="grupamento" name="grupamento">
              <option value="">Todos</option>
              {dados.grupamentos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="situacao">Situação</label>
            <select defaultValue={filtros.situacao ?? ''} id="situacao" name="situacao">
              <option value="">Todas</option>
              <option value="Lista de espera">Lista de espera</option>
              <option value="Selecionado">Convocado</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Ativo">Matriculado</option>
            </select>
          </div>
          <div className="campo" style={{ flex: 1 }}>
            <label htmlFor="busca">Buscar</label>
            <input
              defaultValue={filtros.busca ?? ''}
              id="busca"
              name="busca"
              placeholder="nome fictício ou aluno_anon"
              type="search"
            />
          </div>
          <button className="botao botao-secundario" type="submit">
            Filtrar
          </button>
          <Link className="botao botao-secundario" href={`/fila/${unidadeId}`}>
            Limpar
          </Link>
        </form>
      </div>

      <div className="cartao">
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Criança</th>
                <th style={{ textAlign: 'right', width: 110 }}>
                  Pontuação
                  <Info texto={DICAS.pontuacao} />
                </th>
                <th style={{ width: 140 }}>Bairro</th>
                <th style={{ width: 130 }}>Situação</th>
                <th>
                  Sinalizações
                  <Info texto={DICAS.sinalizacoes} />
                </th>
                <th style={{ width: 150 }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((linha, indice) => {
                const p = prazo(linha.prazoFim);
                const alerta = linha.badges.some(
                  (b) => b.tipo === 'prazo_vencido' || b.tipo === 'inconsistencia'
                );
                return (
                  <tr className={alerta ? 'alerta' : undefined} key={linha.opcaoId}>
                    <td className="num">{(dados.pagina - 1) * dados.porPagina + indice + 1}</td>
                    <td>
                      <div className="nome-linha">{linha.nome}</div>
                      <div className="cod">
                        {linha.alunoAnon} · {linha.ordem}ª opção · {linha.grupamento} ·{' '}
                        {linha.turno}
                      </div>
                    </td>
                    <td className="num">
                      {numero(linha.pontuacao)}
                      <div className="cod" style={{ textAlign: 'right' }}>
                        {data(linha.dataCriacao)}
                      </div>
                    </td>
                    <td>{linha.bairroFamilia ?? '—'}</td>
                    <td>
                      <span className="termo">
                        <span className={classeSituacao(linha.situacao)}>
                          {rotuloSituacao(linha.situacao)}
                        </span>
                        <Info texto={dicaSituacao(linha.situacao)} />
                      </span>
                      {linha.prazoFim ? <div className={p.classe}>{p.texto}</div> : null}
                    </td>
                    <td>
                      {linha.badges.map((b) => {
                        const r = rotuloBadge(b);
                        return r ? (
                          <span className={r.classe} key={`${linha.opcaoId}-${b.tipo}`}>
                            {r.texto}
                            <Info texto={r.dica} />
                          </span>
                        ) : null;
                      })}
                    </td>
                    <td>
                      <div className="acoes-linha">
                        <Link href={`/ficha/${linha.inscricaoId}`}>Abrir ficha</Link>
                        {linha.convocacaoId ? (
                          <Link href={`/ficha/${linha.inscricaoId}?aba=tentativa`}>
                            Registrar contato
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {dados.linhas.length === 0 ? (
          <p className="vazio">Nenhuma opção com esse filtro.</p>
        ) : (
          <>
            <p className="cod" style={{ marginTop: 'var(--fv-space-3)' }}>
              ordenado por pontuação, empate por data de inscrição
            </p>
            <Paginacao
              base={`/fila/${unidadeId}`}
              filtros={filtros}
              pagina={dados.pagina}
              porPagina={dados.porPagina}
              total={dados.total}
            />
          </>
        )}
      </div>
    </>
  );
}
