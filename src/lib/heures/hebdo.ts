/**
 * HEURES D'UN SALARIÉ, JOUR PAR JOUR — calcul PUR.
 *
 * Pour chaque jour civil :
 *   - prevu : heures du planning effectif (0 hors période d'emploi) ;
 *   - feries : un jour férié tombant un jour prévu vaut ses heures prévues. Le férié PRIME sur
 *     une absence (un férié pendant des congés payés n'est pas un jour de congé) ;
 *   - congesPayes / maladie / formation / autresAbsences : pour chaque jour non férié prévu et
 *     couvert par une absence ACCEPTÉE, les heures prévues ce jour. Demi-journées : premier jour
 *     commencé l'après-midi (APREM) ou dernier jour fini le matin (MATIN) → moitié des heures ;
 *   - nonAutorisee : absence non autorisée — repérée à part car elle NE compte PAS comme du temps
 *     réalisé (les heures restent dues) ;
 * Un jour n'est jamais compté au-delà de ses heures prévues. Absences qui se CHEVAUCHENT :
 * priorité stable par type — maladie > formation > autres absences > congés payés.
 *
 * Fériés et absences ne sont comptés que pendant la période d'emploi et jusqu'à `aujourdhui`
 * inclus : la semaine en cours ne compte pas d'avance les jours à venir.
 */
import type { TypeConge } from "@/db/schema";
import { estJourFerie } from "@/lib/temps/feries";
import { heuresDuJour, type PlanningTravail } from "@/lib/planning";

export interface CongeBrut {
  type: TypeConge | string;
  statut?: string | null;
  dateDebut: string;
  dateFin: string;
  demiJourDebut?: string | null;
  demiJourFin?: string | null;
}

export type CategorieAbsence = "congesPayes" | "maladie" | "formation" | "autresAbsences" | "nonAutorisee";

const CATEGORIE: Record<string, CategorieAbsence> = {
  CONGE_PAYE: "congesPayes",
  MALADIE: "maladie",
  FORMATION: "formation",
  ABSENCE_NON_AUTORISEE: "nonAutorisee",
};

/** Priorité d'une absence quand plusieurs couvrent le même jour (plus petit = prioritaire). */
export function prioriteAbsence(type: string): number {
  if (type === "MALADIE") return 0;
  if (type === "FORMATION") return 1;
  if (type === "CONGE_PAYE") return 3;
  if (type === "ABSENCE_NON_AUTORISEE") return 4;
  return 2;
}

export interface AbsenceJour {
  type: string;
  heures: number;
  demiJournee: boolean;
}

export interface JourHeures {
  date: string;
  prevu: number;
  congesPayes: number;
  maladie: number;
  formation: number;
  feries: number;
  autresAbsences: number;
  nonAutorisee: number;
  absences: AbsenceJour[];
  horsEmploi: boolean;
  aVenir: boolean;
}

export interface ParametresHeures {
  planning: PlanningTravail;
  conges: CongeBrut[];
  dateEntree?: string | null;
  dateSortie?: string | null;
  /** Jour civil local : fériés et absences comptés jusqu'à ce jour inclus. */
  aujourdhui?: string | null;
}

/** Heures d'absence ASSIMILÉES à du temps réalisé (tout sauf l'absence non autorisée). */
export function heuresAssimilees(j: JourHeures): number {
  return j.congesPayes + j.maladie + j.formation + j.feries + j.autresAbsences;
}

export function calculerHeuresJours(p: ParametresHeures & { jours: string[] }): JourHeures[] {
  const conges = p.conges
    .filter((c) => c.statut == null || c.statut === "ACCEPTEE")
    .filter((c) => c.dateFin >= c.dateDebut)
    .map((c) => ({ ...c, apremDebut: c.demiJourDebut === "APREM", matinFin: c.demiJourFin === "MATIN" }))
    .sort((a, b) => prioriteAbsence(a.type) - prioriteAbsence(b.type));

  return p.jours.map((jour) => {
    const r: JourHeures = {
      date: jour,
      prevu: 0,
      congesPayes: 0,
      maladie: 0,
      formation: 0,
      feries: 0,
      autresAbsences: 0,
      nonAutorisee: 0,
      absences: [],
      horsEmploi: false,
      aVenir: false,
    };
    if ((p.dateEntree && jour < p.dateEntree) || (p.dateSortie && jour > p.dateSortie)) {
      r.horsEmploi = true;
      return r;
    }
    const prevu = heuresDuJour(p.planning, jour);
    r.prevu = prevu;
    if (p.aujourdhui && jour > p.aujourdhui) {
      r.aVenir = true;
      return r;
    }
    if (prevu <= 0) return r;
    if (estJourFerie(jour)) {
      r.feries = prevu;
      return r;
    }
    let restant = prevu;
    for (const c of conges) {
      if (restant <= 0) break;
      if (jour < c.dateDebut || jour > c.dateFin) continue;
      let part = 1;
      if (jour === c.dateDebut && c.apremDebut) part -= 0.5;
      if (jour === c.dateFin && c.matinFin) part -= 0.5;
      const h = Math.min(restant, prevu * part);
      if (h <= 0) continue;
      restant -= h;
      r[CATEGORIE[c.type] ?? "autresAbsences"] += h;
      r.absences.push({ type: c.type, heures: h, demiJournee: part < 1 });
    }
    return r;
  });
}
