'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  atualizarStatus,
  cancelarConvocacao,
  confirmarVaga,
  estenderPrazo,
  notificarSecretaria,
  registrarTentativaManual,
  salvarContato,
  salvarNota,
  simularResposta,
} from '@/app/(app)/acoes';

type Contato = {
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  melhorHorario: string | null;
  obs: string | null;
  versao: number;
} | null;

type Aba = 'resposta' | 'contato' | 'tentativa' | 'nota' | 'situacao';

/** Cada opção do dropdown já carrega para onde a máquina de estados leva a opção. */
const STATUS = [
  { motivo: 'manual', para: 'Ativo', rotulo: 'Matriculado', valor: 'matriculado' },
  {
    motivo: 'desistiu',
    para: 'Cancelado',
    rotulo: 'Cancelado (sem interesse)',
    valor: 'sem_interesse',
  },
  {
    motivo: 'prazo_vencido',
    para: 'Cancelado pelo sistema',
    rotulo: 'Cancelado (prazo expirado)',
    valor: 'prazo_expirado',
  },
  {
    motivo: 'nao_localizado',
    para: 'Cancelado',
    rotulo: 'Contato sem retorno',
    valor: 'sem_retorno',
  },
  { motivo: 'manual', para: 'Cancelado', rotulo: 'Outro', valor: 'outro' },
] as const;

