/**
 * Schéma Drizzle — Kipointe.
 *
 * Multi-tenant par colonne `organisation_id` sur TOUTES les tables métier.
 * Les policies RLS (drizzle/0001_rls.sql) exigent que chaque transaction positionne
 * `app.organisation_id` (voir src/db/tenant.ts) : le filtrage applicatif est doublé
 * d'un filtrage base de données.
 *
 * Toutes les durées sont stockées en minutes (entiers), tous les horodatages en UTC.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ───────────────────────────── Enums ─────────────────────────────

export const typePointageEnum = pgEnum("type_pointage", ["ENTREE", "SORTIE", "DEBUT_PAUSE", "FIN_PAUSE"]);

export const sourcePointageEnum = pgEnum("source_pointage", ["KIOSQUE", "KIOSQUE_HORS_LIGNE", "SAISIE_MANUELLE"]);

export const typeAnomalieEnum = pgEnum("type_anomalie", [
  "OUBLI_SORTIE",
  "DOUBLE_SCAN",
  "HORS_PLAGE",
  "REPOS_11H",
  "REPOS_HEBDO",
  "PAUSE_MANQUANTE",
  "AMPLITUDE",
  "PIN_VERROUILLE",
  "POINTAGE_HORS_LIGNE",
]);

export const statutAnomalieEnum = pgEnum("statut_anomalie", ["OUVERTE", "TRAITEE", "IGNOREE"]);

export const roleUtilisateurEnum = pgEnum("role_utilisateur", ["GERANT", "SALARIE"]);

export const resultatTentativeEnum = pgEnum("resultat_tentative", [
  "OK",
  "BADGE_INCONNU",
  "PIN_INCORRECT",
  "VERROUILLE",
  "RATE_LIMIT",
]);

// ───────────────────────────── Types JSON ─────────────────────────────

/** Palier de majoration des heures supplémentaires : au-delà de `seuilHeures` h hebdo, taux `taux` %. */
export type PalierHeuresSup = { seuilHeures: number; taux: number };

/** Paliers légaux par défaut : +25 % de la 36e à la 43e heure, +50 % au-delà. */
export const PALIERS_HEURES_SUP_DEFAUT: PalierHeuresSup[] = [
  { seuilHeures: 35, taux: 25 },
  { seuilHeures: 43, taux: 50 },
];

/** Valeur portée par une correction (additive, jamais destructive). */
export type ValeurPointage = {
  horodatage?: string; // ISO 8601
  type?: "ENTREE" | "SORTIE" | "DEBUT_PAUSE" | "FIN_PAUSE";
  annule?: boolean;
};

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
};

// ───────────────────────────── Tenants ─────────────────────────────

export const organisation = pgTable("organisation", {
  id: uuid("id").primaryKey().defaultRandom(),
  raisonSociale: text("raison_sociale").notNull(),
  siret: text("siret"),
  conventionCollective: text("convention_collective"),
  /** Durée hebdomadaire de référence, en minutes (35 h = 2100). */
  dureeHebdoReference: integer("duree_hebdo_reference").notNull().default(2100),
  /** Paliers de majoration des heures supplémentaires (paramétrables selon la convention, ex. HCR). */
  paliersHeuresSup: jsonb("paliers_heures_sup").$type<PalierHeuresSup[]>().notNull().default(PALIERS_HEURES_SUP_DEFAUT),
  /** Repos quotidien minimal entre deux journées, en minutes (11 h). */
  reposQuotidienMin: integer("repos_quotidien_min").notNull().default(660),
  /** Repos hebdomadaire minimal consécutif, en minutes (35 h). */
  reposHebdoMin: integer("repos_hebdo_min").notNull().default(2100),
  /** Durée de travail continu au-delà de laquelle une pause est obligatoire, en minutes (6 h). */
  pauseObligatoireApres: integer("pause_obligatoire_apres").notNull().default(360),
  /** Durée minimale de cette pause, en minutes (20 min). */
  pauseDureeMin: integer("pause_duree_min").notNull().default(20),
  /** Amplitude quotidienne maximale, en minutes (13 h). */
  amplitudeMax: integer("amplitude_max").notNull().default(780),
  /** Heure locale (0-23) à laquelle commence une « journée » de pointage (service de nuit en restauration). */
  journeeDebutHeure: integer("journee_debut_heure").notNull().default(4),
  /** Deux pointages du même salarié à moins de N secondes : le second est refusé (rebond). */
  antiDoublonSecondes: integer("anti_doublon_secondes").notNull().default(60),
  ...timestamps,
});

// ───────────────────────────── Lieu de pointage ─────────────────────────────

