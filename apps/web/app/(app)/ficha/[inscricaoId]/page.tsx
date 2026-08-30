import Link from 'next/link';
import { AcoesFicha } from '@/components/acoes-ficha';
import { Info } from '@/components/info';
import { ResumoIA } from '@/components/resumo-ia';
import { api } from '@/lib/api';
import {
  classeSituacao,
  DICAS,
  data,
  dataHora,
  dicaSituacao,
  numero,
  prazo,
  rotuloSituacao,
} from '@/lib/formato';

interface Criterio {
  confirmado: boolean;
  ichPergId: number;
  pontos: number;
  resposta: string;
  texto: string;
}

interface Ficha {
  cadastro: {
    id: string;
    alunoAnon: string;
    nomeFicticio: string;
    responsavelFicticio: string;
    nascimentoAnomes: string;
    sexo: string;
    bairro: string | null;
    bairroCorrigido: string | null;
    cep: string | null;
    dataCriacao: string;
    pontuacaoTotal: number;
    criteriosJson: Criterio[] | null;
  };
  contato: {
    id: string;
    telefone: string | null;
    whatsapp: string | null;
    email: string | null;
    melhorHorario: string | null;
    obs: string | null;
    versao: number;
    criadoEm: string;
  } | null;
  convocacaoAberta: { id: string; prazoFim: string; extensoes: number; iniciadaEm: string } | null;
  notas: { id: string; texto: string; criadoEm: string }[];
  opcoes: {
    id: string;
    ordem: number;
    situacao: string;
    grupamento: string;
    turno: string;
    unidadeId: string;
    unidade: string;
    bairroUnidade: string | null;
  }[];
  timeline: {
    id: string;
    tipo: string;
    quando: string;
    titulo: string;
    detalhe: string | null;
    canal: string | null;
    status: string | null;
    autor: string | null;
  }[];
}

const classeCanal = (canal: string | null, status: string | null) => {
  if (canal === 'INBOUND') {
    return 'canal canal-inbound';
  }
  if (status === 'entregue' || status === 'lido' || status === 'respondido') {
    return 'canal canal-entregue';
  }
  if (status === 'falhou') {
    return 'canal canal-falhou';
  }
  return 'canal canal-neutro';
};

const ABAS = ['resposta', 'contato', 'tentativa', 'nota', 'situacao'] as const;
type Aba = (typeof ABAS)[number];

