CREATE TABLE "sms_pointage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"tablette_id" uuid,
	"code_hash" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"utilise_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "tablette_sms" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation" ADD COLUMN "option_sms" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "salarie" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "sms_pointage" ADD CONSTRAINT "sms_pointage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_pointage" ADD CONSTRAINT "sms_pointage_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_pointage" ADD CONSTRAINT "sms_pointage_tablette_id_tablette_id_fk" FOREIGN KEY ("tablette_id") REFERENCES "public"."tablette"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sms_pointage_org_idx" ON "sms_pointage" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_pointage_code_idx" ON "sms_pointage" USING btree ("organisation_id","code_hash");--> statement-breakpoint
ALTER TABLE "sms_pointage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sms_pointage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sms_pointage_tenant" ON "sms_pointage" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
