CREATE TYPE "public"."etat_badgeage" AS ENUM('TRAITE', 'IGNORE', 'NON_RATTACHE', 'ECARTE');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('PLATEFORME', 'ADMIN', 'SALARIE');--> statement-breakpoint
CREATE TYPE "public"."statut_conge" AS ENUM('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');--> statement-breakpoint
CREATE TYPE "public"."statut_semaine" AS ENUM('EN_ATTENTE', 'VALIDE', 'MODIF_DEMANDEE');--> statement-breakpoint
CREATE TYPE "public"."type_conge" AS ENUM('CONGE_PAYE', 'ABSENCE_AUTORISEE', 'ABSENCE_NON_AUTORISEE', 'EVENEMENT_FAMILIAL', 'MALADIE', 'FORMATION');--> statement-breakpoint
CREATE TYPE "public"."type_notification" AS ENUM('HEURES_MANQUANTES', 'HEURES_SUP', 'ABSENCE_A_JUSTIFIER', 'POINTAGE_INCOMPLET', 'SEMAINE_A_VALIDER', 'MODIF_DEMANDEE', 'CONGE_DEMANDE', 'CONGE_DECISION', 'POINTEUSE_SILENCIEUSE', 'BADGE_NON_RATTACHE');--> statement-breakpoint
CREATE TABLE "badgeage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"pointeuse_id" uuid NOT NULL,
	"pin" text NOT NULL,
	"horodatage_local" text NOT NULL,
	"jour" date NOT NULL,
	"statut_appareil" integer,
	"verification" integer,
	"etat" "etat_badgeage" DEFAULT 'NON_RATTACHE' NOT NULL,
	"type_applique" text,
	"salarie_id" uuid,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"traite_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conge_absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"type" "type_conge" NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	"nb_jours" double precision,
	"demi_jour_debut" text,
	"demi_jour_fin" text,
	"motif" text,
	"statut" "statut_conge" DEFAULT 'EN_ATTENTE' NOT NULL,
	"cree_par" uuid,
	"decide_par" uuid,
	"decide_le" timestamp with time zone,
	"commentaire_decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"destinataire_salarie_id" uuid,
	"salarie_id" uuid,
	"type" "type_notification" NOT NULL,
	"titre" text NOT NULL,
	"message" text NOT NULL,
	"lien" text,
	"cle" text NOT NULL,
	"lu_le" timestamp with time zone,
	"email_envoye_le" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raison_sociale" text NOT NULL,
	"siret" text,
	"plateforme" boolean DEFAULT false NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"planning_defaut" jsonb,
	"seuil_ecart_minutes" integer DEFAULT 15 NOT NULL,
	"notifications_email" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pointage_semaine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"salarie_id" uuid NOT NULL,
	"semaine_debut" date NOT NULL,
	"semaine_fin" date NOT NULL,
	"total_minutes" integer DEFAULT 0 NOT NULL,
	"jours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statut" "statut_semaine" DEFAULT 'EN_ATTENTE' NOT NULL,
	"commentaire" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pointeuse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"numero_serie" text NOT NULL,
	"nom" text,
	"actif" boolean DEFAULT true NOT NULL,
	"mode_statut" text DEFAULT 'AUTO' NOT NULL,
	"stamp_attlog" text,
	"derniere_connexion" timestamp with time zone,
	"dernier_pointage" timestamp with time zone,
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
	"pointeuse_ref" text,
	"planning" jsonb,
	"date_entree" date,
	"date_sortie" date,
	"actif" boolean DEFAULT true NOT NULL,
	"compteur_depart" date,
	"compteur_solde_depart_minutes" integer DEFAULT 0 NOT NULL,
	"cp_solde_jours" double precision,
	"cp_solde_au" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
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
	"mot_de_passe_provisoire" boolean DEFAULT false NOT NULL,
	"role" "role_utilisateur" NOT NULL,
	"salarie_id" uuid,
	"actif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "badgeage" ADD CONSTRAINT "badgeage_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badgeage" ADD CONSTRAINT "badgeage_pointeuse_id_pointeuse_id_fk" FOREIGN KEY ("pointeuse_id") REFERENCES "public"."pointeuse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badgeage" ADD CONSTRAINT "badgeage_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conge_absence" ADD CONSTRAINT "conge_absence_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conge_absence" ADD CONSTRAINT "conge_absence_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conge_absence" ADD CONSTRAINT "conge_absence_cree_par_utilisateur_id_fk" FOREIGN KEY ("cree_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conge_absence" ADD CONSTRAINT "conge_absence_decide_par_utilisateur_id_fk" FOREIGN KEY ("decide_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces" ADD CONSTRAINT "journal_acces_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces" ADD CONSTRAINT "journal_acces_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_acces" ADD CONSTRAINT "journal_acces_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_destinataire_salarie_id_salarie_id_fk" FOREIGN KEY ("destinataire_salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage_semaine" ADD CONSTRAINT "pointage_semaine_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointage_semaine" ADD CONSTRAINT "pointage_semaine_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pointeuse" ADD CONSTRAINT "pointeuse_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salarie" ADD CONSTRAINT "salarie_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_organisation_id_organisation_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_salarie_id_salarie_id_fk" FOREIGN KEY ("salarie_id") REFERENCES "public"."salarie"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "badgeage_idempotence_key" ON "badgeage" USING btree ("organisation_id","pin","horodatage_local");--> statement-breakpoint
CREATE INDEX "badgeage_etat_idx" ON "badgeage" USING btree ("organisation_id","etat");--> statement-breakpoint
CREATE INDEX "conge_org_statut_idx" ON "conge_absence" USING btree ("organisation_id","statut");--> statement-breakpoint
CREATE INDEX "conge_salarie_idx" ON "conge_absence" USING btree ("salarie_id","date_debut");--> statement-breakpoint
CREATE INDEX "journal_org_idx" ON "journal_acces" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_cle_key" ON "notification" USING btree ("organisation_id","cle");--> statement-breakpoint
CREATE INDEX "notification_dest_idx" ON "notification" USING btree ("organisation_id","destinataire_salarie_id","lu_le");--> statement-breakpoint
CREATE UNIQUE INDEX "pointage_semaine_key" ON "pointage_semaine" USING btree ("salarie_id","semaine_debut");--> statement-breakpoint
CREATE INDEX "pointage_semaine_org_idx" ON "pointage_semaine" USING btree ("organisation_id","semaine_debut");--> statement-breakpoint
CREATE UNIQUE INDEX "pointeuse_numero_serie_key" ON "pointeuse" USING btree ("numero_serie");--> statement-breakpoint
CREATE INDEX "pointeuse_org_idx" ON "pointeuse" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "salarie_org_idx" ON "salarie" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "salarie_pointeuse_ref_idx" ON "salarie" USING btree ("organisation_id","pointeuse_ref");--> statement-breakpoint
CREATE INDEX "session_utilisateur_idx" ON "session" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur" USING btree ("email");--> statement-breakpoint
CREATE INDEX "utilisateur_org_idx" ON "utilisateur" USING btree ("organisation_id");