import { avisarFalhaDaIa, conversar, provedor } from './cliente.ts';

export interface FichaParaResumo {
  grupamento: string;
  nome: string;
  pontuacao: number;
  posicao?: number | null;
  prazoFim?: Date | null;
  situacao: string;
  tentativas: { canal: string; status: string; quando: string }[];
  turno: string;
  ultimaResposta?: string | null;
  unidade: string;
}

const SYSTEM = `Você escreve para servidores de creche da prefeitura do Rio, que não são técnicos.
Duas frases curtas: onde a criança está no processo e qual é o próximo passo.
Português do Brasil, voz ativa, sem jargão, sem emoji, sem repetir números que já estão na tela.`;

/** Resumo em linguagem simples da ficha (RF2.5). Sem credencial, monta na regra. */
export async function resumirFicha(
  ficha: FichaParaResumo
): Promise<{ texto: string; origem: 'claude' | 'fallback' }> {
  if (provedor() === 'fallback') {
    return { origem: 'fallback', texto: resumoSimples(ficha) };
  }

  try {
    const texto = await conversar({
      maxTokens: 300,
      prompt: JSON.stringify(
        {
          ...ficha,
          prazoFim: ficha.prazoFim?.toISOString() ?? null,
        },
        null,
        2
      ),
      system: SYSTEM,
    });
    return texto
      ? { origem: 'claude', texto }
      : { origem: 'fallback', texto: resumoSimples(ficha) };
  } catch (erro) {
    avisarFalhaDaIa('resumo', erro);
    return { origem: 'fallback', texto: resumoSimples(ficha) };
  }
}

function resumoSimples(f: FichaParaResumo): string {
  // A tela chama `Selecionado` de convocado; o resumo fala a mesma língua.
  const comoAtela =
    f.situacao === 'Selecionado' || f.situacao === 'Selecionado da lista'
      ? 'convocada'
      : f.situacao.toLowerCase();

  const partes = [
    `${f.nome} está ${comoAtela} na ${f.unidade}, turno ${f.turno.toLowerCase()}, ${f.grupamento}.`,
  ];

  if (f.situacao === 'Selecionado' && f.prazoFim) {
    const dias = Math.ceil((f.prazoFim.getTime() - Date.now()) / 86_400_000);
    partes.push(
      dias >= 0
        ? `Faltam ${dias} dia(s) para o prazo de confirmação; já foram ${f.tentativas.length} tentativa(s) de contato.`
        : `O prazo venceu há ${Math.abs(dias)} dia(s) e a vaga volta para a fila.`
    );
  } else if (f.situacao === 'Lista de espera') {
    partes.push('A criança aguarda a abertura de vaga na unidade.');
  } else {
    partes.push('Nenhuma ação pendente nesta opção.');
  }

  return partes.join(' ');
}
