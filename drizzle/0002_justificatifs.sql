ALTER TYPE "public"."type_notification" ADD VALUE 'JUSTIFICATIF_DEPOSE';--> statement-breakpoint
CREATE TABLE "justificatif" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"conge_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille" integer NOT NULL,
	"cle" text NOT NULL,
	"confirme_le" timestamp with time zone,
	"depose_par" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "justificatif" ADD CONSTRAINT "justificatif_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif" ADD CONSTRAINT "justificatif_conge_id_conge_absence_id_fk" FOREIGN KEY ("conge_id") REFERENCES "public"."conge_absence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justificatif" ADD CONSTRAINT "justificatif_depose_par_utilisateur_id_fk" FOREIGN KEY ("depose_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "justificatif_conge_idx" ON "justificatif" USING btree ("conge_id");--> statement-breakpoint
ALTER TABLE "justificatif" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "justificatif" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "justificatif_tenant" ON "justificatif" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
