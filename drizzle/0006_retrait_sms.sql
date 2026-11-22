DROP TABLE "sms_pointage" CASCADE;--> statement-breakpoint
ALTER TABLE "organisation" DROP COLUMN "tablette_sms";--> statement-breakpoint
ALTER TABLE "organisation" DROP COLUMN "option_sms";--> statement-breakpoint
ALTER TABLE "salarie" DROP COLUMN "telephone";