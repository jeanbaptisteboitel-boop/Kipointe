CREATE TABLE "pointage_tablette" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"tablette_id" uuid,
	"salarie_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"instant" timestamp with time zone NOT NULL,
	"jour" date NOT NULL,
	"heure" text NOT NULL,
	"type_applique" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tablette" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"jeton_hash" text,
	"activation_hash" text,
	"activation_expire" timestamp with time zone,
	"secret_qr" text NOT NULL,
	"echecs" integer DEFAULT 0 NOT NULL,
	"bloquee_jusqua" timestamp with time zone,
	"dernier_contact" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "tablette_code" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "tablette_qr" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "salarie" ADD COLUMN "code_pointage_hash" text;--> statement-breakpoint
ALTER TABLE "pointage_tablette" ADD CONSTRAINT "pointage_tablette_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage_tablette" ADD CONSTRAINT "pointage_tablette_tablette_id_tablette_id_fk" FOREIGN KEY ("tablette_id") REFERENCES "public"."tablette"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage_tablette" ADD CONSTRAINT "pointage_tablette_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tablette" ADD CONSTRAINT "tablette_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pointage_tablette_tablette_idx" ON "pointage_tablette" USING btree ("tablette_id","instant");--> statement-breakpoint
CREATE INDEX "pointage_tablette_salarie_idx" ON "pointage_tablette" USING btree ("salarie_id","instant");--> statement-breakpoint
CREATE UNIQUE INDEX "tablette_jeton_key" ON "tablette" USING btree ("jeton_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "tablette_activation_key" ON "tablette" USING btree ("activation_hash");--> statement-breakpoint
CREATE INDEX "tablette_org_idx" ON "tablette" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salarie_code_pointage_key" ON "salarie" USING btree ("organisation_id","code_pointage_hash");--> statement-breakpoint
ALTER TABLE "tablette" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tablette" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tablette_tenant" ON "tablette" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "pointage_tablette" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pointage_tablette" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pointage_tablette_tenant" ON "pointage_tablette" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
