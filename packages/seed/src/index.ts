import { existsSync } from 'node:fs';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { auth } from '@fila-viva/auth';
import { somarDiasUteis } from '@fila-viva/core';
import {
  account,
  contato,
  convocacao,
  cre,
  criterio,
  db,
  eventoAuditoria,
  id,
  inscricao,
  mensagemInbound,
  nota,
  opcao,
  session,
  type Turno,
  tentativa,
  unidade,
  user,
  vaga,
} from '@fila-viva/db';
import { eq, sql } from 'drizzle-orm';
import { lerCsv } from './csv.ts';

faker.seed(195);

// O script roda com cwd em packages/seed; caminho relativo se resolve pela raiz do repo.
const RAIZ = new URL('../../../', import.meta.url).pathname;
const bruto = process.env.DADOSCRECHE_DIR ?? './.dados/dadoscreche';
const DIR = bruto.startsWith('/') ? bruto : `${RAIZ}${bruto.replace(/^\.\//, '')}`;
const ANO = Number(process.env.SEED_ANO ?? 2025);
const TELEFONES = (process.env.SEED_TELEFONES ?? '5521999990001,5521999990002,5521999990003')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

const BASES = `${DIR}/Bases IC_ ClassificadoseFila`;
const QUERY_A = `${BASES}/01_QueryA_InscricoesPorAno.csv.gz`;
const QUERY_B = `${BASES}/02_QueryB_RespostasSocioEconomicas.csv.gz`;
const QUERY_C = `${BASES}/03_QueryC_PerguntasComDescricao.csv`;
const QUERY_D = `${BASES}/04_UnidadesEscolaresComEndereco.csv`;

const SITUACOES_VIVAS = new Set(['Lista de espera', 'Selecionado', 'Ativo', 'Confirmado']);

function exigirArquivos() {
  const faltando = [QUERY_A, QUERY_B, QUERY_C, QUERY_D].filter((c) => !existsSync(c));
  if (faltando.length) {
    process.stderr.write(
      [
        'Bases do dadoscreche não encontradas:',
        ...faltando.map((f) => `  ${f}`),
        '',
        'Clone o repositório e aponte DADOSCRECHE_DIR:',
        '  git clone https://github.com/CIT-SME-RJ/dadoscreche .dados/dadoscreche',
        '',
      ].join('\n')
    );
    process.exit(1);
  }
}

interface LinhaOpcao {
  alunoAnon: string;
  bairro: string | null;
  cep: string | null;
  dataCriacao: Date;
  grupamento: string;
  inscricaoId: string;
  nascimento: string;
  ordem: number;
  prmId: number;
  responsavelAnon: string;
  sexo: string;
  situacao: string;
  turno: Turno;
  unidadeId: string;
}

async function limpar() {
  // Ordem inversa das dependências; o seed é reprodutível do zero (RNF6).
  // Sequencial de propósito: ordem inversa das dependências, uma tabela por vez.
  for (const tabela of [
    mensagemInbound,
    tentativa,
    convocacao,
    vaga,
    nota,
    contato,
    eventoAuditoria,
    opcao,
    inscricao,
    criterio,
    session,
    account,
    user,
    unidade,
    cre,
  ]) {
    await db.delete(tabela);
  }
}

async function carregarUnidades() {
  const linhas: (typeof unidade.$inferInsert)[] = [];
  // Query D não tem cabeçalho: a leitura começa na primeira linha de dado.
  for await (const c of lerCsv(QUERY_D, { comCabecalho: false })) {
    const codigo = c[1]?.padStart(7, '0');
    if (!codigo || codigo === 'NULL') {
      continue;
    }
    linhas.push({
      bairro: c[7] && c[7] !== 'NULL' ? c[7] : null,
      cep: c[8] && c[8] !== 'NULL' ? c[8].replace(/\D/g, '').slice(0, 8) : null,
      creId: Number(codigo.slice(0, 2)) || null,
      escCodigo: codigo,
      nome: c[2] ?? codigo,
      tipo: c[3] ?? null,
    });
  }

  const cres = [...new Set(linhas.map((l) => l.creId).filter((n): n is number => Boolean(n)))];
  await db.insert(cre).values(cres.map((n) => ({ id: n, nome: `${n}ª CRE` })));

  for (let i = 0; i < linhas.length; i += 500) {
    await db
      .insert(unidade)
      .values(linhas.slice(i, i + 500))
      .onConflictDoNothing();
  }
  process.stdout.write(`unidades: ${linhas.length}\n`);
  return new Map(linhas.map((l) => [l.escCodigo, l]));
}

