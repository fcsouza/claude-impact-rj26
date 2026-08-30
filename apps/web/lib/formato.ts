export const dataHora = (valor: string | Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(valor));

export const data = (valor: string | Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(valor));

export const numero = (valor: number) => valor.toLocaleString('pt-BR');

export const percentual = (valor: number) =>
  `${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/**
 * O sistema grava `Selecionado` e `Ativo`; a tela chama de Convocado e Matriculado,
 * como no design system e no vocabulário da secretaria.
 */
export function rotuloSituacao(situacao: string): string {
  if (situacao === 'Selecionado' || situacao === 'Selecionado da lista') {
    return 'Convocado';
  }
  if (situacao === 'Ativo') {
    return 'Matriculado';
  }
  if (situacao === 'Cancelado na confirmacao') {
    return 'Cancelado na confirmação';
  }
  return situacao;
}

export function classeSituacao(situacao: string): string {
  switch (situacao) {
    case 'Lista de espera':
      return 'sit sit-espera';
    case 'Selecionado':
    case 'Selecionado da lista':
      return 'sit sit-convocado';
    case 'Confirmado':
    case 'Ativo':
      return 'sit sit-confirmado';
    case 'Cancelado pelo sistema':
      return 'sit sit-sistema';
    default:
      return 'sit sit-neutro';
  }
}

export function diasEntre(inicio: string | Date, fim = new Date()): number {
  return Math.floor((fim.getTime() - new Date(inicio).getTime()) / 86_400_000);
}

/** Texto de prazo com a cor que o design system pede: vencido, hoje, em dia. */
export function prazo(prazoFim: string | Date | null) {
  if (!prazoFim) {
    return { classe: 'prazo prazo-ok', texto: '—' };
  }
  const dias = Math.ceil((new Date(prazoFim).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) {
    const vencidos = Math.abs(dias);
    return {
      classe: 'prazo prazo-vencido',
      texto: vencidos === 1 ? 'vencido ontem' : `vencido há ${vencidos} dias`,
    };
  }
  if (dias === 0) {
    return { classe: 'prazo prazo-hoje', texto: 'vence hoje' };
  }
  return { classe: 'prazo prazo-ok', texto: dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias` };
}

/**
 * Textos das dicas. Vêm das regras do processo de Inscrição Creche da SME —
 * mexer na redação é seguro, mudar o significado não é.
 */
export const DICAS = {
  confirmados:
    'Número de alunos cujo responsável confirmou (via WhatsApp, e-mail e/ou SMS) estar ciente de que deverá comparecer à escola para efetivar a matrícula até a data sinalizada na mensagem.',
  contatoDesatualizado:
    'A mensagem enviada por este canal não foi entregue. Atualize o contato da família antes da próxima tentativa.',
  convocados:
    'Alunos que receberam contato automático da escola para preenchimento da vaga, com prazo de 3 dias úteis para matrícula.',
  estadoDuplo:
    'Uma opção deste cadastro está "Selecionada" enquanto outra segue em "Lista de espera" — verificar antes de agir.',
  matriculados: 'Número de alunos que efetivaram a matrícula após a convocação.',
  pontuacao:
    'Soma dos pesos dos critérios socioeconômicos respondidos na inscrição, conforme a régua vigente daquele processo. Os pesos mudam a cada ano — não compare pontuações de processos diferentes diretamente.',
  prazoVencido:
    'O prazo de 3 dias úteis venceu e a família não respondeu — a opção vai expirar automaticamente.',
  sinalizacoes:
    'Alertas automáticos gerados pelo sistema: prazo vencendo, contato desatualizado, ou inconsistência entre opções do mesmo cadastro.',
} as const;

/** Dica de cada situação, na linguagem do processo. */
export function dicaSituacao(situacao: string): string {
  switch (situacao) {
    case 'Lista de espera':
      return 'Opção ainda não chamada. A ordem é definida pela pontuação da régua vigente do processo.';
    case 'Selecionado':
    case 'Selecionado da lista':
      return 'A vaga abriu e o sistema chamou esta criança. A família tem até 3 dias úteis para confirmar.';
    case 'Confirmado':
      return 'A família confirmou o interesse na vaga dentro do prazo.';
    case 'Ativo':
      return 'A matrícula foi efetivada na unidade.';
    case 'Cancelado':
      return 'A família sinalizou que não tem mais interesse na vaga.';
    case 'Cancelado na confirmacao':
      return 'As demais opções do mesmo cadastro foram canceladas automaticamente porque a família confirmou matrícula em outra unidade.';
    case 'Cancelado pelo sistema':
      return 'A família não respondeu dentro do prazo e a opção expirou automaticamente.';
    default:
      return situacao;
  }
}
