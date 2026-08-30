import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/* ---------------------------------------------------------------- enums */

/** Valores gravados pelo sistema de inscrição. `Cancelado na confirmacao` não leva cedilha. */
export const situacaoEnum = pgEnum('situacao', [
  'Lista de espera',
  'Selecionado',
  'Selecionado da lista',
  'Ativo',
  'Confirmado',
  'Cancelado',
  'Cancelado na confirmacao',
  'Cancelado pelo sistema',
]);

export const turnoEnum = pgEnum('turno', ['Integral', 'Parcial']);
export const papelEnum = pgEnum('papel', ['unidade', 'cre', 'secretaria']);
export const canalEnum = pgEnum('canal', ['whatsapp', 'sms', 'email', 'telefone', 'presencial']);
export const origemEnum = pgEnum('origem_tentativa', ['auto', 'manual']);
export const statusTentativaEnum = pgEnum('status_tentativa', [
  'agendada',
  'enviado',
  'entregue',
  'lido',
  'falhou',
  'respondido',
]);
export const statusConvocacaoEnum = pgEnum('status_convocacao', [
  'aberta',
  'confirmada',
  'expirada',
  'cancelada',
]);
export const statusVagaEnum = pgEnum('status_vaga', ['aberta', 'preenchida', 'cancelada']);
export const classificacaoEnum = pgEnum('classificacao', [
  'confirma',
  'extensao',
  'desiste',
  'duvida',
  'outro',
]);
export const origemIaEnum = pgEnum('origem_ia', ['claude', 'fallback']);

/* --------------------------------------------------------- territorial */

export const cre = pgTable('cre', {
  atualizadoEm: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
  id: integer().primaryKey(),
  nome: text().notNull(),
});

export const unidade = pgTable(
  'unidade',
  {
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    bairro: text(),
    cep: varchar({ length: 8 }),
    creId: integer().references(() => cre.id),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    // Query D traz códigos de 5 a 8 caracteres; Query A usa 7. Folga para não truncar.
    escCodigo: varchar({ length: 10 }).primaryKey(),
    latitude: real(),
    longitude: real(),
    nome: text().notNull(),
    tipo: text(),
  },
  (t) => [index('unidade_cre_idx').on(t.creId)]
);

/**
 * Capacidade instalada por unidade, grupamento e turno. Vem do datalake da cidade
 * (`datario.educacao_basica.turma`), não do sistema de inscrição — por isso fica em
 * tabela própria, com o ano da fonte. Quando está vazia, as telas mostram traço.
 */
export const capacidade = pgTable(
  'capacidade',
  {
    ano: integer().notNull(),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    fonte: text().default('datalake').notNull(),
    grupamento: text().notNull(),
    id: text().primaryKey(),
    matriculados: integer().default(0).notNull(),
    turno: turnoEnum().notNull(),
    unidadeId: varchar({ length: 10 })
      .notNull()
      .references(() => unidade.escCodigo),
    vagas: integer().default(0).notNull(),
  },
  (t) => [
    uniqueIndex('capacidade_chave_idx').on(t.unidadeId, t.ano, t.grupamento, t.turno),
    index('capacidade_unidade_idx').on(t.unidadeId),
  ]
);

/* -------------------------------------------------------- better auth */