async function carregarCriterios() {
  const linhas: (typeof criterio.$inferInsert)[] = [];
  for await (const c of lerCsv(QUERY_C)) {
    const ano = Number(c[0]);
    if (ano !== ANO) {
      continue;
    }
    linhas.push({
      ano,
      desempate: (c[8] ?? '').trim() === 'Sim',
      ichPergId: Number(c[2]),
      id: `crit_${ano}_${c[2]}`,
      ordem: Number(c[6] ?? 0),
      pergId: Number(c[3]),
      pontos: Number(c[7] ?? 0),
      prmId: Number(c[1]),
      texto: (c[4] ?? '').trim(),
    });
  }
  if (linhas.length) {
    await db.insert(criterio).values(linhas);
  }
  process.stdout.write(`régua ${ANO}: ${linhas.length} perguntas\n`);
  return new Map(linhas.map((l) => [l.ichPergId, l]));
}

async function escolherUnidades(mapaUnidades: Map<string, typeof unidade.$inferInsert>) {
  const contagem = new Map<string, number>();
  for await (const c of lerCsv(QUERY_A)) {
    if (Number(c[0]) !== ANO || !SITUACOES_VIVAS.has(c[16] ?? '')) {
      continue;
    }
    const codigo = c[5]?.padStart(7, '0') ?? '';
    contagem.set(codigo, (contagem.get(codigo) ?? 0) + 1);
  }

  const ordenadas = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  const escolhidas: string[] = [];
  const bairros = new Set<string>();

  for (const [codigo, total] of ordenadas) {
    const dados = mapaUnidades.get(codigo);
    const bairro = dados?.bairro ?? '';
    if (!dados || bairros.has(bairro)) {
      continue;
    }
    escolhidas.push(codigo);
    bairros.add(bairro);
    process.stdout.write(`unidade da demo: ${dados.nome} (${bairro}) — ${total} opções\n`);
    if (escolhidas.length === 2) {
      break;
    }
  }

  return escolhidas;
}

async function carregarInscricoes(unidadesDemo: string[]) {
  const alvo = new Set(unidadesDemo);
  const inscricoesAlvo = new Set<string>();

  // 1ª passada: quem tem opção viva em uma das unidades da demo.
  for await (const c of lerCsv(QUERY_A)) {
    if (Number(c[0]) !== ANO) {
      continue;
    }
    const codigo = c[5]?.padStart(7, '0') ?? '';
    if (alvo.has(codigo) && SITUACOES_VIVAS.has(c[16] ?? '')) {
      inscricoesAlvo.add(`${c[1]}-${c[2]}-${c[3]}`);
    }
  }

  // 2ª passada: todas as opções dessas inscrições, inclusive em outras unidades.
  const opcoes: LinhaOpcao[] = [];
  for await (const c of lerCsv(QUERY_A)) {
    if (Number(c[0]) !== ANO) {
      continue;
    }
    const inscricaoId = `${c[1]}-${c[2]}-${c[3]}`;
    if (!inscricoesAlvo.has(inscricaoId)) {
      continue;
    }
    opcoes.push({
      alunoAnon: c[10] ?? '',
      bairro: c[15] && c[15] !== 'NULL' ? c[15] : null,
      cep: c[14] && c[14] !== 'NULL' ? c[14].replace(/\D/g, '').slice(0, 8) : null,
      dataCriacao: new Date((c[9] ?? '').replace(' ', 'T')),
      grupamento: (c[7] ?? '').trim(),
      inscricaoId,
      nascimento: c[12] ?? '',
      ordem: Number(c[4]),
      prmId: Number(c[1]),
      responsavelAnon: c[13] ?? '',
      sexo: c[11] ?? 'F',
      situacao: c[16] ?? 'Lista de espera',
      turno: (c[8] === 'Parcial' ? 'Parcial' : 'Integral') as Turno,
      unidadeId: (c[5] ?? '').padStart(7, '0'),
    });
  }

  process.stdout.write(`inscrições: ${inscricoesAlvo.size} · opções: ${opcoes.length}\n`);
  return { inscricoesAlvo, opcoes };
}

