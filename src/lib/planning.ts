/**
 * PLANNING DE TRAVAIL HEBDOMADAIRE — code PUR.
 *
 * Un planning = les heures prévues chaque jour, du lundi au dimanche :
 *   {"lun":7,"mar":7,"mer":7,"jeu":7,"ven":7,"sam":0,"dim":0}
 * (heures décimales au quart d'heure, 0 à 12 par jour, total 1 à 48 h). Sa somme est la durée
 * contractuelle hebdomadaire : c'est à elle que les heures pointées sont comparées.
 *
 * Résolution : planning propre au salarié, sinon planning par défaut de l'organisation, sinon
 * PLANNING_REPLI (lundi-vendredi 7 h, soit 35 h). Pas d'historique : c'est toujours le planning
 * ACTUEL qui sert, y compris pour les semaines passées.
 */
import { dateUtc } from "@/lib/temps/zone";

export const JOURS_PLANNING = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;
export type JourPlanning = (typeof JOURS_PLANNING)[number];
export type PlanningTravail = Record<JourPlanning, number>;

export const LIBELLES_JOURS: Record<JourPlanning, string> = {
  lun: "Lundi",
  mar: "Mardi",
  mer: "Mercredi",
  jeu: "Jeudi",
  ven: "Vendredi",
  sam: "Samedi",
  dim: "Dimanche",
};

export const PLANNING_REPLI: Readonly<PlanningTravail> = Object.freeze({ lun: 7, mar: 7, mer: 7, jeu: 7, ven: 7, sam: 0, dim: 0 });

export const HEURES_MAX_JOUR = 12;
export const TOTAL_MIN = 1;
export const TOTAL_MAX = 48;

export type SourcePlanning = "organisation" | "salarie";

/** Somme des heures du planning (durée hebdomadaire), arrondie au 1/100. */
export function dureeHebdo(p: PlanningTravail): number {
  return Math.round(JOURS_PLANNING.reduce((t, j) => t + (Number(p[j]) || 0), 0) * 100) / 100;
}

/** Heures prévues un jour civil « AAAA-MM-JJ ». */
export function heuresDuJour(p: PlanningTravail, jour: string): number {
  return Number(p[JOURS_PLANNING[(dateUtc(jour).getUTCDay() + 6) % 7]!]) || 0;
}

function lireNombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return 0;
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }
  return null;
}

/** Validation STRICTE d'un planning saisi : les sept jours, 0 à 12 h au quart d'heure, total 1 à 48 h. */
export function validerPlanning(brut: unknown): { ok: true; planning: PlanningTravail } | { ok: false; erreur: string } {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) {
    return { ok: false, erreur: "Planning invalide." };
  }
  const o = brut as Record<string, unknown>;
  const planning = {} as PlanningTravail;
  for (const j of JOURS_PLANNING) {
    const n = lireNombre(o[j]);
    if (n === null || n < 0 || n > HEURES_MAX_JOUR) {
      return { ok: false, erreur: `${LIBELLES_JOURS[j]} : entre 0 et ${HEURES_MAX_JOUR} heures.` };
    }
    if (Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) {
      return { ok: false, erreur: `${LIBELLES_JOURS[j]} : au quart d'heure près (7, 7,25, 7,5, 7,75).` };
    }
    planning[j] = Math.round(n * 4) / 4;
  }
  const total = dureeHebdo(planning);
  if (total < TOTAL_MIN || total > TOTAL_MAX) {
    return { ok: false, erreur: `Durée hebdomadaire : entre ${TOTAL_MIN} et ${TOTAL_MAX} heures (actuellement ${total} h).` };
  }
  return { ok: true, planning };
}

/** Lecture tolérante d'une valeur stockée : null si absente ou illisible. */
export function lirePlanning(v: unknown): PlanningTravail | null {
  if (v == null) return null;
  const r = validerPlanning(v);
  return r.ok ? r.planning : null;
}

export function planningOrganisation(org: { planningDefaut?: unknown } | null | undefined): PlanningTravail {
  return lirePlanning(org?.planningDefaut) ?? { ...PLANNING_REPLI };
}

/** LA résolution du planning effectif d'un salarié. */
export function planningEffectif(
  salarie: { planning?: unknown } | null | undefined,
  org: { planningDefaut?: unknown } | null | undefined,
): { planning: PlanningTravail; source: SourcePlanning } {
  const propre = lirePlanning(salarie?.planning);
  if (propre) return { planning: propre, source: "salarie" };
  return { planning: planningOrganisation(org), source: "organisation" };
}

export function planningsEgaux(a: PlanningTravail, b: PlanningTravail): boolean {
  return JOURS_PLANNING.every((j) => a[j] === b[j]);
}

/** « 7 h », « 7 h 30 », « −1 h 15 » — heures décimales lisibles. */
export function formatHeures(h: number): string {
  const signe = h < 0 ? "−" : "";
  const totalMin = Math.round(Math.abs(h) * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${signe}${hh} h${mm ? ` ${String(mm).padStart(2, "0")}` : ""}`;
}

/** « lun 7 h · mar 7 h · … » (jours à 0 h omis). */
export function resumePlanning(p: PlanningTravail): string {
  const jours = JOURS_PLANNING.filter((j) => (p[j] || 0) > 0).map((j) => `${j} ${formatHeures(p[j])}`);
  return jours.length ? jours.join(" · ") : "aucun jour travaillé";
}
