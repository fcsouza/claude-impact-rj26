'use client';

import { useState, useTransition } from 'react';

export function ResumoIA({ inscricaoId }: { inscricaoId: string }) {
  const [resumo, setResumo] = useState<{ texto: string; origem: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function gerar() {
    iniciar(async () => {
      setErro(null);
      try {
        const resposta = await fetch(`/api/ficha/${inscricaoId}/resumo`);
        if (!resposta.ok) {
          setErro('Não foi possível gerar o resumo agora.');
          return;
        }
        setResumo((await resposta.json()) as { texto: string; origem: string });
      } catch {
        setErro('Não foi possível gerar o resumo agora.');
      }
    });
  }

  return (
    <div className="ia" style={{ marginTop: 'var(--fv-space-4)' }}>
      <div className="cabeca">
        <span className="marca">Resumo em linguagem simples</span>
        <button className="botao botao-ia" disabled={pendente} onClick={gerar} type="button">
          {pendente ? 'Gerando…' : resumo ? 'Regerar' : 'Gerar'}
        </button>
      </div>
      <p style={{ margin: 0 }}>
        {resumo?.texto ??
          'Clique em gerar para ver a situação da criança e o próximo passo em duas frases.'}
      </p>
      {erro ? (
        <p className="erro" style={{ marginTop: 6 }}>
          {erro}
        </p>
      ) : null}
      {resumo ? (
        <p className="cod" style={{ marginTop: 6 }}>
          {resumo.origem === 'claude'
            ? 'gerado por Claude'
            : 'gerado pela regra local, sem credencial de IA'}
        </p>
      ) : null}
    </div>
  );
}
