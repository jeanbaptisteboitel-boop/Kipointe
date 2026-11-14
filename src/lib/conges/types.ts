/** TYPES DE CONGÉ / ABSENCE et règles de saisie — code PUR. */
import type { StatutConge, TypeConge } from "@/db/schema";
import { estJourFerie } from "@/lib/temps/feries";
import { heuresDuJour, type PlanningTravail } from "@/lib/planning";
import { ecartJours, plusJours } from "@/lib/temps/zone";

export const TYPES_CONGE: readonly TypeConge[] = ["CONGE_PAYE", "ABSENCE_AUTORISEE", "EVENEMENT_FAMILIAL", "FORMATION", "MALADIE", "ABSENCE_NON_AUTORISEE"];

/** Types réservés à l'administrateur (un salarié ne peut pas les déclarer lui-même). */
export const TYPES_CONGE_ADMIN: readonly TypeConge[] = ["ABSENCE_NON_AUTORISEE"];

/**
 * Types DEMANDÉS par le salarié puis validés (en attente → acceptée / refusée). Les autres sont
 * une information : maladie et événement familial déclarés par le salarié sont enregistrés tels
 * quels, à charge pour lui de fournir le justificatif.
 */
export const TYPES_CONGE_VALIDABLES: readonly TypeConge[] = ["CONGE_PAYE", "ABSENCE_AUTORISEE", "FORMATION"];

export const LIBELLES_CONGE: Record<TypeConge, string> = {
  CONGE_PAYE: "Congé payé",
  ABSENCE_AUTORISEE: "Absence autorisée",
  ABSENCE_NON_AUTORISEE: "Absence non autorisée",
  EVENEMENT_FAMILIAL: "Événement familial",
  MALADIE: "Maladie",
  FORMATION: "Formation",
};

export const LIBELLES_STATUT_CONGE: Record<StatutConge, string> = {
  EN_ATTENTE: "En attente",
  ACCEPTEE: "Acceptée",
  REFUSEE: "Refusée",
};

/** Durée maximale d'une absence saisie (jours calendaires). */
export const DUREE_MAX_JOURS = 366;

export interface PeriodeConge {
  dateDebut: string;
  dateFin: string;
  demiJourDebut?: string | null;
  demiJourFin?: string | null;
}

/**
 * Jours d'absence décomptés : les jours TRAVAILLÉS du planning du salarié compris dans la
 * période, hors jours fériés (jours ouvrés propres au salarié). Premier jour commencé
 * l'après-midi ou dernier jour fini le matin : une demi-journée.
 */
export function compterJours(p: PeriodeConge, planning: PlanningTravail): number {
  let total = 0;
  const n = ecartJours(p.dateDebut, p.dateFin);
  for (let k = 0; k <= n; k++) {
    const jour = plusJours(p.dateDebut, k);
    if (heuresDuJour(planning, jour) <= 0 || estJourFerie(jour)) continue;
    let part = 1;
    if (k === 0 && p.demiJourDebut === "APREM") part -= 0.5;
    if (k === n && p.demiJourFin === "MATIN") part -= 0.5;
    total += Math.max(0, part);
  }
  return total;
}

/** Deux périodes se recouvrent-elles (au jour près) ? */
export function seChevauchent(a: PeriodeConge, b: PeriodeConge): boolean {
  return a.dateDebut <= b.dateFin && b.dateDebut <= a.dateFin;
}

/** « 2 jours », « 0,5 jour », « 1 jour ». */
export function formatJours(n: number | null | undefined): string {
  if (n == null) return "—";
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${txt} jour${n >= 2 ? "s" : ""}`;
}
