/** Identificadores legíveis: prefixo do domínio + tempo + aleatório. */
export function id(prefixo: string): string {
  const tempo = Date.now().toString(36);
  const aleatorio = Math.random().toString(36).slice(2, 10);
  return `${prefixo}_${tempo}${aleatorio}`;
}