export const user = pgTable('user', {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  creId: integer().references(() => cre.id),
  email: text().notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  id: text().primaryKey(),
  image: text(),
  name: text().notNull(),
  papel: papelEnum().default('unidade').notNull(),
  unidadeId: varchar({ length: 10 }).references(() => unidade.escCodigo),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable('session', {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  id: text().primaryKey(),
  ipAddress: text(),
  token: text().notNull().unique(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  accessToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  accountId: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  id: text().primaryKey(),
  idToken: text(),
  /** O core do Better Auth 1.7 grava o emissor da conta, inclusive na credencial local. */
  issuer: text(),
  password: text(),
  providerId: text().notNull(),
  refreshToken: text(),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const verification = pgTable('verification', {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  id: text().primaryKey(),
  identifier: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  value: text().notNull(),
});

/* ------------------------------------------------------------- régua */

/** Catálogo de perguntas do processo (Query C). Somente leitura na aplicação. */
export const criterio = pgTable(
  'criterio',
  {
    ano: integer().notNull(),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    desempate: boolean().default(false).notNull(),
    ichPergId: integer().notNull(),
    id: text().primaryKey(),
    ordem: integer().notNull(),
    pergId: integer().notNull(),
    pontos: integer().notNull(),
    prmId: integer().notNull(),
    texto: text().notNull(),
  },
  (t) => [uniqueIndex('criterio_ano_perg_idx').on(t.ano, t.ichPergId)]
);

/* -------------------------------------------------------- inscrição */

export const inscricao = pgTable(
  'inscricao',
  {
    alunoAnon: text().notNull(),
    ano: integer().notNull(),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    bairro: text(),
    bairroCorrigido: text(),
    cep: varchar({ length: 8 }),
    cepCorrigido: varchar({ length: 8 }),
    corrigidoPorCre: boolean().default(false).notNull(),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    criteriosJson:
      jsonb().$type<
        {
          ichPergId: number;
          pergId: number;
          texto: string;
          pontos: number;
          resposta: string;
          confirmado: boolean;
        }[]
      >(),
    dataCriacao: timestamp({ withTimezone: true }).notNull(),
    id: text().primaryKey(), // prm-plm-ipl
    nascimentoAnomes: varchar({ length: 7 }).notNull(),
    nomeFicticio: text().notNull(),
    pontuacaoTotal: integer().default(0).notNull(),
    prmId: integer().notNull(),
    responsavelAnon: text().notNull(),
    responsavelFicticio: text().notNull(),
    sexo: varchar({ length: 1 }).notNull(),
  },
  (t) => [
    index('inscricao_aluno_idx').on(t.alunoAnon),
    index('inscricao_pontuacao_idx').on(t.pontuacaoTotal),
  ]
);

export const opcao = pgTable(
  'opcao',
  {
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    grupamento: text().notNull(),
    id: text().primaryKey(),
    inscricaoId: text()
      .notNull()
      .references(() => inscricao.id, { onDelete: 'cascade' }),
    ordem: integer().notNull(),
    situacao: situacaoEnum().notNull(),
    situacaoAtualizadaEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    turno: turnoEnum().notNull(),
    unidadeId: varchar({ length: 10 })
      .notNull()
      .references(() => unidade.escCodigo),
  },
  (t) => [
    uniqueIndex('opcao_inscricao_ordem_idx').on(t.inscricaoId, t.ordem),
    index('opcao_fila_idx').on(t.unidadeId, t.turno, t.grupamento, t.situacao),
  ]
);

/** Contato versionado: nunca sobrescreve, sempre insere versão nova. */
export const contato = pgTable(
  'contato',
  {
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    autorId: text().references(() => user.id),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    email: text(),
    id: text().primaryKey(),
    inscricaoId: text()
      .notNull()
      .references(() => inscricao.id, { onDelete: 'cascade' }),
    melhorHorario: text(),
    obs: text(),
    telefone: text(),
    versao: integer().default(1).notNull(),
    whatsapp: text(),
  },
  (t) => [uniqueIndex('contato_versao_idx').on(t.inscricaoId, t.versao)]
);

export const vaga = pgTable(
  'vaga',
  {
    abertaEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    abertaPor: text().references(() => user.id),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    grupamento: text().notNull(),
    id: text().primaryKey(),
    preenchidaPorOpcaoId: text(),
    status: statusVagaEnum().default('aberta').notNull(),
    turno: turnoEnum().notNull(),
    unidadeId: varchar({ length: 10 })
      .notNull()
      .references(() => unidade.escCodigo),
  },
  (t) => [index('vaga_unidade_idx').on(t.unidadeId, t.status)]
);

export const convocacao = pgTable(
  'convocacao',
  {
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    encerradaEm: timestamp({ withTimezone: true }),
    extensoes: integer().default(0).notNull(),
    id: text().primaryKey(),
    iniciadaEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    opcaoId: text()
      .notNull()
      .references(() => opcao.id, { onDelete: 'cascade' }),
    prazoFim: timestamp({ withTimezone: true }).notNull(),
    status: statusConvocacaoEnum().default('aberta').notNull(),
    vagaId: text().references(() => vaga.id),
  },
  (t) => [
    index('convocacao_status_idx').on(t.status, t.prazoFim),
    // A fila junta convocação por opção a cada linha da tela.
    index('convocacao_opcao_idx').on(t.opcaoId),
  ]
);

export const tentativa = pgTable(
  'tentativa',
  {
    agendadaPara: timestamp({ withTimezone: true }),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    autorId: text().references(() => user.id),
    canal: canalEnum().notNull(),
    /** convocacaoId:canal:dia — barra o envio duplicado no mesmo dia. */
    chaveIdempotencia: text().notNull(),
    convocacaoId: text()
      .notNull()
      .references(() => convocacao.id, { onDelete: 'cascade' }),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    destino: text(),
    dia: integer().default(0).notNull(),
    executadaEm: timestamp({ withTimezone: true }),
    id: text().primaryKey(),
    origem: origemEnum().default('auto').notNull(),
    payloadJson: jsonb().$type<Record<string, unknown>>(),
    providerId: text(),
    resultado: text(),
    status: statusTentativaEnum().default('agendada').notNull(),
  },
  (t) => [
    uniqueIndex('tentativa_idempotencia_idx').on(t.chaveIdempotencia),
    index('tentativa_convocacao_idx').on(t.convocacaoId),
    index('tentativa_provider_idx').on(t.providerId),
  ]
);

export const mensagemInbound = pgTable(
  'mensagem_inbound',
  {
    acaoAplicada: boolean().default(false).notNull(),
    acaoSugerida: text(),
    aplicadaEm: timestamp({ withTimezone: true }),
    aplicadaPor: text().references(() => user.id),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    canal: canalEnum().notNull(),
    classificacao: classificacaoEnum(),
    confianca: real(),
    convocacaoId: text().references(() => convocacao.id, { onDelete: 'cascade' }),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    id: text().primaryKey(),
    origemIa: origemIaEnum(),
    rascunhoResposta: text(),
    recebidaEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    remetente: text(),
    texto: text().notNull(),
    trechoChave: text(),
  },
  (t) => [index('inbound_convocacao_idx').on(t.convocacaoId)]
);

export const nota = pgTable(
  'nota',
  {
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    autorId: text().references(() => user.id),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    id: text().primaryKey(),
    inscricaoId: text()
      .notNull()
      .references(() => inscricao.id, { onDelete: 'cascade' }),
    texto: text().notNull(),
  },
  (t) => [index('nota_inscricao_idx').on(t.inscricaoId)]
);

export const eventoAuditoria = pgTable(
  'evento_auditoria',
  {
    acao: text().notNull(),
    antesJson: jsonb().$type<Record<string, unknown> | null>(),
    atualizadoEm: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    autorId: text().references(() => user.id),
    criadoEm: timestamp({ withTimezone: true }).defaultNow().notNull(),
    depoisJson: jsonb().$type<Record<string, unknown> | null>(),
    entidade: text().notNull(),
    entidadeId: text().notNull(),
    id: text().primaryKey(),
    motivo: text(),
  },
  (t) => [
    index('auditoria_entidade_idx').on(t.entidade, t.entidadeId),
    index('auditoria_data_idx').on(t.criadoEm),
  ]
);

/* ------------------------------------------------------------ relations */

export const inscricaoRelations = relations(inscricao, ({ many }) => ({
  contatos: many(contato),
  notas: many(nota),
  opcoes: many(opcao),
}));

export const opcaoRelations = relations(opcao, ({ one, many }) => ({
  convocacoes: many(convocacao),
  inscricao: one(inscricao, { fields: [opcao.inscricaoId], references: [inscricao.id] }),
  unidade: one(unidade, { fields: [opcao.unidadeId], references: [unidade.escCodigo] }),
}));

export const convocacaoRelations = relations(convocacao, ({ one, many }) => ({
  inbounds: many(mensagemInbound),
  opcao: one(opcao, { fields: [convocacao.opcaoId], references: [opcao.id] }),
  tentativas: many(tentativa),
  vaga: one(vaga, { fields: [convocacao.vagaId], references: [vaga.id] }),
}));

export const tentativaRelations = relations(tentativa, ({ one }) => ({
  convocacao: one(convocacao, { fields: [tentativa.convocacaoId], references: [convocacao.id] }),
}));

export const unidadeRelations = relations(unidade, ({ one, many }) => ({
  cre: one(cre, { fields: [unidade.creId], references: [cre.id] }),
  opcoes: many(opcao),
}));

export type Situacao = (typeof situacaoEnum.enumValues)[number];
export type Turno = (typeof turnoEnum.enumValues)[number];
export type Canal = (typeof canalEnum.enumValues)[number];
export type Papel = (typeof papelEnum.enumValues)[number];
export type Classificacao = (typeof classificacaoEnum.enumValues)[number];
export type Opcao = typeof opcao.$inferSelect;
export type Inscricao = typeof inscricao.$inferSelect;
export type Convocacao = typeof convocacao.$inferSelect;
export type Tentativa = typeof tentativa.$inferSelect;
export type Usuario = typeof user.$inferSelect;
export type Capacidade = typeof capacidade.$inferSelect;