export const etablissement = pgTable(
  "etablissement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    libelle: text("libelle").notNull(),
    adresse: text("adresse"),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("etablissement_org_idx").on(t.organisationId)],
);

// ───────────────────────────── Terminal physique ─────────────────────────────

export const terminal = pgTable(
  "terminal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    etablissementId: uuid("etablissement_id")
      .notNull()
      .references(() => etablissement.id, { onDelete: "restrict" }),
    libelle: text("libelle").notNull(),
    /** SHA-256 hex du token porteur remis à la tablette lors de l'appairage. Null tant que non appairé. */
    tokenHash: text("token_hash"),
    /** SHA-256 hex du code d'appairage à usage unique, et sa date d'expiration. */
    codeAppairageHash: text("code_appairage_hash"),
    codeAppairageExpireLe: timestamp("code_appairage_expire_le", { withTimezone: true, mode: "date" }),
    appaireLe: timestamp("appaire_le", { withTimezone: true, mode: "date" }),
    derniereSynchro: timestamp("derniere_synchro", { withTimezone: true, mode: "date" }),
    versionApp: text("version_app"),
    /** Identifiant matériel remonté par le wrapper Android (ANDROID_ID), informatif. */
    identifiantMateriel: text("identifiant_materiel"),
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("terminal_org_idx").on(t.organisationId),
    uniqueIndex("terminal_token_hash_uidx").on(t.tokenHash),
    uniqueIndex("terminal_code_appairage_uidx").on(t.codeAppairageHash),
  ],
);

// ───────────────────────────── Salariés ─────────────────────────────

export const salarie = pgTable(
  "salarie",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    prenom: text("prenom").notNull(),
    matricule: text("matricule"),
    email: text("email"),
    etablissementDefautId: uuid("etablissement_defaut_id").references(() => etablissement.id, {
      onDelete: "set null",
    }),
    /** Identifiant opaque encodé dans le badge (`BADGE:<uuid>`). Régénérable : l'ancien devient invalide. */
    badgeUuid: uuid("badge_uuid").notNull().defaultRandom(),
    /** PIN à 4 chiffres haché en Argon2id. Jamais en clair. */
    pinHash: text("pin_hash").notNull(),
    /** Incrémenté à chaque changement de PIN : permet aux tablettes d'invalider leur vérificateur hors ligne. */
    pinVersion: integer("pin_version").notNull().default(1),
    pinEchecs: integer("pin_echecs").notNull().default(0),
    pinVerrouilleJusqua: timestamp("pin_verrouille_jusqua", { withTimezone: true, mode: "date" }),
    /** Durée contractuelle hebdomadaire, en minutes. */
    contratHeuresHebdo: integer("contrat_heures_hebdo").notNull().default(2100),
    dateEntree: date("date_entree", { mode: "string" }),
    dateSortie: date("date_sortie", { mode: "string" }),
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("salarie_org_idx").on(t.organisationId),
    uniqueIndex("salarie_badge_uuid_uidx").on(t.badgeUuid),
    uniqueIndex("salarie_org_matricule_uidx").on(t.organisationId, t.matricule),
  ],
);

// ───────────────────────────── Utilisateurs & sessions ─────────────────────────────

export const utilisateur = pgTable(
  "utilisateur",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    nom: text("nom").notNull(),
    prenom: text("prenom").notNull(),
    motDePasseHash: text("mot_de_passe_hash").notNull(),
    role: roleUtilisateurEnum("role").notNull(),
    /** Pour un compte SALARIE : le salarié dont il peut consulter les pointages. */
    salarieId: uuid("salarie_id").references(() => salarie.id, { onDelete: "cascade" }),
    actif: boolean("actif").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("utilisateur_email_uidx").on(sql`lower(${t.email})`), index("utilisateur_org_idx").on(t.organisationId)],
);

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 hex du token stocké dans le cookie httpOnly. */
    tokenHash: text("token_hash").notNull(),
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateur.id, { onDelete: "cascade" }),
    expireLe: timestamp("expire_le", { withTimezone: true, mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("session_token_hash_uidx").on(t.tokenHash), index("session_utilisateur_idx").on(t.utilisateurId)],
);

// ───────────────────────────── Pointages : source de vérité, JAMAIS modifiée ─────────────────────────────

