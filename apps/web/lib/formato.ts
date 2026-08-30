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

/** O sistema grava `Selecionado`; a tela chama de Convocado, como no design system. */
export function rotuloSituacao(situacao: string): string {
  return situacao === 'Selecionado' || situacao === 'Selecionado da lista' ? 'Convocado' : situacao;
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
    return { classe: 'prazo prazo-vencido', texto: `vencido há ${Math.abs(dias)}d` };
  }
  if (dias === 0) {
    return { classe: 'prazo prazo-hoje', texto: 'vence hoje' };
  }
  return { classe: 'prazo prazo-ok', texto: `faltam ${dias}d` };
}
