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
  diaDaRegua:
    'Dia da cadência de contato desde a convocação: D0 é WhatsApp, D1 WhatsApp e SMS, D2 SMS e e-mail.',
  estadoDuplo:
    'Uma opção deste cadastro está "Selecionada" enquanto outra segue em "Lista de espera" — verificar antes de agir.',
  leituraIa:
    'Leitura da resposta feita por Claude, com o trecho que a sustenta. Nenhuma situação muda por conta dela — quem aplica é o servidor.',
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

/** Ação de auditoria em português. O banco grava `situacao:abrir_vaga`; a tela lê gente. */
export function rotuloAcao(acao: string): string {
  const mapa: Record<string, string> = {
    abrir_vaga: 'Vaga aberta',
    contato: 'Contato atualizado',
    extensao_prazo: 'Prazo estendido',
    nota: 'Nota registrada',
    notificar_secretaria: 'Secretaria avisada',
    'situacao:abrir_vaga': 'Criança convocada',
    'situacao:confirmado_em_outra_opcao': 'Cancelada por matrícula em outra unidade',
    'situacao:desistiu': 'Cancelada por desistência',
    'situacao:manual': 'Situação mudada à mão',
    'situacao:nao_localizado': 'Cancelada por falta de contato',
    'situacao:prazo_vencido': 'Cancelada pelo prazo',
    'situacao:resposta_sim': 'Confirmada pela família',
  };
  return mapa[acao] ?? acao.replace(/[:_]/g, ' ');
}

/** Entidade de auditoria em português. */
export function rotuloEntidade(entidade: string): string {
  const mapa: Record<string, string> = {
    contato: 'contato',
    convocacao: 'convocação',
    inscricao: 'inscrição',
    nota: 'nota',
    opcao: 'opção na unidade',
  };
  return mapa[entidade] ?? entidade;
}

/** Leitura da IA sobre a resposta da família. */
export function rotuloClassificacao(classificacao: string): string {
  const mapa: Record<string, string> = {
    confirma: 'confirma a vaga',
    desiste: 'desiste da vaga',
    duvida: 'tem dúvida',
    extensao: 'pede mais prazo',
    outro: 'outro assunto',
  };
  return mapa[classificacao] ?? classificacao;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Valor de auditoria legível: data ISO vira data e hora, situação vira o rótulo
 * da tela, o resto passa direto.
 */
export function valorAuditoria(valor: unknown): string {
  if (valor === null || valor === undefined) {
    return '—';
  }
  const texto = String(valor);
  if (DATA_ISO.test(texto)) {
    return dataHora(texto);
  }
  return rotuloSituacao(texto);
}

/** Recorte de uma lista já carregada, com o total preservado para a paginação. */
export function paginar<T>(itens: T[], pagina: string | undefined, porPagina: number) {
  const ultima = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(Math.max(Number(pagina ?? 1) || 1, 1), ultima);
  return {
    itens: itens.slice((atual - 1) * porPagina, atual * porPagina),
    pagina: atual,
    porPagina,
    total: itens.length,
  };
}
