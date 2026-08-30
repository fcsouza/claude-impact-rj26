import { avisarFalhaDaIa, conversar, extrairJson, provedor } from './cliente.ts';

export type Classificacao = 'confirma' | 'extensao' | 'desiste' | 'duvida' | 'outro';

export interface ResultadoClassificacao {
  acaoSugerida: string;
  classificacao: Classificacao;
  confianca: number;
  origem: 'claude' | 'fallback';
  trechoChave: string;
}

const SYSTEM = `Você lê respostas de famílias convocadas para uma vaga de creche na rede municipal do Rio de Janeiro e classifica a intenção.

Categorias:
- confirma: aceita a vaga ou diz que vai comparecer
- extensao: aceita, mas pede mais prazo ou marca outro dia
- desiste: recusa a vaga, já conseguiu outra ou não tem mais interesse
- duvida: faz uma pergunta ou pede informação antes de decidir
- outro: qualquer coisa que não caiba acima

Responda só com um objeto JSON, sem texto em volta:
{"classificacao":"...","confianca":0.0,"trecho_chave":"...","acao_sugerida":"..."}

"trecho_chave" é a parte literal da mensagem que sustenta a classificação.
"acao_sugerida" é uma frase curta dizendo o que o servidor deveria fazer.
"confianca" vai de 0 a 1.`;

/**
 * A ordem importa: a negação é lida antes da confirmação, senão "não quero" vira "quero".
 */
const PADROES: { padrao: RegExp; classificacao: Classificacao; acao: string }[] = [
  {
    acao: 'Registrar desistência e reabrir a vaga',
    classificacao: 'desiste',
    padrao:
      /\b(desisto|recuso|desist|n[ãa]o (quero|preciso|vou|tenho|posso mais)|j[áa] consegui|consegui outra)\b/i,
  },
  {
    acao: 'Confirmar a matrícula',
    classificacao: 'confirma',
    padrao: /(?<!n[ãa]o )\b(sim|confirmo|aceito|quero|vou|estarei|compareco|compareço)\b/i,
  },
  {
    acao: 'Avaliar extensão de prazo com a CRE',
    classificacao: 'extensao',
    padrao:
      /\b(so|só|apenas)?\s*(consigo|posso|dá|da)\b.*\b(sexta|segunda|terca|terça|quarta|quinta|semana|amanha|amanhã|depois)\b/i,
  },
  {
    acao: 'Avaliar extensão de prazo com a CRE',
    classificacao: 'extensao',
    padrao: /\b(prazo|mais tempo|adiar|remarcar|outro dia)\b/i,
  },
  {
    acao: 'Responder à família',
    classificacao: 'duvida',
    padrao: /\?|\b(qual|onde|quando|como|preciso levar|documento|horario|horário)\b/i,
  },
];

/** Regra por palavra-chave: é o que roda sem credencial e o que segura a demo. */
export function classificarPorPalavraChave(texto: string): ResultadoClassificacao {
  const limpo = texto.trim();
  for (const { padrao, classificacao, acao } of PADROES) {
    const encontrado = limpo.match(padrao);
    if (encontrado) {
      return {
        acaoSugerida: acao,
        classificacao,
        confianca: 0.55,
        origem: 'fallback',
        trechoChave: encontrado[0],
      };
    }
  }
  return {
    acaoSugerida: 'Ler a mensagem e decidir manualmente',
    classificacao: 'outro',
    confianca: 0.3,
    origem: 'fallback',
    trechoChave: limpo.slice(0, 80),
  };
}

/** Classifica com Claude; cai na regra quando não há credencial ou a resposta vem torta. */
export async function classificarResposta(texto: string): Promise<ResultadoClassificacao> {
  if (provedor() === 'fallback') {
    return classificarPorPalavraChave(texto);
  }

  try {
    const bruto = await conversar({
      maxTokens: 400,
      prompt: `Mensagem da família:\n"""${texto}"""`,
      system: SYSTEM,
    });

    const json = extrairJson<{
      classificacao: string;
      confianca: number;
      trecho_chave: string;
      acao_sugerida: string;
    }>(bruto);

    const validas: Classificacao[] = ['confirma', 'extensao', 'desiste', 'duvida', 'outro'];
    if (!(json && validas.includes(json.classificacao as Classificacao))) {
      return classificarPorPalavraChave(texto);
    }

    return {
      acaoSugerida: json.acao_sugerida?.slice(0, 240) ?? 'Revisar manualmente',
      classificacao: json.classificacao as Classificacao,
      confianca: Number.isFinite(json.confianca) ? Math.min(1, Math.max(0, json.confianca)) : 0.7,
      origem: 'claude',
      trechoChave: json.trecho_chave?.slice(0, 240) ?? texto.slice(0, 80),
    };
  } catch (erro) {
    avisarFalhaDaIa('classificação', erro);
    return classificarPorPalavraChave(texto);
  }
}
