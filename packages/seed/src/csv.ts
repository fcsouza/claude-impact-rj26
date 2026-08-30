import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

/**
 * Leitor de linha para os CSVs do dadoscreche: separador `;`, UTF-8 com BOM,
 * campos entre aspas quando têm espaço. Streamado porque a Query B tem 4,3 milhões de linhas.
 */
/** BOM do UTF-8 que o exportador da SME deixa na primeira linha. */
const BOM = /^\ufeff/;

export async function* lerCsv(
  caminho: string,
  opcoes: { comCabecalho?: boolean } = {}
): AsyncGenerator<string[]> {
  const bruto = createReadStream(caminho);
  const fluxo = caminho.endsWith('.gz') ? bruto.pipe(createGunzip()) : bruto;
  const linhas = createInterface({ crlfDelay: Number.POSITIVE_INFINITY, input: fluxo });

  let primeira = true;
  for await (const linha of linhas) {
    const limpa = primeira ? linha.replace(BOM, '') : linha;
    if (primeira) {
      primeira = false;
      if (opcoes.comCabecalho !== false) {
        continue;
      }
    }
    if (!limpa.trim()) {
      continue;
    }
    yield dividir(limpa);
  }
}

export async function cabecalho(caminho: string): Promise<string[]> {
  for await (const colunas of lerCsv(caminho, { comCabecalho: false })) {
    return colunas;
  }
  return [];
}

function dividir(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let entreAspas = false;

  for (const caractere of linha) {
    if (caractere === '"') {
      entreAspas = !entreAspas;
      continue;
    }
    if (caractere === ';' && !entreAspas) {
      campos.push(atual.trim());
      atual = '';
      continue;
    }
    atual += caractere;
  }
  campos.push(atual.trim());
  return campos;
}
