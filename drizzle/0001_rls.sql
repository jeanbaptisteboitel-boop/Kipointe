-- Row Level Security : isolation des tenants au niveau base de données (brief §5).
--
-- Chaque transaction applicative positionne `app.organisation_id` (set_config(..., true)) via
-- src/db/tenant.ts. Sans ce paramètre, AUCUNE ligne n'est visible ni modifiable.
-- `app.bypass_rls = 'on'` n'est utilisé que pour l'authentification (résolution d'un token
-- ou d'un email) et les tâches d'exploitation (purge, seed).
--
-- FORCE ROW LEVEL SECURITY : les policies s'appliquent aussi au propriétaire des tables,
-- c'est-à-dire au rôle Neon utilisé par l'application.

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

-- organisation : visible uniquement si c'est le tenant courant
ALTER TABLE "organisation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organisation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "organisation_tenant" ON "organisation" FOR ALL
  USING (app_bypass_rls() OR "id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "id" = app_organisation_id());
--> statement-breakpoint

-- Tables métier portant organisation_id
ALTER TABLE "etablissement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "etablissement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "etablissement_tenant" ON "etablissement" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint

ALTER TABLE "terminal" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "terminal" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "terminal_tenant" ON "terminal" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
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

-- session : rattachée à l'organisation via l'utilisateur
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "session_tenant" ON "session" FOR ALL
  USING (app_bypass_rls() OR EXISTS (SELECT 1 FROM "utilisateur" u WHERE u."id" = "session"."utilisateur_id" AND u."organisation_id" = app_organisation_id()))
  WITH CHECK (app_bypass_rls() OR EXISTS (SELECT 1 FROM "utilisateur" u WHERE u."id" = "session"."utilisateur_id" AND u."organisation_id" = app_organisation_id()));
--> statement-breakpoint

ALTER TABLE "pointage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pointage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pointage_tenant" ON "pointage" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint

ALTER TABLE "correction" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "correction" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "correction_tenant" ON "correction" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint

ALTER TABLE "anomalie" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anomalie" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "anomalie_tenant" ON "anomalie" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint

ALTER TABLE "recap_hebdo" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recap_hebdo" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "recap_hebdo_tenant" ON "recap_hebdo" FOR ALL
  USING (app_bypass_rls() OR "organisation_id" = app_organisation_id())
  WITH CHECK (app_bypass_rls() OR "organisation_id" = app_organisation_id());
--> statement-breakpoint

ALTER TABLE "tentative_pointage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tentative_pointage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tentative_pointage_tenant" ON "tentative_pointage" FOR ALL
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