export const pointage = pgTable(
  "pointage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "restrict" }),
    etablissementId: uuid("etablissement_id")
      .notNull()
      .references(() => etablissement.id, { onDelete: "restrict" }),
    terminalId: uuid("terminal_id").references(() => terminal.id, { onDelete: "set null" }),
    /** Horloge serveur au moment de la réception (toujours renseignée). */
    horodatageServeur: timestamp("horodatage_serveur", { withTimezone: true, mode: "date" }).notNull(),
    /** Horloge de la tablette au moment du scan (mode hors ligne surtout). */
    horodatageTerminal: timestamp("horodatage_terminal", { withTimezone: true, mode: "date" }),
    /** Décalage tablette → serveur mesuré lors de la dernière synchronisation réussie (ms). */
    offsetHorlogeMs: integer("offset_horloge_ms"),
    /**
     * Heure retenue pour tous les calculs :
     *  - en ligne : horloge serveur ;
     *  - hors ligne : horloge tablette corrigée de l'offset.
     */
    horodatageEffectif: timestamp("horodatage_effectif", { withTimezone: true, mode: "date" }).notNull(),
    type: typePointageEnum("type").notNull(),
    source: sourcePointageEnum("source").notNull(),
    /** Généré par la tablette : anti-doublon lors du rejeu de la file hors ligne. */
    idempotencyKey: uuid("idempotency_key").notNull(),
    /** Pour une SAISIE_MANUELLE : utilisateur gérant à l'origine, et motif. */
    saisiParId: uuid("saisi_par_id").references(() => utilisateur.id, { onDelete: "set null" }),
    motif: text("motif"),
    ...timestamps,
  },
  (t) => [
    index("pointage_org_salarie_horodatage_idx").on(t.organisationId, t.salarieId, t.horodatageEffectif),
    index("pointage_org_horodatage_idx").on(t.organisationId, t.horodatageEffectif),
    uniqueIndex("pointage_idempotency_key_uidx").on(t.idempotencyKey),
  ],
);

// ───────────────────────────── Corrections : additives, jamais destructives ─────────────────────────────

export const correction = pgTable(
  "correction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pointageId: uuid("pointage_id")
      .notNull()
      .references(() => pointage.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    auteurId: uuid("auteur_id").references(() => utilisateur.id, { onDelete: "set null" }),
    ancienneValeur: jsonb("ancienne_valeur").$type<ValeurPointage>().notNull(),
    nouvelleValeur: jsonb("nouvelle_valeur").$type<ValeurPointage>().notNull(),
    motif: text("motif").notNull(),
    ...timestamps,
  },
  (t) => [index("correction_pointage_idx").on(t.pointageId), index("correction_org_idx").on(t.organisationId)],
);

// ───────────────────────────── Anomalies détectées ─────────────────────────────

export const anomalie = pgTable(
  "anomalie",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "cascade" }),
    /** Jour concerné (date locale de l'établissement). */
    dateJour: date("date_jour", { mode: "string" }).notNull(),
    type: typeAnomalieEnum("type").notNull(),
    statut: statutAnomalieEnum("statut").notNull().default("OUVERTE"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    traiteeParId: uuid("traitee_par_id").references(() => utilisateur.id, { onDelete: "set null" }),
    traiteeLe: timestamp("traitee_le", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("anomalie_unique_jour_type_uidx").on(t.organisationId, t.salarieId, t.dateJour, t.type),
    index("anomalie_org_statut_idx").on(t.organisationId, t.statut),
  ],
);

// ───────────────────────────── Récap hebdo figé ─────────────────────────────

export type DetailJourRecap = {
  date: string; // YYYY-MM-DD
  minutes: number;
  amplitudeMinutes: number;
  intervalles: { debut: string; fin: string | null; minutes: number }[];
  anomalies: string[];
};

export type DetailHeuresSup = { taux: number; minutes: number }[];

export const recapHebdo = pgTable(
  "recap_hebdo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "restrict" }),
    annee: integer("annee").notNull(),
    semaineIso: integer("semaine_iso").notNull(),
    totalMinutes: integer("total_minutes").notNull(),
    /** Minutes majorées à 25 % et 50 % (schéma légal) ; le détail complet est dans `heuresSupDetail`. */
    heuresSup25: integer("heures_sup_25").notNull().default(0),
    heuresSup50: integer("heures_sup_50").notNull().default(0),
    heuresSupDetail: jsonb("heures_sup_detail").$type<DetailHeuresSup>().notNull().default([]),
    detailJours: jsonb("detail_jours").$type<DetailJourRecap[]>().notNull().default([]),
    pdfObjectKey: text("pdf_object_key"),
    hashSha256: text("hash_sha256"),
    valideLe: timestamp("valide_le", { withTimezone: true, mode: "date" }),
    valideParId: uuid("valide_par_id").references(() => utilisateur.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("recap_hebdo_unique_uidx").on(t.organisationId, t.salarieId, t.annee, t.semaineIso)],
);