export function AcoesFicha({
  inscricaoId,
  opcaoId,
  convocacaoId,
  contato,
  abaInicial = 'resposta',
}: {
  inscricaoId: string;
  opcaoId: string;
  convocacaoId: string | null;
  contato: Contato;
  abaInicial?: Aba;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const executar = (rotulo: string, acao: () => Promise<unknown>) => {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      try {
        await acao();
        setAviso(rotulo);
        router.refresh();
      } catch (falha) {
        setErro(falha instanceof Error ? falha.message : 'A ação não foi aplicada.');
      }
    });
  };

  // formulários
  const [texto, setTexto] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [nota, setNota] = useState('');
  const [novoStatus, setNovoStatus] = useState<string>(STATUS[0].valor);
  const [canal, setCanal] = useState('telefone');
  const [resultado, setResultado] = useState('');
  const [form, setForm] = useState({
    email: contato?.email ?? '',
    melhorHorario: contato?.melhorHorario ?? '',
    obs: contato?.obs ?? '',
    telefone: contato?.telefone ?? '',
    whatsapp: contato?.whatsapp ?? '',
  });

  const abas: { chave: Aba; rotulo: string }[] = [
    { chave: 'resposta', rotulo: 'Resposta da família' },
    { chave: 'contato', rotulo: 'Contato' },
    { chave: 'tentativa', rotulo: 'Tentativa manual' },
    { chave: 'nota', rotulo: 'Nota' },
    { chave: 'situacao', rotulo: 'Atualizar status da convocação' },
  ];

  return (
    <div className="cartao">
      <div className="cartao-titulo">
        <h2>Ações do servidor</h2>
        <span className="cod">toda mutação vira evento de auditoria</span>
      </div>

      <div className="filtros" style={{ marginBottom: 'var(--fv-space-3)' }}>
        {abas.map((a) => (
          <button
            className={`botao ${aba === a.chave ? '' : 'botao-secundario'}`}
            key={a.chave}
            onClick={() => setAba(a.chave)}
            type="button"
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'resposta' ? (
        <div>
          {convocacaoId ? (
            <>
              <div className="filtros">
                <button
                  className="botao"
                  disabled={pendente}
                  onClick={() =>
                    executar('Vaga confirmada e demais opções canceladas.', () =>
                      confirmarVaga(convocacaoId, inscricaoId)
                    )
                  }
                  type="button"
                >
                  Confirmou a vaga
                </button>
                <button
                  className="botao botao-secundario"
                  disabled={pendente}
                  onClick={() =>
                    executar('E-mail enviado: a secretaria vai ligar para o responsável.', () =>
                      notificarSecretaria(convocacaoId, inscricaoId)
                    )
                  }
                  type="button"
                >
                  Notificar secretaria
                </button>
                <button
                  className="botao botao-perigo"
                  disabled={pendente || justificativa.trim().length < 3}
                  onClick={() =>
                    executar('Desistência registrada.', () =>
                      cancelarConvocacao({
                        convocacaoId,
                        inscricaoId,
                        justificativa,
                        motivo: 'desistiu',
                      })
                    )
                  }
                  type="button"
                >
                  Desistiu
                </button>
                <button
                  className="botao botao-secundario"
                  disabled={pendente || justificativa.trim().length < 3}
                  onClick={() =>
                    executar('Prazo estendido em um dia útil.', () =>
                      estenderPrazo({ convocacaoId, inscricaoId, justificativa })
                    )
                  }
                  type="button"
                >
                  Estender prazo (CRE)
                </button>
              </div>

              <div className="campo">
                <label htmlFor="justificativa">
                  Motivo · obrigatório para desistência e extensão
                </label>
                <input
                  id="justificativa"
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="família informou por telefone que…"
                  type="text"
                  value={justificativa}
                />
              </div>

              <div className="campo">
                <label htmlFor="texto-resposta">
                  Mensagem recebida · Claude lê e sugere a ação
                </label>
                <textarea
                  id="texto-resposta"
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="consigo só na sexta de manhã"
                  rows={2}
                  value={texto}
                />
                <button
                  className="botao botao-ia"
                  disabled={pendente || texto.trim().length < 2}
                  onClick={() =>
                    executar('Resposta registrada; a sugestão aparece na timeline.', () =>
                      simularResposta({ convocacaoId, inscricaoId, texto })
                    )
                  }
                  style={{ marginTop: 8 }}
                  type="button"
                >
                  Registrar resposta e classificar
                </button>
              </div>
            </>
          ) : (
            <p className="vazio">Não há convocação aberta para esta criança.</p>
          )}
        </div>
      ) : null}

      {aba === 'contato' ? (
        <div>
          <div className="linha-campos">
            {(
              [
                ['telefone', 'Telefone'],
                ['whatsapp', 'WhatsApp'],
                ['email', 'E-mail'],
                ['melhorHorario', 'Melhor horário'],
              ] as const
            ).map(([campo, rotulo]) => (
              <div className="campo" key={campo}>
                <label htmlFor={campo}>{rotulo}</label>
                <input
                  id={campo}
                  onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  type="text"
                  value={form[campo]}
                />
              </div>
            ))}
          </div>
          <div className="campo">
            <label htmlFor="obs">Observação</label>
            <input
              id="obs"
              onChange={(e) => setForm({ ...form, obs: e.target.value })}
              type="text"
              value={form.obs}
            />
          </div>
          <p className="cod">
            O valor anterior é preservado; a edição cria a versão v{(contato?.versao ?? 0) + 1} na
            timeline.
          </p>
          <button
            className="botao"
            disabled={pendente}
            onClick={() =>
              executar('Contato salvo em versão nova.', () =>
                salvarContato({ inscricaoId, ...form })
              )
            }
            type="button"
          >
            Salvar versão
          </button>
        </div>
      ) : null}

      {aba === 'tentativa' ? (
        <div>
          {convocacaoId ? (
            <>
              <div className="linha-campos">
                <div className="campo">
                  <label htmlFor="canal">Canal</label>
                  <select id="canal" onChange={(e) => setCanal(e.target.value)} value={canal}>
                    <option value="telefone">Telefone</option>
                    <option value="presencial">Presencial</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="email">E-mail</option>
                  </select>
                </div>
                <div className="campo" style={{ flex: 1 }}>
                  <label htmlFor="resultado">Resultado</label>
                  <input
                    id="resultado"
                    onChange={(e) => setResultado(e.target.value)}
                    placeholder="ligou, ninguém atendeu"
                    type="text"
                    value={resultado}
                  />
                </div>
              </div>
              <button
                className="botao"
                disabled={pendente || resultado.trim().length < 2}
                onClick={() =>
                  executar('Tentativa manual registrada.', () =>
                    registrarTentativaManual({
                      canal,
                      convocacaoId,
                      inscricaoId,
                      resultado,
                      status: 'enviado',
                    })
                  )
                }
                type="button"
              >
                Registrar tentativa
              </button>
            </>
          ) : (
            <p className="vazio">Sem convocação aberta para registrar tentativa.</p>
          )}
        </div>
      ) : null}

      {aba === 'nota' ? (
        <div>
          <div className="campo">
            <label htmlFor="nota">Nota livre</label>
            <textarea id="nota" onChange={(e) => setNota(e.target.value)} rows={3} value={nota} />
          </div>
          <button
            className="botao"
            disabled={pendente || nota.trim().length < 2}
            onClick={() =>
              executar('Nota salva.', async () => {
                await salvarNota({ inscricaoId, texto: nota });
                setNota('');
              })
            }
            type="button"
          >
            Salvar nota
          </button>
        </div>
      ) : null}

      {aba === 'situacao' ? (
        <div>
          <div className="linha-campos">
            <div className="campo">
              <label htmlFor="status-novo">Novo status</label>
              <select
                id="status-novo"
                onChange={(e) => setNovoStatus(e.target.value)}
                value={novoStatus}
              >
                {STATUS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="motivo-situacao">Motivo · obrigatório</label>
              <input
                id="motivo-situacao"
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder={
                  novoStatus === 'outro' ? 'descreva o que aconteceu' : 'o que a família informou'
                }
                type="text"
                value={justificativa}
              />
            </div>
          </div>
          <button
            className="botao"
            disabled={pendente || justificativa.trim().length < 3}
            onClick={() => {
              const escolha = STATUS.find((s) => s.valor === novoStatus) ?? STATUS[0];
              executar('Status da convocação atualizado.', () =>
                atualizarStatus({
                  inscricaoId,
                  justificativa,
                  motivo: escolha.motivo,
                  opcaoId,
                  para: escolha.para,
                })
              );
            }}
            type="button"
          >
            Aplicar mudança
          </button>
          <p className="cod" style={{ marginTop: 8 }}>
            A máquina de estados recusa transição fora das arestas permitidas. A convocação aberta é
            encerrada junto.
          </p>
        </div>
      ) : null}

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
    </div>
  );
}
