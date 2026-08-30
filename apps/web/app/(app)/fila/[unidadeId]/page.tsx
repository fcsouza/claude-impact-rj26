import Link from 'next/link';
import { AbrirVaga } from '@/components/abrir-vaga';
import { api } from '@/lib/api';
import { classeSituacao, data, numero, prazo, rotuloSituacao } from '@/lib/formato';

type Badge =
  | { tipo: 'selecionado_ha'; dias: number }
  | { tipo: 'prazo_vencido'; dias: number }
  | { tipo: 'inconsistencia'; detalhe: string }
  | { tipo: 'contato_desatualizado'; meses: number }
  | { tipo: 'bairro_diferente'; bairroFamilia: string; bairroUnidade: string };

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
  linhas: Linha[];
  resumo: Record<string, number>;
  unidade: { escCodigo: string; nome: string; bairro: string | null; creId: number | null } | null;
}

const rotuloBadge = (b: Badge) => {
  switch (b.tipo) {
    case 'selecionado_ha':
      return { classe: 'badge badge-neutro', texto: `convocado há ${b.dias} dia(s)` };
    case 'prazo_vencido':
      return { classe: 'badge badge-prazo', texto: `prazo vencido há ${b.dias} dia(s)` };
    case 'inconsistencia':
      return { classe: 'badge badge-prazo', texto: 'inconsistência' };
    case 'contato_desatualizado':
      return { classe: 'badge badge-aviso', texto: `contato de ${b.meses} meses` };
    case 'bairro_diferente':
      return { classe: 'badge badge-neutro', texto: 'bairro diferente' };
    default:
      return { classe: 'badge', texto: '' };
  }
};

export default async function Fila({
  params,
  searchParams,
}: {
  params: Promise<{ unidadeId: string }>;
  searchParams: Promise<{ turno?: string; grupamento?: string; situacao?: string; busca?: string }>;
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
  const total = Object.values(dados.resumo).reduce((a, b) => a + b, 0);

  const kpis = [
    {
      dica: 'lista de espera',
      rotulo: 'Na fila',
      valor: numero(dados.resumo['Lista de espera'] ?? 0),
    },
    {
      dica: 'aguardando confirmação',
      rotulo: 'Convocados',
      valor: numero(dados.resumo.Selecionado ?? 0),
    },
    {
      dica: 'matrícula fechada',
      rotulo: 'Confirmados',
      valor: numero(dados.resumo.Confirmado ?? 0),
    },
    { dica: 'todas as situações', rotulo: 'Opções no processo', valor: numero(total) },
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
        <AbrirVaga grupamentos={dados.grupamentos} unidadeId={unidadeId} />
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
        <form className="filtros" method="get">
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
              <option value="Ativo">Ativo</option>
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

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Criança</th>
                <th style={{ textAlign: 'right', width: 96 }}>Pontuação</th>
                <th style={{ width: 140 }}>Bairro</th>
                <th style={{ width: 130 }}>Situação</th>
                <th>Sinalizações</th>
                <th style={{ width: 96 }}>Ação</th>
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
                    <td className="num">{indice + 1}</td>
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
                      <span className={classeSituacao(linha.situacao)}>
                        {rotuloSituacao(linha.situacao)}
                      </span>
                      {linha.prazoFim ? <div className={p.classe}>{p.texto}</div> : null}
                    </td>
                    <td>
                      {linha.badges.map((b) => {
                        const r = rotuloBadge(b);
                        return (
                          <span className={r.classe} key={`${linha.opcaoId}-${b.tipo}`}>
                            {r.texto}
                          </span>
                        );
                      })}
                    </td>
                    <td>
                      <Link href={`/ficha/${linha.inscricaoId}`}>Abrir ficha</Link>
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
          <p className="cod" style={{ marginTop: 'var(--fv-space-3)' }}>
            {dados.linhas.length} opções · ordenado por pontuação, empate por data de inscrição
          </p>
        )}
      </div>
    </>
  );
}
