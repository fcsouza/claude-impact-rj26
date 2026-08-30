CREATE TYPE "public"."canal" AS ENUM('whatsapp', 'sms', 'email', 'telefone', 'presencial');--> statement-breakpoint
CREATE TYPE "public"."classificacao" AS ENUM('confirma', 'extensao', 'desiste', 'duvida', 'outro');--> statement-breakpoint
CREATE TYPE "public"."origem_tentativa" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."origem_ia" AS ENUM('claude', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('unidade', 'cre');--> statement-breakpoint
CREATE TYPE "public"."situacao" AS ENUM('Lista de espera', 'Selecionado', 'Selecionado da lista', 'Ativo', 'Confirmado', 'Cancelado', 'Cancelado na confirmacao', 'Cancelado pelo sistema');--> statement-breakpoint
CREATE TYPE "public"."status_convocacao" AS ENUM('aberta', 'confirmada', 'expirada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."status_tentativa" AS ENUM('agendada', 'enviado', 'entregue', 'lido', 'falhou', 'respondido');--> statement-breakpoint
CREATE TYPE "public"."status_vaga" AS ENUM('aberta', 'preenchida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."turno" AS ENUM('Integral', 'Parcial');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contato" (
	"id" text PRIMARY KEY NOT NULL,
	"inscricao_id" text NOT NULL,
	"telefone" text,
	"whatsapp" text,
	"email" text,
	"melhor_horario" text,
	"obs" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"autor_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convocacao" (
	"id" text PRIMARY KEY NOT NULL,
	"opcao_id" text NOT NULL,
	"vaga_id" text,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"prazo_fim" timestamp with time zone NOT NULL,
	"extensoes" integer DEFAULT 0 NOT NULL,
	"status" "status_convocacao" DEFAULT 'aberta' NOT NULL,
	"encerrada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cre" (
	"id" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criterio" (
	"id" text PRIMARY KEY NOT NULL,
	"ano" integer NOT NULL,
	"prm_id" integer NOT NULL,
	"ich_perg_id" integer NOT NULL,
	"perg_id" integer NOT NULL,
	"texto" text NOT NULL,
	"ordem" integer NOT NULL,
	"pontos" integer NOT NULL,
	"desempate" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evento_auditoria" (
	"id" text PRIMARY KEY NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text NOT NULL,
	"acao" text NOT NULL,
	"motivo" text,
	"antes_json" jsonb,
	"depois_json" jsonb,
	"autor_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inscricao" (
	"id" text PRIMARY KEY NOT NULL,
	"ano" integer NOT NULL,
	"prm_id" integer NOT NULL,
	"aluno_anon" text NOT NULL,
	"nome_ficticio" text NOT NULL,
	"responsavel_anon" text NOT NULL,
	"responsavel_ficticio" text NOT NULL,
	"nascimento_anomes" varchar(7) NOT NULL,
	"sexo" varchar(1) NOT NULL,
	"bairro" text,
	"cep" varchar(8),
	"bairro_corrigido" text,
	"cep_corrigido" varchar(8),
	"corrigido_por_cre" boolean DEFAULT false NOT NULL,
	"data_criacao" timestamp with time zone NOT NULL,
	"pontuacao_total" integer DEFAULT 0 NOT NULL,
	"criterios_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "mensagem_inbound" (
	"id" text PRIMARY KEY NOT NULL,
	"convocacao_id" text,
	"canal" "canal" NOT NULL,
	"remetente" text,
	"texto" text NOT NULL,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL,
	"classificacao" "classificacao",
	"confianca" real,
	"trecho_chave" text,
	"acao_sugerida" text,
	"rascunho_resposta" text,
	"origem_ia" "origem_ia",
	"acao_aplicada" boolean DEFAULT false NOT NULL,
	"aplicada_por" text,
	"aplicada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nota" (
	"id" text PRIMARY KEY NOT NULL,
	"inscricao_id" text NOT NULL,
	"texto" text NOT NULL,
	"autor_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opcao" (
	"id" text PRIMARY KEY NOT NULL,
	"inscricao_id" text NOT NULL,
	"ordem" integer NOT NULL,
	"unidade_id" varchar(7) NOT NULL,
	"grupamento" text NOT NULL,
	"turno" "turno" NOT NULL,
	"situacao" "situacao" NOT NULL,
	"situacao_atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tentativa" (
	"id" text PRIMARY KEY NOT NULL,
	"convocacao_id" text NOT NULL,
	"canal" "canal" NOT NULL,
	"origem" "origem_tentativa" DEFAULT 'auto' NOT NULL,
	"status" "status_tentativa" DEFAULT 'agendada' NOT NULL,
	"dia" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"destino" text,
	"payload_json" jsonb,
	"resultado" text,
	"autor_id" text,
	"agendada_para" timestamp with time zone,
	"executada_em" timestamp with time zone,
	"chave_idempotencia" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidade" (
	"esc_codigo" varchar(7) PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text,
	"bairro" text,
	"cep" varchar(8),
	"cre_id" integer,
	"latitude" real,
	"longitude" real
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"papel" "papel" DEFAULT 'unidade' NOT NULL,
	"unidade_id" varchar(7),
	"cre_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vaga" (
	"id" text PRIMARY KEY NOT NULL,
	"unidade_id" varchar(7) NOT NULL,
	"turno" "turno" NOT NULL,
	"grupamento" text NOT NULL,
	"status" "status_vaga" DEFAULT 'aberta' NOT NULL,
	"aberta_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aberta_por" text,
	"preenchida_por_opcao_id" text
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato" ADD CONSTRAINT "contato_inscricao_id_inscricao_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."inscricao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contato" ADD CONSTRAINT "contato_autor_id_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocacao" ADD CONSTRAINT "convocacao_opcao_id_opcao_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."opcao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convocacao" ADD CONSTRAINT "convocacao_vaga_id_vaga_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vaga"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_auditoria" ADD CONSTRAINT "evento_auditoria_autor_id_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem_inbound" ADD CONSTRAINT "mensagem_inbound_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "public"."convocacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem_inbound" ADD CONSTRAINT "mensagem_inbound_aplicada_por_user_id_fk" FOREIGN KEY ("aplicada_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota" ADD CONSTRAINT "nota_inscricao_id_inscricao_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."inscricao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota" ADD CONSTRAINT "nota_autor_id_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opcao" ADD CONSTRAINT "opcao_inscricao_id_inscricao_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."inscricao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opcao" ADD CONSTRAINT "opcao_unidade_id_unidade_esc_codigo_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("esc_codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentativa" ADD CONSTRAINT "tentativa_convocacao_id_convocacao_id_fk" FOREIGN KEY ("convocacao_id") REFERENCES "public"."convocacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentativa" ADD CONSTRAINT "tentativa_autor_id_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unidade" ADD CONSTRAINT "unidade_cre_id_cre_id_fk" FOREIGN KEY ("cre_id") REFERENCES "public"."cre"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_unidade_id_unidade_esc_codigo_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("esc_codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_cre_id_cre_id_fk" FOREIGN KEY ("cre_id") REFERENCES "public"."cre"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaga" ADD CONSTRAINT "vaga_unidade_id_unidade_esc_codigo_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("esc_codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaga" ADD CONSTRAINT "vaga_aberta_por_user_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contato_versao_idx" ON "contato" USING btree ("inscricao_id","versao");--> statement-breakpoint
CREATE INDEX "convocacao_status_idx" ON "convocacao" USING btree ("status","prazo_fim");--> statement-breakpoint
CREATE UNIQUE INDEX "criterio_ano_perg_idx" ON "criterio" USING btree ("ano","ich_perg_id");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "evento_auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_data_idx" ON "evento_auditoria" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "inscricao_aluno_idx" ON "inscricao" USING btree ("aluno_anon");--> statement-breakpoint
CREATE INDEX "inscricao_pontuacao_idx" ON "inscricao" USING btree ("pontuacao_total");--> statement-breakpoint
CREATE INDEX "inbound_convocacao_idx" ON "mensagem_inbound" USING btree ("convocacao_id");--> statement-breakpoint
CREATE INDEX "nota_inscricao_idx" ON "nota" USING btree ("inscricao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opcao_inscricao_ordem_idx" ON "opcao" USING btree ("inscricao_id","ordem");--> statement-breakpoint
CREATE INDEX "opcao_fila_idx" ON "opcao" USING btree ("unidade_id","turno","grupamento","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "tentativa_idempotencia_idx" ON "tentativa" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX "tentativa_convocacao_idx" ON "tentativa" USING btree ("convocacao_id");--> statement-breakpoint
CREATE INDEX "tentativa_provider_idx" ON "tentativa" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "unidade_cre_idx" ON "unidade" USING btree ("cre_id");--> statement-breakpoint
CREATE INDEX "vaga_unidade_idx" ON "vaga" USING btree ("unidade_id","status");