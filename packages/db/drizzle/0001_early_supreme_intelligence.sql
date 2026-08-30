ALTER TABLE "opcao" ALTER COLUMN "unidade_id" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "unidade" ALTER COLUMN "esc_codigo" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "unidade_id" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "vaga" ALTER COLUMN "unidade_id" SET DATA TYPE varchar(10);