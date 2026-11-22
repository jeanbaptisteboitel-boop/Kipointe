/**
 * Schéma Drizzle — Kipointe.
 *
 * Kipointe est revendu à des entreprises clientes : chacune est une `organisation`, isolée des
 * autres par la colonne `organisation_id` de TOUTES les tables métier et par les policies RLS
 * (drizzle/0001_rls.sql, src/db/tenant.ts). L'organisation marquée `plateforme` est celle de
 * l'éditeur : ses utilisateurs (rôle PLATEFORME) créent et suivent les organisations clientes.
 *
 * Les pointages viennent de la pointeuse installée chez le client (protocole ADMS des appareils
 * NGTeco / ZKTeco, ou import de son fichier CSV). Ils sont rangés par semaine et par salarié :
 * `pointage_semaine.jours` = [{ date, minutes, pointages: [{ entree, sortie, source? }], note? }].
 * Les durées sont en minutes entières, les dates de journée en « AAAA-MM-JJ » (jour civil du
 * fuseau de l'organisation), les horodatages techniques en UTC.
 */
import {
  boolean,
  date,
  doublePrecision,
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
import type { JourPointage } from "@/lib/pointage/paires";
import type { PlanningTravail } from "@/lib/planning";

// ───────────────────────────── Enums ─────────────────────────────

export const roleUtilisateurEnum = pgEnum("role_utilisateur", ["PLATEFORME", "ADMIN", "SALARIE"]);

export const statutSemaineEnum = pgEnum("statut_semaine", ["EN_ATTENTE", "VALIDE", "MODIF_DEMANDEE"]);

export const typeCongeEnum = pgEnum("type_conge", [
  "CONGE_PAYE",
  "ABSENCE_AUTORISEE",
  "ABSENCE_NON_AUTORISEE",
  "EVENEMENT_FAMILIAL",
  "MALADIE",
  "FORMATION",
]);

export const statutCongeEnum = pgEnum("statut_conge", ["EN_ATTENTE", "ACCEPTEE", "REFUSEE"]);

export const etatBadgeageEnum = pgEnum("etat_badgeage", ["TRAITE", "IGNORE", "NON_RATTACHE", "ECARTE"]);

export const typeNotificationEnum = pgEnum("type_notification", [
  "HEURES_MANQUANTES",
  "HEURES_SUP",
  "ABSENCE_A_JUSTIFIER",
  "POINTAGE_INCOMPLET",
  "SEMAINE_A_VALIDER",
  "MODIF_DEMANDEE",
  "CONGE_DEMANDE",
  "CONGE_DECISION",
  "POINTEUSE_SILENCIEUSE",
  "BADGE_NON_RATTACHE",
  "JUSTIFICATIF_DEPOSE",
]);

const cree = { createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow() };
const modifie = { updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow() };

// ───────────────────────────── Tenants ─────────────────────────────

export const organisation = pgTable("organisation", {
  id: uuid("id").primaryKey().defaultRandom(),
  raisonSociale: text("raison_sociale").notNull(),
  siret: text("siret"),
  /** Organisation de l'éditeur : ses utilisateurs PLATEFORME gèrent les organisations clientes. */
  plateforme: boolean("plateforme").notNull().default(false),
  /** Client suspendu : plus de connexion ni de réception des pointages. */
  actif: boolean("actif").notNull().default(true),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  /** Planning hebdomadaire par défaut (heures par jour). Null = lundi-vendredi 7 h. */
  planningDefaut: jsonb("planning_defaut").$type<PlanningTravail>(),
  /** Écart hebdomadaire (minutes) à partir duquel une notification d'heures manquantes ou supplémentaires part. */
  seuilEcartMinutes: integer("seuil_ecart_minutes").notNull().default(15),
  /** Les notifications sont aussi envoyées par e-mail (si un service d'envoi est configuré). */
  notificationsEmail: boolean("notifications_email").notNull().default(true),
  /** Modes de pointage proposés sur les tablettes de l'entreprise. */
  tabletteCode: boolean("tablette_code").notNull().default(true),
  tabletteQr: boolean("tablette_qr").notNull().default(true),
  /** Photo prise par la tablette à chaque pointage par code (contre le pointage pour un collègue). */
  tablettePhoto: boolean("tablette_photo").notNull().default(false),
  ...cree,
});

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
    /** Numéro du salarié dans la pointeuse (« ID utilisateur » de l'appareil). */
    pointeuseRef: text("pointeuse_ref"),
    /** Empreinte du code personnel tapé sur la tablette (jamais le code lui-même). */
    codePointageHash: text("code_pointage_hash"),
    /** Planning propre (temps partiel, horaires particuliers). Null = planning de l'organisation. */
    planning: jsonb("planning").$type<PlanningTravail>(),
    dateEntree: date("date_entree"),
    dateSortie: date("date_sortie"),
    actif: boolean("actif").notNull().default(true),
    /** Compteur d'heures : date de départ (null = 1er janvier, ou date d'entrée) et solde repris à cette date. */
    compteurDepart: date("compteur_depart"),
    compteurSoldeDepartMinutes: integer("compteur_solde_depart_minutes").notNull().default(0),
    /** Solde de congés payés (jours) constaté à `cpSoldeAu` ; les congés acceptés ensuite en sont déduits. */
    cpSoldeJours: doublePrecision("cp_solde_jours"),
    cpSoldeAu: date("cp_solde_au"),
    ...cree,
  },
  (t) => [
    index("salarie_org_idx").on(t.organisationId),
    index("salarie_pointeuse_ref_idx").on(t.organisationId, t.pointeuseRef),
    uniqueIndex("salarie_code_pointage_key").on(t.organisationId, t.codePointageHash),
  ],
);