export default async function FichaPagina({
  params,
  searchParams,
}: {
  params: Promise<{ inscricaoId: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { inscricaoId } = await params;
  const { aba } = await searchParams;
  const abaInicial = ABAS.find((a) => a === aba) as Aba | undefined;
  const ficha = await api<Ficha>(`/api/ficha/${inscricaoId}`);

  const principal =
    ficha.opcoes.find((o) => o.situacao === 'Selecionado') ??
    ficha.opcoes.find((o) => o.situacao === 'Confirmado') ??
    ficha.opcoes[0];

  const p = prazo(ficha.convocacaoAberta?.prazoFim ?? null);
  const criterios = ficha.cadastro.criteriosJson ?? [];
  const pontuados = criterios.filter((c) => c.resposta === 'Sim');

  return (
    <>
      <p className="cod" style={{ marginBottom: 6 }}>
        <Link href={`/fila/${principal?.unidadeId ?? ''}`}>Fila da unidade</Link> / Ficha da criança
      </p>

      <div className="titulo-linha" style={{ marginBottom: 'var(--fv-space-4)' }}>
        <div>
          <h1>{ficha.cadastro.nomeFicticio}</h1>
          <p className="subtitulo">
            <span className="termo">
              <span className={classeSituacao(principal?.situacao ?? '')}>
                {rotuloSituacao(principal?.situacao ?? '')}
              </span>
              <Info texto={dicaSituacao(principal?.situacao ?? '')} />
            </span>{' '}
            <span className="mono">aluno_anon {ficha.cadastro.alunoAnon}</span> · nasc.{' '}
            {ficha.cadastro.nascimentoAnomes} · {principal?.grupamento} · {principal?.turno} ·{' '}
            {principal?.ordem}ª opção
          </p>
        </div>

        {ficha.convocacaoAberta ? (
          <div className="cartao" style={{ minWidth: 240 }}>
            <div className="rotulo eyebrow">Prazo de confirmação</div>
            <div className={p.classe} style={{ fontSize: 22, marginTop: 4 }}>
              {p.texto}
            </div>
            <div className="cod">
              até {data(ficha.convocacaoAberta.prazoFim)} · {ficha.convocacaoAberta.extensoes}{' '}
              extensão(ões)
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid-ficha">
        <div>
          <div className="cartao">
            <div className="cartao-titulo">
              <h2>Timeline da convocação</h2>
              <span className="cod">{ficha.timeline.length} eventos</span>
            </div>
            <div className="timeline">
              {ficha.timeline.map((item) => (
                <div className="evento" key={item.id}>
                  <span className="quando">{dataHora(item.quando)}</span>
                  <span className={classeCanal(item.canal, item.status)}>{item.canal ?? '—'}</span>
                  <span>
                    <span className="titulo">{item.titulo}</span>
                    {item.detalhe ? <div className="detalhe">{item.detalhe}</div> : null}
                    <div className="autor">
                      {[item.status, item.autor].filter(Boolean).join(' · ') || 'automático'}
                    </div>
                  </span>
                </div>
              ))}
              {ficha.timeline.length === 0 ? (
                <p className="vazio">Nada registrado ainda nesta inscrição.</p>
              ) : null}
            </div>
          </div>

          <ResumoIA inscricaoId={inscricaoId} />

          <AcoesFicha
            abaInicial={abaInicial}
            contato={ficha.contato}
            convocacaoId={ficha.convocacaoAberta?.id ?? null}
            inscricaoId={inscricaoId}
            opcaoId={principal?.id ?? ''}
          />
        </div>

        <div>
          <div className="cartao">
            <div className="cartao-titulo">
              <h2>Contato</h2>
              <span className="cod">v{ficha.contato?.versao ?? 0}</span>
            </div>
            <dl style={{ display: 'grid', gap: 8, margin: 0 }}>
              {[
                ['Telefone', ficha.contato?.telefone],
                ['WhatsApp', ficha.contato?.whatsapp],
                ['E-mail', ficha.contato?.email],
                ['Melhor horário', ficha.contato?.melhorHorario],
                ['Observação', ficha.contato?.obs],
              ].map(([rotulo, valor]) => (
                <div key={rotulo as string}>
                  <dt className="eyebrow">{rotulo}</dt>
                  <dd style={{ font: 'var(--fv-text-row)', margin: 0 }}>{valor || '—'}</dd>
                </div>
              ))}
            </dl>
            {ficha.contato ? (
              <p className="cod" style={{ marginTop: 'var(--fv-space-3)' }}>
                versão registrada em {dataHora(ficha.contato.criadoEm)}
              </p>
            ) : null}
          </div>

          <div className="cartao">
            <div className="cartao-titulo">
              <h2>
                Pontuação
                <Info texto={DICAS.pontuacao} />
              </h2>
              <span className="badge badge-neutro">somente leitura</span>
            </div>
            <div className="valor mono" style={{ fontSize: 27 }}>
              {numero(ficha.cadastro.pontuacaoTotal)}
            </div>
            <p className="cod">pontos · régua 2025 (Query C)</p>
            <div
              className="desabilitado"
              style={{ borderRadius: 'var(--fv-radius-sm)', marginTop: 8, padding: 10 }}
            >
              {pontuados.length === 0 ? (
                <span className="cod">Nenhum critério pontuado.</span>
              ) : (
                pontuados.map((c) => (
                  <div
                    key={c.ichPergId}
                    style={{
                      display: 'flex',
                      gap: 12,
                      justifyContent: 'space-between',
                      padding: '3px 0',
                    }}
                  >
                    <span style={{ font: 'var(--fv-text-body)' }}>{c.texto}</span>
                    <span className="mono">{c.pontos}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="cartao">
            <div className="cartao-titulo">
              <h2>Opções da inscrição</h2>
              <span className="cod">{ficha.opcoes.length}</span>
            </div>
            {ficha.opcoes.map((o) => (
              <div
                key={o.id}
                style={{
                  borderBottom: '1px solid var(--fv-divider-soft)',
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'space-between',
                  padding: '8px 0',
                }}
              >
                <span>
                  <span className="mono">{o.ordem}ª</span> {o.unidade}
                  <div className="cod">{o.bairroUnidade ?? ''}</div>
                </span>
                <span className="termo">
                  <span className={classeSituacao(o.situacao)}>{rotuloSituacao(o.situacao)}</span>
                  <Info texto={dicaSituacao(o.situacao)} />
                </span>
              </div>
            ))}
          </div>

          <div className="cartao">
            <div className="cartao-titulo">
              <h2>Não editável</h2>
            </div>
            <ul style={{ color: 'var(--fv-text-2)', margin: 0, paddingLeft: 18 }}>
              <li>Pontuação e breakdown</li>
              <li>Posição na fila</li>
              <li>Respostas socioeconômicas confirmadas</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
