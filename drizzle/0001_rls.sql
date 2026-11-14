-- Row Level Security : isolation des organisations clientes au niveau de la base.
--
-- Chaque transaction applicative positionne `app.organisation_id` (set_config(..., true)) via
-- src/db/tenant.ts. Sans ce paramètre, AUCUNE ligne n'est visible ni modifiable.
-- `app.bypass_rls = 'on'` n'est utilisé que là où l'organisation n'est pas encore connue
-- (connexion, pointeuse reconnue par son numéro de série) et pour l'exploitation
-- (plateforme, tâche quotidienne).
--
-- FORCE ROW LEVEL SECURITY : les policies s'appliquent aussi au propriétaire des tables,
-- c'est-à-dire au rôle utilisé par l'application.

CREATE OR REPLACE FUNCTION app_organisation_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organisation_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_bypass_rls() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), 'off') = 'on'
$$;
--> statement-breakpoint
ALTER TABLE "organisation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organisation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "organisation_tenant" ON "organisation" FOR ALL
  USING (app_bypass_rls() OR "id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "salarie" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "salarie" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "salarie_tenant" ON "salarie" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "utilisateur" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "utilisateur" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "utilisateur_tenant" ON "utilisateur" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "pointeuse" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pointeuse" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pointeuse_tenant" ON "pointeuse" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "badgeage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "badgeage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "badgeage_tenant" ON "badgeage" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "pointage_semaine" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pointage_semaine" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pointage_semaine_tenant" ON "pointage_semaine" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "conge_absence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conge_absence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conge_absence_tenant" ON "conge_absence" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notification_tenant" ON "notification" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "journal_acces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "journal_acces" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "journal_acces_tenant" ON "journal_acces" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "session_tenant" ON "session" FOR ALL
  USING (app_bypass_rls() OR EXISTS (SELECT 1 FROM "utilisateur" u WHERE u."id" = "session"."utilisateur_id" AND u."organisation_id" = app_organisation_id()))
  WITH CHECK (app_bypass_rls() OR EXISTS (SELECT 1 FROM "utilisateur" u WHERE u."id" = "session"."utilisateur_id" AND u."organisation_id" = app_organisation_id()));