// ───────────────────────────── Comptes et sessions ─────────────────────────────

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
    /** Mot de passe provisoire remis par un administrateur : à changer à la première connexion. */
    motDePasseProvisoire: boolean("mot_de_passe_provisoire").notNull().default(false),
    role: roleUtilisateurEnum("role").notNull(),
    /** Fiche du salarié pour un compte SALARIE (un ADMIN peut aussi être salarié). */
    salarieId: uuid("salarie_id").references(() => salarie.id, { onDelete: "set null" }),
    actif: boolean("actif").notNull().default(true),
    ...cree,
  },
  (t) => [uniqueIndex("utilisateur_email_key").on(t.email), index("utilisateur_org_idx").on(t.organisationId)],
);

export const session = pgTable(
  "session",
  {
    tokenHash: text("token_hash").primaryKey(),
    utilisateurId: uuid("utilisateur_id")
      .notNull()
      .references(() => utilisateur.id, { onDelete: "cascade" }),
    expireLe: timestamp("expire_le", { withTimezone: true, mode: "date" }).notNull(),
    ...cree,
  },
  (t) => [index("session_utilisateur_idx").on(t.utilisateurId)],
);

// ───────────────────────────── Pointeuses ─────────────────────────────

export const pointeuse = pgTable(
  "pointeuse",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    /** Numéro de série de l'appareil : seul identifiant qu'il sait présenter (liste blanche). */
    numeroSerie: text("numero_serie").notNull(),
    nom: text("nom"),
    actif: boolean("actif").notNull().default(true),
    /** AUTO : codes d'état de l'appareil lus ; ALTERNANCE : entrée / sortie déduites de l'ordre des badgeages. */
    modeStatut: text("mode_statut").notNull().default("AUTO"),
    stampAttlog: text("stamp_attlog"),
    derniereConnexion: timestamp("derniere_connexion", { withTimezone: true, mode: "date" }),
    dernierPointage: timestamp("dernier_pointage", { withTimezone: true, mode: "date" }),
    ...cree,
  },
  (t) => [uniqueIndex("pointeuse_numero_serie_key").on(t.numeroSerie), index("pointeuse_org_idx").on(t.organisationId)],
);

