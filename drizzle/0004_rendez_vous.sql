CREATE TABLE "rendez_vous" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"intitule" text NOT NULL,
	"jour" date NOT NULL,
	"heure" text,
	"precision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rendez_vous_salarie_idx" ON "rendez_vous" USING btree ("salarie_id","jour");--> statement-breakpoint
ALTER TABLE "rendez_vous" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rendez_vous" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rendez_vous_tenant" ON "rendez_vous" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
