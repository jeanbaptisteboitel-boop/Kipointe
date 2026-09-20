import { z } from "zod";

export const uuidSchema = z.string().uuid();

/** Contenu d'un badge : « BADGE:<uuid> » ou l'uuid nu. */
export function extraireBadgeUuid(brut: string): string | null {
  const m = /^(?:BADGE:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(brut.trim());
  return m ? m[1]!.toLowerCase() : null;
}

const badgeSchema = z
  .string()
  .transform((v, ctx) => {
    const uuid = extraireBadgeUuid(v);
    if (!uuid) {
      ctx.addIssue({ code: "custom", message: "badge invalide" });
      return z.NEVER;
    }
    return uuid;
  });

export const pointageSchema = z.object({
  badge_uuid: badgeSchema,
  pin: z.string().regex(/^\d{4}$/, "PIN à 4 chiffres"),
  idempotency_key: uuidSchema,
  horodatage_terminal: z.string().datetime({ offset: true }).nullable().optional(),
  offset_horloge_ms: z.number().int().min(-86_400_000).max(86_400_000).nullable().optional(),
});
export type PointageEntree = z.infer<typeof pointageSchema>;

export const pointageBatchSchema = z.object({
  pointages: z.array(pointageSchema.extend({ horodatage_terminal: z.string().datetime({ offset: true }) })).min(1).max(500),
  version_app: z.string().max(50).optional(),
});

export const appairageSchema = z.object({
  code_appairage: z.string().min(6).max(12),
  identifiant_materiel: z.string().max(100).optional(),
  version_app: z.string().max(50).optional(),
});

export const connexionSchema = z.object({
  email: z.string().email().max(200),
  mot_de_passe: z.string().min(1).max(200),
});

export const salarieCreationSchema = z.object({
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().min(1).max(100),
  matricule: z.string().trim().max(50).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  etablissement_id: uuidSchema.optional().nullable(),
  contrat_heures_hebdo: z.number().min(0).max(60).optional(), // en heures
  date_entree: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const salarieModificationSchema = salarieCreationSchema.partial().extend({
  actif: z.boolean().optional(),
  date_sortie: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const correctionSchema = z.object({
  nouvelle_valeur: z.object({
    horodatage: z.string().datetime({ offset: true }).optional(),
    type: z.enum(["ENTREE", "SORTIE", "DEBUT_PAUSE", "FIN_PAUSE"]).optional(),
    annule: z.boolean().optional(),
  }),
  motif: z.string().trim().min(5, "Motif obligatoire (5 caractères minimum)").max(500),
});

export const saisieManuelleSchema = z.object({
  salarie_id: uuidSchema,
  horodatage: z.string().datetime({ offset: true }),
  type: z.enum(["ENTREE", "SORTIE", "DEBUT_PAUSE", "FIN_PAUSE"]),
  motif: z.string().trim().min(5).max(500),
});

export const terminalCreationSchema = z.object({
  libelle: z.string().trim().min(1).max(100),
  etablissement_id: uuidSchema,
});

export const etablissementCreationSchema = z.object({
  libelle: z.string().trim().min(1).max(100),
  adresse: z.string().trim().max(300).optional().nullable(),
  timezone: z.string().trim().min(1).max(60).default("Europe/Paris"),
});

export const anomalieStatutSchema = z.object({
  statut: z.enum(["OUVERTE", "TRAITEE", "IGNOREE"]),
});

export const parametresOrganisationSchema = z.object({
  raison_sociale: z.string().trim().min(1).max(200).optional(),
  siret: z.string().trim().max(20).optional().nullable(),
  convention_collective: z.string().trim().max(200).optional().nullable(),
  duree_hebdo_reference: z.number().min(0).max(60).optional(), // heures
  paliers_heures_sup: z.array(z.object({ seuilHeures: z.number().min(0).max(80), taux: z.number().min(0).max(200) })).min(1).max(6).optional(),
  repos_quotidien_min: z.number().int().min(0).max(24 * 60).optional(),
  repos_hebdo_min: z.number().int().min(0).max(7 * 24 * 60).optional(),
  pause_obligatoire_apres: z.number().int().min(0).max(24 * 60).optional(),
  pause_duree_min: z.number().int().min(0).max(240).optional(),
  amplitude_max: z.number().int().min(0).max(24 * 60).optional(),
  journee_debut_heure: z.number().int().min(0).max(23).optional(),
  anti_doublon_secondes: z.number().int().min(0).max(600).optional(),
});