/** Badgeage brut reçu d'une pointeuse (trace et clé d'idempotence : l'appareil renvoie volontiers). */
export const badgeage = pgTable(
  "badgeage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    pointeuseId: uuid("pointeuse_id")
      .notNull()
      .references(() => pointeuse.id, { onDelete: "cascade" }),
    pin: text("pin").notNull(),
    /** « AAAA-MM-JJ HH:MM:SS », heure locale de l'appareil. */
    horodatageLocal: text("horodatage_local").notNull(),
    jour: date("jour").notNull(),
    statutAppareil: integer("statut_appareil"),
    verification: integer("verification"),
    etat: etatBadgeageEnum("etat").notNull().default("NON_RATTACHE"),
    typeApplique: text("type_applique"),
    salarieId: uuid("salarie_id").references(() => salarie.id, { onDelete: "set null" }),
    recuLe: timestamp("recu_le", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    traiteLe: timestamp("traite_le", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("badgeage_idempotence_key").on(t.organisationId, t.pin, t.horodatageLocal),
    index("badgeage_etat_idx").on(t.organisationId, t.etat),
  ],
);

// ───────────────────────────── Tablettes ─────────────────────────────

/**
 * Tablette de pointage posée chez le client. Elle s'identifie par un jeton tiré à l'activation
 * (seule son empreinte est gardée) ; `secretQr` signe le QR code tournant qu'elle affiche.
 */
export const tablette = pgTable(
  "tablette",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    actif: boolean("actif").notNull().default(true),
    jetonHash: text("jeton_hash"),
    /** Code d'activation à usage unique, saisi une fois sur la tablette. */
    activationHash: text("activation_hash"),
    activationExpire: timestamp("activation_expire", { withTimezone: true, mode: "date" }),
    secretQr: text("secret_qr").notNull(),
    /** Codes faux tapés à la suite : au-delà d'un seuil, le clavier est bloqué un moment. */
    echecs: integer("echecs").notNull().default(0),
    bloqueeJusqua: timestamp("bloquee_jusqua", { withTimezone: true, mode: "date" }),
    dernierContact: timestamp("dernier_contact", { withTimezone: true, mode: "date" }),
    ...cree,
  },
  (t) => [uniqueIndex("tablette_jeton_key").on(t.jetonHash), uniqueIndex("tablette_activation_key").on(t.activationHash), index("tablette_org_idx").on(t.organisationId)],
);

/** Journal des pointages faits sur une tablette (code tapé ou QR code lu par le téléphone). */
export const pointageTablette = pgTable(
  "pointage_tablette",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    tabletteId: uuid("tablette_id").references(() => tablette.id, { onDelete: "set null" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "cascade" }),
    /** CODE ou QR. */
    mode: text("mode").notNull(),
    instant: timestamp("instant", { withTimezone: true, mode: "date" }).notNull(),
    jour: date("jour").notNull(),
    heure: text("heure").notNull(),
    /** arrivee, depart, ou double_badge (rien d'écrit). */
    typeApplique: text("type_applique").notNull(),
    /** Clé de la photo dans le bucket ; effacée, avec la photo, à la fin de la durée de conservation. */
    photoCle: text("photo_cle"),
  },
  (t) => [index("pointage_tablette_tablette_idx").on(t.tabletteId, t.instant), index("pointage_tablette_salarie_idx").on(t.salarieId, t.instant)],
);

/** Rendez-vous d'un salarié (médecine du travail, entretien…) : rappelé au pointage et dans son espace. */
export const rendezVous = pgTable(
  "rendez_vous",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "cascade" }),
    intitule: text("intitule").notNull(),
    jour: date("jour").notNull(),
    /** « HH:MM », facultatif. */
    heure: text("heure"),
    precision: text("precision"),
    ...cree,
  },
  (t) => [index("rendez_vous_salarie_idx").on(t.salarieId, t.jour)],
);

// ───────────────────────────── Pointage hebdomadaire ─────────────────────────────

export const pointageSemaine = pgTable(
  "pointage_semaine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "cascade" }),
    /** Lundi de la semaine. */
    semaineDebut: date("semaine_debut").notNull(),
    semaineFin: date("semaine_fin").notNull(),
    totalMinutes: integer("total_minutes").notNull().default(0),
    jours: jsonb("jours").$type<JourPointage[]>().notNull().default([]),
    /** Le salarié valide sa semaine ou demande une modification ; toute écriture la remet « à valider ». */
    statut: statutSemaineEnum("statut").notNull().default("EN_ATTENTE"),
    commentaire: text("commentaire"),
    ...cree,
    ...modifie,
  },
  (t) => [uniqueIndex("pointage_semaine_key").on(t.salarieId, t.semaineDebut), index("pointage_semaine_org_idx").on(t.organisationId, t.semaineDebut)],
);

// ───────────────────────────── Congés et absences ─────────────────────────────

