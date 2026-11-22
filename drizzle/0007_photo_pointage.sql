ALTER TABLE "organisation" ADD COLUMN "tablette_photo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pointage_tablette" ADD COLUMN "photo_cle" text;