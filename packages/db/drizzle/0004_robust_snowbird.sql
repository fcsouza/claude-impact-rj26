ALTER TYPE "public"."papel" ADD VALUE 'secretaria';--> statement-breakpoint
CREATE TABLE "capacidade" (
	"ano" integer NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fonte" text DEFAULT 'datalake' NOT NULL,
	"grupamento" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"matriculados" integer DEFAULT 0 NOT NULL,
	"turno" "turno" NOT NULL,
	"unidade_id" varchar(10) NOT NULL,
	"vagas" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capacidade" ADD CONSTRAINT "capacidade_unidade_id_unidade_esc_codigo_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("esc_codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capacidade_chave_idx" ON "capacidade" USING btree ("unidade_id","ano","grupamento","turno");--> statement-breakpoint
CREATE INDEX "capacidade_unidade_idx" ON "capacidade" USING btree ("unidade_id");