export const congeAbsence = pgTable(
  "conge_absence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    salarieId: uuid("salarie_id")
      .notNull()
      .references(() => salarie.id, { onDelete: "cascade" }),
    type: typeCongeEnum("type").notNull(),
    dateDebut: date("date_debut").notNull(),
    dateFin: date("date_fin").notNull(),
    /** Jours d'absence décomptés sur le planning du salarié (demi-journées comprises). */
    nbJours: doublePrecision("nb_jours"),
    /** « APREM » : l'absence commence l'après-midi du premier jour. */
    demiJourDebut: text("demi_jour_debut"),
    /** « MATIN » : l'absence finit le matin du dernier jour. */
    demiJourFin: text("demi_jour_fin"),
    motif: text("motif"),
    statut: statutCongeEnum("statut").notNull().default("EN_ATTENTE"),
    creePar: uuid("cree_par").references(() => utilisateur.id, { onDelete: "set null" }),
    decidePar: uuid("decide_par").references(() => utilisateur.id, { onDelete: "set null" }),
    decideLe: timestamp("decide_le", { withTimezone: true, mode: "date" }),
    commentaireDecision: text("commentaire_decision"),
    ...cree,
    ...modifie,
  },
  (t) => [index("conge_org_statut_idx").on(t.organisationId, t.statut), index("conge_salarie_idx").on(t.salarieId, t.dateDebut)],
);

/**
 * Justificatif d'une absence (arrêt de travail, acte, convocation). Le fichier est dans le bucket
 * Scaleway (privé), sous `cle` ; cette ligne en porte les droits : il n'est servi qu'au salarié
 * concerné et aux administrateurs de son entreprise, et disparaît avec l'absence.
 * `confirmeLe` nul : envoi annoncé mais pas encore vérifié (le fichier n'est pas consultable).
 */
export const justificatif = pgTable(
  "justificatif",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    congeId: uuid("conge_id")
      .notNull()
      .references(() => congeAbsence.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    typeMime: text("type_mime").notNull(),
    taille: integer("taille").notNull(),
    cle: text("cle").notNull(),
    confirmeLe: timestamp("confirme_le", { withTimezone: true, mode: "date" }),
    deposePar: uuid("depose_par").references(() => utilisateur.id, { onDelete: "set null" }),
    ...cree,
  },
  (t) => [index("justificatif_conge_idx").on(t.congeId)],
);

// ───────────────────────────── Notifications ─────────────────────────────

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisation.id, { onDelete: "cascade" }),
    /** Salarié destinataire ; null = notification adressée aux administrateurs de l'organisation. */
    destinataireSalarieId: uuid("destinataire_salarie_id").references(() => salarie.id, { onDelete: "cascade" }),
    /** Salarié concerné (pour une notification d'administrateur). */
    salarieId: uuid("salarie_id").references(() => salarie.id, { onDelete: "cascade" }),
    type: typeNotificationEnum("type").notNull(),
    titre: text("titre").notNull(),
    message: text("message").notNull(),
    lien: text("lien"),
    /** Clé de dédoublonnage : la tâche quotidienne peut repasser sans créer deux fois la même notification. */
    cle: text("cle").notNull(),
    luLe: timestamp("lu_le", { withTimezone: true, mode: "date" }),
    emailEnvoyeLe: timestamp("email_envoye_le", { withTimezone: true, mode: "date" }),
    ...cree,
  },
  (t) => [uniqueIndex("notification_cle_key").on(t.organisationId, t.cle), index("notification_dest_idx").on(t.organisationId, t.destinataireSalarieId, t.luLe)],
);

// ───────────────────────────── Journal des accès ─────────────────────────────

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
    ...cree,
  },
  (t) => [index("journal_org_idx").on(t.organisationId, t.createdAt)],
);

export type Organisation = typeof organisation.$inferSelect;
export type Salarie = typeof salarie.$inferSelect;
export type Utilisateur = typeof utilisateur.$inferSelect;
export type Pointeuse = typeof pointeuse.$inferSelect;
export type Badgeage = typeof badgeage.$inferSelect;
export type PointageSemaine = typeof pointageSemaine.$inferSelect;
export type CongeAbsence = typeof congeAbsence.$inferSelect;
export type Notification = typeof notification.$inferSelect;
export type TypeConge = (typeof typeCongeEnum.enumValues)[number];
export type StatutConge = (typeof statutCongeEnum.enumValues)[number];
export type StatutSemaine = (typeof statutSemaineEnum.enumValues)[number];
export type TypeNotification = (typeof typeNotificationEnum.enumValues)[number];
export type Role = (typeof roleUtilisateurEnum.enumValues)[number];
export type Tablette = typeof tablette.$inferSelect;
export type RendezVous = typeof rendezVous.$inferSelect;
