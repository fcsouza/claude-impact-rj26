import { avisarFalhaDaIa, conversar, provedor } from './cliente.ts';

const SYSTEM = `Você redige a resposta de um servidor da Secretaria Municipal de Educação do Rio para uma família que perguntou algo sobre a convocação de creche.
Até três frases, português do Brasil, voz ativa, tom cordial e direto.
Não invente prazo, endereço, documento ou regra que não esteja nos dados fornecidos.
Termine lembrando que a família pode responder SIM para confirmar a vaga.`;

/** Rascunho de resposta quando a classificação é `duvida` (RF5.4). */
export async function rascunharResposta(args: {
  pergunta: string;
  nome: string;
  unidade: string;
  endereco: string;
  prazoFim: Date;
}): Promise<{ texto: string; origem: 'claude' | 'fallback' }> {
  const prazo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(
    args.prazoFim
  );

  if (provedor() === 'fallback') {
    return {
      origem: 'fallback',
      texto: `Olá! A vaga de ${args.nome} é na ${args.unidade}, em ${args.endereco}. O prazo para confirmar vai até ${prazo}. Responda SIM para confirmar a vaga.`,
    };
  }

  try {
    const texto = await conversar({
      maxTokens: 300,
      prompt: JSON.stringify({ ...args, prazoFim: prazo }, null, 2),
      system: SYSTEM,
    });
    return texto
      ? { origem: 'claude', texto }
      : {
          origem: 'fallback',
          texto: `Olá! A vaga de ${args.nome} é na ${args.unidade}, em ${args.endereco}. O prazo para confirmar vai até ${prazo}. Responda SIM para confirmar a vaga.`,
        };
  } catch (erro) {
    avisarFalhaDaIa('rascunho', erro);
    return {
      origem: 'fallback',
      texto: `Olá! A vaga de ${args.nome} é na ${args.unidade}, em ${args.endereco}. O prazo para confirmar vai até ${prazo}. Responda SIM para confirmar a vaga.`,
    };
  }
}
