import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';

export type Provedor = 'anthropic' | 'bedrock' | 'fallback';

export function provedor(): Provedor {
  const escolha = (process.env.AI_PROVIDER ?? 'fallback') as Provedor;
  if (escolha === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    return 'fallback';
  }
  if (escolha === 'bedrock' && !(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE)) {
    return 'fallback';
  }
  return escolha;
}

/** O PRD pede Claude Sonnet; trocar por variável de ambiente. */
export const MODELO = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
export const MODELO_BEDROCK = process.env.BEDROCK_MODEL_ID ?? `anthropic.${MODELO}`;

let _anthropic: Anthropic | null = null;
let _bedrock: AnthropicBedrockMantle | null = null;

export function cliente() {
  const p = provedor();
  if (p === 'bedrock') {
    _bedrock ??= new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION ?? 'sa-east-1' });
    return { modelo: MODELO_BEDROCK, sdk: _bedrock, tipo: 'bedrock' as const };
  }
  if (p === 'anthropic') {
    // Chave vinculada a identidade exige o workspace no cabeçalho; a antiga, não.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
    _anthropic ??= new Anthropic(
      workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}
    );
    return { modelo: MODELO, sdk: _anthropic, tipo: 'anthropic' as const };
  }
  return null;
}

/** Falha de IA não pode sumir: sem isso, chave errada vira fallback silencioso. */
export function avisarFalhaDaIa(onde: string, erro: unknown) {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  process.stderr.write(`[ia] ${onde} caiu para a regra local: ${mensagem}\n`);
}

/** Uma chamada de texto simples; devolve null quando não há credencial. */
export async function conversar(args: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  const c = cliente();
  if (!c) {
    return null;
  }

  const resposta = await c.sdk.messages.create({
    max_tokens: args.maxTokens ?? 1200,
    messages: [{ content: args.prompt, role: 'user' }],
    model: c.modelo,
    system: args.system,
  });

  if (resposta.stop_reason === 'refusal') {
    return null;
  }

  return resposta.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n')
    .trim();
}

/** Extrai o primeiro objeto JSON da resposta, tolerando cerca de código. */
export function extrairJson<T>(texto: string | null): T | null {
  if (!texto) {
    return null;
  }
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '');
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) {
    return null;
  }
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1)) as T;
  } catch {
    return null;
  }
}