// ───────────────────────────── Journal des tentatives de pointage (sécurité + rate limiting) ─────────────────────────────

export const tentativePointage = pgTable(
  "tentative_pointage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    terminalId: uuid("terminal_id").references(() => terminal.id, { onDelete: "set null" }),
    badgeUuid: uuid("badge_uuid").notNull(),
    salarieId: uuid("salarie_id").references(() => salarie.id, { onDelete: "set null" }),
    resultat: resultatTentativeEnum("resultat").notNull(),
    ...timestamps,
  },
  (t) => [
    index("tentative_terminal_date_idx").on(t.terminalId, t.createdAt),
    index("tentative_badge_date_idx").on(t.badgeUuid, t.createdAt),
  ],
);

// ───────────────────────────── Journal des accès admin (RGPD) ─────────────────────────────

export const journalAcces = pgTable(
  "journal_acces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    utilisateurId: uuid("utilisateur_id").references(() => utilisateur.id, { onDelete: "set null" }),
    salarieId: uuid("salarie_id").references(() => salarie.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("journal_acces_org_date_idx").on(t.organisationId, t.createdAt)],
);

// ───────────────────────────── Types inférés ─────────────────────────────

export type Organisation = typeof organisation.$inferSelect;
export type Etablissement = typeof etablissement.$inferSelect;
export type Terminal = typeof terminal.$inferSelect;
export type Salarie = typeof salarie.$inferSelect;
export type Utilisateur = typeof utilisateur.$inferSelect;
export type Pointage = typeof pointage.$inferSelect;
export type Correction = typeof correction.$inferSelect;
export type Anomalie = typeof anomalie.$inferSelect;
export type RecapHebdo = typeof recapHebdo.$inferSelect;
export type TypePointage = Pointage["type"];
export type SourcePointage = Pointage["source"];
export type TypeAnomalie = Anomalie["type"];

// ───────────────────────────── Relations (API relationnelle Drizzle) ─────────────────────────────

import { relations } from "drizzle-orm";

export const organisationRelations = relations(organisation, ({ many }) => ({
  etablissements: many(etablissement),
  salaries: many(salarie),
  terminaux: many(terminal),
  utilisateurs: many(utilisateur),
}));

export const etablissementRelations = relations(etablissement, ({ one, many }) => ({
  organisation: one(organisation, { fields: [etablissement.organisationId], references: [organisation.id] }),
  terminaux: many(terminal),
}));

export const terminalRelations = relations(terminal, ({ one }) => ({
  organisation: one(organisation, { fields: [terminal.organisationId], references: [organisation.id] }),
  etablissement: one(etablissement, { fields: [terminal.etablissementId], references: [etablissement.id] }),
}));

export const salarieRelations = relations(salarie, ({ one, many }) => ({
  organisation: one(organisation, { fields: [salarie.organisationId], references: [organisation.id] }),
  etablissementDefaut: one(etablissement, { fields: [salarie.etablissementDefautId], references: [etablissement.id] }),
  pointages: many(pointage),
}));

export const utilisateurRelations = relations(utilisateur, ({ one }) => ({
  organisation: one(organisation, { fields: [utilisateur.organisationId], references: [organisation.id] }),
  salarie: one(salarie, { fields: [utilisateur.salarieId], references: [salarie.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  utilisateur: one(utilisateur, { fields: [session.utilisateurId], references: [utilisateur.id] }),
}));

export const pointageRelations = relations(pointage, ({ one, many }) => ({
  salarie: one(salarie, { fields: [pointage.salarieId], references: [salarie.id] }),
  etablissement: one(etablissement, { fields: [pointage.etablissementId], references: [etablissement.id] }),
  terminal: one(terminal, { fields: [pointage.terminalId], references: [terminal.id] }),
  corrections: many(correction),
}));

export const correctionRelations = relations(correction, ({ one }) => ({
  pointage: one(pointage, { fields: [correction.pointageId], references: [pointage.id] }),
  auteur: one(utilisateur, { fields: [correction.auteurId], references: [utilisateur.id] }),
}));

export const anomalieRelations = relations(anomalie, ({ one }) => ({
  salarie: one(salarie, { fields: [anomalie.salarieId], references: [salarie.id] }),
}));

export const recapHebdoRelations = relations(recapHebdo, ({ one }) => ({
  salarie: one(salarie, { fields: [recapHebdo.salarieId], references: [salarie.id] }),
  validePar: one(utilisateur, { fields: [recapHebdo.valideParId], references: [utilisateur.id] }),
}));
