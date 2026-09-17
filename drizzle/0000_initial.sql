CREATE TYPE "public"."resultat_tentative" AS ENUM('OK', 'BADGE_INCONNU', 'PIN_INCORRECT', 'VERROUILLE', 'RATE_LIMIT');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('GERANT', 'SALARIE');--> statement-breakpoint
CREATE TYPE "public"."source_pointage" AS ENUM('KIOSQUE', 'KIOSQUE_HORS_LIGNE', 'SAISIE_MANUELLE');--> statement-breakpoint
CREATE TYPE "public"."statut_anomalie" AS ENUM('OUVERTE', 'TRAITEE', 'IGNOREE');--> statement-breakpoint
CREATE TYPE "public"."type_anomalie" AS ENUM('OUBLI_SORTIE', 'DOUBLE_SCAN', 'HORS_PLAGE', 'REPOS_11H', 'REPOS_HEBDO', 'PAUSE_MANQUANTE', 'AMPLITUDE', 'PIN_VERROUILLE', 'POINTAGE_HORS_LIGNE');--> statement-breakpoint
CREATE TYPE "public"."type_pointage" AS ENUM('ENTREE', 'SORTIE', 'DEBUT_PAUSE', 'FIN_PAUSE');--> statement-breakpoint
CREATE TABLE "anomalie" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"date_jour" date NOT NULL,
	"type" "type_anomalie" NOT NULL,
	"statut" "statut_anomalie" DEFAULT 'OUVERTE' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"traitee_par_id" uuid,
	"traitee_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pointage_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"auteur_id" uuid,
	"ancienne_valeur" jsonb NOT NULL,
	"nouvelle_valeur" jsonb NOT NULL,
	"motif" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etablissement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"adresse" text,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_acces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"utilisateur_id" uuid,
	"salarie_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raison_sociale" text NOT NULL,
	"siret" text,
	"convention_collective" text,
	"duree_hebdo_reference" integer DEFAULT 2100 NOT NULL,
	"paliers_heures_sup" jsonb DEFAULT '[{"seuilHeures":35,"taux":25},{"seuilHeures":43,"taux":50}]'::jsonb NOT NULL,
	"repos_quotidien_min" integer DEFAULT 660 NOT NULL,
	"repos_hebdo_min" integer DEFAULT 2100 NOT NULL,
	"pause_obligatoire_apres" integer DEFAULT 360 NOT NULL,
	"pause_duree_min" integer DEFAULT 20 NOT NULL,
	"amplitude_max" integer DEFAULT 780 NOT NULL,
	"journee_debut_heure" integer DEFAULT 4 NOT NULL,
	"anti_doublon_secondes" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pointage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"terminal_id" uuid,
	"horodatage_serveur" timestamp with time zone NOT NULL,
	"horodatage_terminal" timestamp with time zone,
	"offset_horloge_ms" integer,
	"horodatage_effectif" timestamp with time zone NOT NULL,
	"type" "type_pointage" NOT NULL,
	"source" "source_pointage" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"saisi_par_id" uuid,
	"motif" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recap_hebdo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"annee" integer NOT NULL,
	"semaine_iso" integer NOT NULL,
	"total_minutes" integer NOT NULL,
	"heures_sup_25" integer DEFAULT 0 NOT NULL,
	"heures_sup_50" integer DEFAULT 0 NOT NULL,
	"heures_sup_detail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail_jours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_object_key" text,
	"hash_sha256" text,
	"valide_le" timestamp with time zone,
	"valide_par_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salarie" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"matricule" text,
	"email" text,
	"etablissement_defaut_id" uuid,
	"badge_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"pin_hash" text NOT NULL,
	"pin_version" integer DEFAULT 1 NOT NULL,
	"pin_echecs" integer DEFAULT 0 NOT NULL,
	"pin_verrouille_jusqua" timestamp with time zone,
	"contrat_heures_hebdo" integer DEFAULT 2100 NOT NULL,
	"date_entree" date,
	"date_sortie" date,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentative_pointage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"terminal_id" uuid,
	"badge_uuid" uuid NOT NULL,
	"salarie_id" uuid,
	"resultat" "resultat_tentative" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"etablissement_id" uuid NOT NULL,
	"libelle" text NOT NULL,
	"token_hash" text,
	"code_appairage_hash" text,
	"code_appairage_expire_le" timestamp with time zone,
	"appaire_le" timestamp with time zone,
	"derniere_synchro" timestamp with time zone,
	"version_app" text,
	"identifiant_materiel" text,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"email" text NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"mot_de_passe_hash" text NOT NULL,
	"role" "role_utilisateur" NOT NULL,
	"salarie_id" uuid,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anomalie" ADD CONSTRAINT "anomalie_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalie" ADD CONSTRAINT "anomalie_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalie" ADD CONSTRAINT "anomalie_traitee_par_id_utilisateur_id_fk" FOREIGN KEY ("traitee_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction" ADD CONSTRAINT "correction_pointage_id_pointage_id_fk" FOREIGN KEY ("pointage_id") REFERENCES "public"."pointage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction" ADD CONSTRAINT "correction_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction" ADD CONSTRAINT "correction_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etablissement" ADD CONSTRAINT "etablissement_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces" ADD CONSTRAINT "journal_acces_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces" ADD CONSTRAINT "journal_acces_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces" ADD CONSTRAINT "journal_acces_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_etablissement_id_etablissement_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_terminal_id_terminal_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."terminal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage" ADD CONSTRAINT "pointage_saisi_par_id_utilisateur_id_fk" FOREIGN KEY ("saisi_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recap_hebdo" ADD CONSTRAINT "recap_hebdo_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recap_hebdo" ADD CONSTRAINT "recap_hebdo_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recap_hebdo" ADD CONSTRAINT "recap_hebdo_valide_par_id_utilisateur_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_etablissement_defaut_id_etablissement_id_fk" FOREIGN KEY ("etablissement_defaut_id") REFERENCES "public"."etablissement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentative_pointage" ADD CONSTRAINT "tentative_pointage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentative_pointage" ADD CONSTRAINT "tentative_pointage_terminal_id_terminal_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."terminal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentative_pointage" ADD CONSTRAINT "tentative_pointage_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal" ADD CONSTRAINT "terminal_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal" ADD CONSTRAINT "terminal_etablissement_id_etablissement_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anomalie_unique_jour_type_uidx" ON "anomalie" USING btree ("organisation_id","salarie_id","date_jour","type");--> statement-breakpoint
CREATE INDEX "anomalie_org_statut_idx" ON "anomalie" USING btree ("organisation_id","statut");--> statement-breakpoint
CREATE INDEX "correction_pointage_idx" ON "correction" USING btree ("pointage_id");--> statement-breakpoint
CREATE INDEX "correction_org_idx" ON "correction" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "etablissement_org_idx" ON "etablissement" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "journal_acces_org_date_idx" ON "journal_acces" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "pointage_org_salarie_horodatage_idx" ON "pointage" USING btree ("organisation_id","salarie_id","horodatage_effectif");--> statement-breakpoint
CREATE INDEX "pointage_org_horodatage_idx" ON "pointage" USING btree ("organisation_id","horodatage_effectif");--> statement-breakpoint
CREATE UNIQUE INDEX "pointage_idempotency_key_uidx" ON "pointage" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recap_hebdo_unique_uidx" ON "recap_hebdo" USING btree ("organisation_id","salarie_id","annee","semaine_iso");--> statement-breakpoint
CREATE INDEX "salarie_org_idx" ON "salarie" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salarie_badge_uuid_uidx" ON "salarie" USING btree ("badge_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "salarie_org_matricule_uidx" ON "salarie" USING btree ("organisation_id","matricule");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_uidx" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_utilisateur_idx" ON "session" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "tentative_terminal_date_idx" ON "tentative_pointage" USING btree ("terminal_id","created_at");--> statement-breakpoint
CREATE INDEX "tentative_badge_date_idx" ON "tentative_pointage" USING btree ("badge_uuid","created_at");--> statement-breakpoint
CREATE INDEX "terminal_org_idx" ON "terminal" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terminal_token_hash_uidx" ON "terminal" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "terminal_code_appairage_uidx" ON "terminal" USING btree ("code_appairage_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_uidx" ON "utilisateur" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "utilisateur_org_idx" ON "utilisateur" USING btree ("organisation_id");