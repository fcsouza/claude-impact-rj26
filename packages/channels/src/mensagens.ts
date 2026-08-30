/** Templates fixos do PRD (RF3.9): nome, unidade, endereço, prazo e instrução de resposta. */
export interface DadosConvocacao {
  endereco: string;
  grupamento: string;
  nomeCrianca: string;
  prazoFim: Date;
  turno: string;
  unidade: string;
}

const dataBR = (data: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).format(data);

export function textoWhatsapp(d: DadosConvocacao): string {
  return [
    'Prefeitura do Rio · Secretaria Municipal de Educação',
    '',
    `Há vaga de creche para ${d.nomeCrianca} na ${d.unidade}.`,
    `Turno ${d.turno}, ${d.grupamento}.`,
    `Endereço: ${d.endereco}`,
    '',
    `Compareça até ${dataBR(d.prazoFim)} para confirmar a matrícula.`,
    'Responda SIM para confirmar ou NAO para recusar a vaga.',
  ].join('\n');
}

export function textoSms(d: DadosConvocacao): string {
  return `SME-Rio: vaga de creche para ${d.nomeCrianca} na ${d.unidade} (${d.turno}). Confirme ate ${dataBR(d.prazoFim)}. Responda SIM para confirmar.`;
}

export function textoEmail(d: DadosConvocacao): { assunto: string; corpo: string } {
  return {
    assunto: `Vaga de creche para ${d.nomeCrianca} — confirme até ${dataBR(d.prazoFim)}`,
    corpo: [
      'Prezada família,',
      '',
      `Há uma vaga de creche para ${d.nomeCrianca} na ${d.unidade}, turno ${d.turno}, ${d.grupamento}.`,
      `Endereço: ${d.endereco}.`,
      '',
      `O prazo para comparecer e confirmar a matrícula termina em ${dataBR(d.prazoFim)}.`,
      'Responda a esta mensagem com SIM para confirmar ou NAO para recusar a vaga.',
      '',
      'Secretaria Municipal de Educação do Rio de Janeiro',
    ].join('\n'),
  };
}