async function carregarRespostas(
  inscricoesAlvo: Set<string>,
  regua: Map<number, typeof criterio.$inferInsert>
) {
  const porInscricao = new Map<
    string,
    {
      ichPergId: number;
      pergId: number;
      texto: string;
      pontos: number;
      resposta: string;
      confirmado: boolean;
    }[]
  >();

  for await (const c of lerCsv(QUERY_B)) {
    if (Number(c[0]) !== ANO) {
      continue;
    }
    const inscricaoId = `${c[1]}-${c[2]}-${c[3]}`;
    if (!inscricoesAlvo.has(inscricaoId)) {
      continue;
    }
    const ichPergId = Number(c[4]);
    const pergunta = regua.get(ichPergId);
    if (!pergunta) {
      continue;
    }
    const lista = porInscricao.get(inscricaoId) ?? [];
    lista.push({
      confirmado: (c[9] ?? '') === 'Sim',
      ichPergId,
      pergId: pergunta.pergId,
      pontos: pergunta.pontos,
      resposta: c[8] ?? 'Nao',
      texto: pergunta.texto,
    });
    porInscricao.set(inscricaoId, lista);
  }

  process.stdout.write(`respostas socioeconômicas: ${porInscricao.size} inscrições\n`);
  return porInscricao;
}

async function criarUsuarios(unidadesDemo: string[]) {
  const contas = [
    {
      creId: null,
      email: 'unidade1@filaviva.rio',
      nome: 'Direção da unidade 1',
      papel: 'unidade' as const,
      unidadeId: unidadesDemo[0] ?? null,
    },
    {
      creId: null,
      email: 'unidade2@filaviva.rio',
      nome: 'Direção da unidade 2',
      papel: 'unidade' as const,
      unidadeId: unidadesDemo[1] ?? null,
    },
    {
      creId: Number((unidadesDemo[0] ?? '01').slice(0, 2)) || 1,
      email: 'cre@filaviva.rio',
      nome: 'Equipe da CRE',
      papel: 'cre' as const,
      unidadeId: null,
    },
  ];

  for (const conta of contas) {
    await auth.api.signUpEmail({
      body: { email: conta.email, name: conta.nome, password: 'filaviva2026' },
    });
    await db
      .update(user)
      .set({ creId: conta.creId, papel: conta.papel, unidadeId: conta.unidadeId })
      .where(eq(user.email, conta.email));
  }

  process.stdout.write(
    'usuários: unidade1@filaviva.rio, unidade2@filaviva.rio, cre@filaviva.rio (senha filaviva2026)\n'
  );
}

async function main() {
  exigirArquivos();
  await limpar();

  const mapaUnidades = await carregarUnidades();
  const regua = await carregarCriterios();
  const unidadesDemo = await escolherUnidades(mapaUnidades);
  const { inscricoesAlvo, opcoes } = await carregarInscricoes(unidadesDemo);
  const respostas = await carregarRespostas(inscricoesAlvo, regua);

  const porInscricao = new Map<string, LinhaOpcao[]>();
  for (const o of opcoes) {
    porInscricao.set(o.inscricaoId, [...(porInscricao.get(o.inscricaoId) ?? []), o]);
  }

  const inscricoes: (typeof inscricao.$inferInsert)[] = [];
  const opcoesInsert: (typeof opcao.$inferInsert)[] = [];
  const contatos: (typeof contato.$inferInsert)[] = [];
  const nomesPorAluno = new Map<string, string>();
  let indiceTelefone = 0;

  for (const [inscricaoId, lista] of porInscricao) {
    const base = lista[0]!;
    const nome =
      nomesPorAluno.get(base.alunoAnon) ??
      `${faker.person.firstName(base.sexo === 'M' ? 'male' : 'female')} ${faker.person.lastName()}`;
    nomesPorAluno.set(base.alunoAnon, nome);

    const criterios = respostas.get(inscricaoId) ?? [];
    const pontuacao = criterios
      .filter((c) => c.resposta === 'Sim')
      .reduce((soma, c) => soma + c.pontos, 0);

    inscricoes.push({
      alunoAnon: base.alunoAnon,
      ano: ANO,
      bairro: base.bairro,
      cep: base.cep,
      criteriosJson: criterios,
      dataCriacao: base.dataCriacao,
      id: inscricaoId,
      nascimentoAnomes: base.nascimento,
      nomeFicticio: nome,
      pontuacaoTotal: pontuacao,
      prmId: base.prmId,
      responsavelAnon: base.responsavelAnon,
      responsavelFicticio: `${faker.person.firstName()} ${faker.person.lastName()}`,
      sexo: base.sexo,
    });

    for (const o of lista) {
      opcoesInsert.push({
        grupamento: o.grupamento,
        id: `${inscricaoId}-${o.ordem}`,
        inscricaoId,
        ordem: o.ordem,
        situacao: o.situacao as typeof opcao.$inferInsert.situacao,
        situacaoAtualizadaEm: o.dataCriacao,
        turno: o.turno,
        unidadeId: o.unidadeId,
      });
    }

    // Contatos fictícios apontando para os celulares do time (RNF4).
    const telefone = TELEFONES[indiceTelefone % TELEFONES.length] ?? '5521999990001';
    indiceTelefone += 1;
    contatos.push({
      criadoEm: base.dataCriacao,
      email: faker.internet.email({ provider: 'exemplo.rio' }).toLowerCase(),
      id: id('cont'),
      inscricaoId,
      melhorHorario: faker.helpers.arrayElement(['Manhã', 'Tarde', 'Depois das 18h']),
      telefone,
      versao: 1,
      whatsapp: telefone,
    });
  }

  for (let i = 0; i < inscricoes.length; i += 500) {
    await db.insert(inscricao).values(inscricoes.slice(i, i + 500));
  }
  for (let i = 0; i < opcoesInsert.length; i += 500) {
    await db
      .insert(opcao)
      .values(opcoesInsert.slice(i, i + 500))
      .onConflictDoNothing();
  }
  for (let i = 0; i < contatos.length; i += 500) {
    await db.insert(contato).values(contatos.slice(i, i + 500));
  }

  await criarUsuarios(unidadesDemo);
  await prepararDemo(unidadesDemo);

  process.stdout.write(
    `pronto: ${inscricoes.length} inscrições, ${opcoesInsert.length} opções, ${contatos.length} contatos\n`
  );
  process.exit(0);
}

/** Deixa a demo pronta: uma convocação vencida e uma inconsistência de cadastro. */
async function prepararDemo(unidadesDemo: string[]) {
  const [primeira] = unidadesDemo;
  if (!primeira) {
    return;
  }

  const candidatas = await db
    .select({ id: opcao.id, inscricaoId: opcao.inscricaoId })
    .from(opcao)
    .where(sql`${opcao.unidadeId} = ${primeira} and ${opcao.situacao} = 'Lista de espera'`)
    .limit(3);

  const vencida = candidatas[0];
  if (vencida) {
    const iniciada = new Date(Date.now() - 5 * 86_400_000);
    await db
      .update(opcao)
      .set({ situacao: 'Selecionado', situacaoAtualizadaEm: iniciada })
      .where(eq(opcao.id, vencida.id));

    const convocacaoId = id('conv');
    await db.insert(convocacao).values({
      id: convocacaoId,
      iniciadaEm: iniciada,
      opcaoId: vencida.id,
      prazoFim: somarDiasUteis(iniciada, 3),
      status: 'aberta',
    });

    await db.insert(tentativa).values(
      ['whatsapp', 'sms'].map((canal, indice) => ({
        canal: canal as 'whatsapp' | 'sms',
        chaveIdempotencia: `${convocacaoId}:${canal}:${indice}`,
        convocacaoId,
        destino: TELEFONES[0] ?? '5521999990001',
        dia: indice,
        executadaEm: new Date(iniciada.getTime() + indice * 86_400_000),
        id: id('tent'),
        origem: 'auto' as const,
        resultado: 'entregue pelo mock',
        status: 'entregue' as const,
      }))
    );

    process.stdout.write('demo: uma convocação com prazo vencido e duas tentativas registradas\n');
  }

  // Inconsistência do gap 2: mesma criança Selecionada aqui e na espera em outra opção.
  const outra = candidatas[1];
  if (outra) {
    const irmas = await db
      .select({ id: opcao.id })
      .from(opcao)
      .where(sql`${opcao.inscricaoId} = ${outra.inscricaoId} and ${opcao.id} <> ${outra.id}`)
      .limit(1);

    if (irmas[0]) {
      const marcadaEm = new Date(Date.now() - 3 * 86_400_000);
      await db
        .update(opcao)
        .set({ situacao: 'Selecionado', situacaoAtualizadaEm: marcadaEm })
        .where(eq(opcao.id, outra.id));
      await db.update(opcao).set({ situacao: 'Lista de espera' }).where(eq(opcao.id, irmas[0].id));
      process.stdout.write('demo: uma inconsistência de cadastro plantada para o painel\n');
    }
  }
}

await main();
