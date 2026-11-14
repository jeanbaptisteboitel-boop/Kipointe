/**
 * COMPTEUR D'HEURES d'un salarié (heures manquantes / supplémentaires) — calcul PUR.
 *
 * ÉCART D'UNE SEMAINE = réalisé − prévu, où
 *   - prévu   = heures du planning effectif, jour par jour (0 hors période d'emploi) ;
 *   - réalisé = travaillé (pointage) + congés payés + maladie + formation + fériés + autres
 *     absences acceptées. Une absence NON AUTORISÉE ne compte pas : ses heures restent dues.
 * Écart négatif : heures non effectuées par rapport au contrat. Écart positif : heures
 * supplémentaires (ou complémentaires pour un temps partiel).
 *
 * MINUTES ENTIÈRES : chaque valeur journalière est arrondie à la minute puis sommée.
 *
 * SEMAINES TERMINÉES SEULEMENT : une semaine entre dans le solde quand son dimanche est
 * strictement antérieur à `aujourdhui`. La semaine en cours est rendue à part, « provisoire »,
 * comptée jusqu'au dernier jour renseigné (pointage, absence, férié) antérieur à aujourd'hui —
 * sans cela elle afficherait un déficit systématique.
 *
 * DATE DE DÉPART : réglée par salarié, sinon le 1er janvier de l'année d'`aujourdhui` (de
 * l'année de sortie pour un salarié sorti), ou la date d'entrée si elle est postérieure. Une
 * date de départ en cours de semaine n'est pas ramenée au lundi : la première semaine n'est
 * comptée qu'à partir de cette date.
 *
 * SOLDE : solde de départ + somme des écarts des semaines terminées depuis la date de départ.
 */
import { calculerHeuresJours, heuresAssimilees, type CongeBrut, type JourHeures } from "@/lib/heures/hebdo";
import { minutesDepuisPointages, type JourPointage } from "@/lib/pointage/paires";
import type { PlanningTravail } from "@/lib/planning";
import { joursDeSemaine, lundiDe, plusJours } from "@/lib/temps/zone";

/** Minutes pointées par date, toutes semaines confondues. */
export function minutesParJour(semaines: Array<{ jours: JourPointage[] }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of semaines) {
    for (const j of s.jours ?? []) {
      const minutes = Number.isFinite(Number(j.minutes)) ? Number(j.minutes) : minutesDepuisPointages(j.pointages);
      m.set(j.date, (m.get(j.date) ?? 0) + minutes);
    }
  }
  return m;
}

export function departParDefaut(aujourdhui: string, dateEntree?: string | null, dateSortie?: string | null): string {
  const reference = dateSortie && dateSortie < aujourdhui ? dateSortie : aujourdhui;
  const janvier = `${reference.slice(0, 4)}-01-01`;
  return dateEntree && dateEntree > janvier ? dateEntree : janvier;
}

export interface DonneesCompteur {
  planning: PlanningTravail;
  conges: CongeBrut[];
  pointagesSemaines: Array<{ jours: JourPointage[] }>;
  dateEntree?: string | null;
  dateSortie?: string | null;
  aujourdhui: string;
}

export interface SemaineCompteur {
  lundi: string;
  /** Premier jour compté : le lundi, ou la date de départ si elle tombe dans la semaine. */
  debutCompte: string;
  prevuMinutes: number;
  travailleMinutes: number;
  /** Absences assimilées à du temps réalisé (congés, maladie, formation, fériés…). */
  assimileMinutes: number;
  /** Absences non autorisées (non comptées dans le réalisé). */
  nonAutoriseMinutes: number;
  realiseMinutes: number;
  ecartMinutes: number;
  terminee: boolean;
  /** Solde après cette semaine ; null pour la semaine en cours ou hors compteur. */
  soldeApresMinutes: number | null;
  /** Semaine antérieure au départ du compteur : son écart n'a pas de sens (suivi pas encore commencé). */
  horsCompteur?: boolean;
}

/** Prévu et réalisé (minutes entières) de semaines données, comptées à partir de `depuis`. */
export function mesurerSemaines(p: DonneesCompteur, lundis: string[], depuis?: string | null): SemaineCompteur[] {
  const pointes = minutesParJour(p.pointagesSemaines);
  return lundis.map((brut) => {
    const lundi = lundiDe(brut);
    const jours = joursDeSemaine(lundi).filter((j) => (!depuis || j >= depuis) && j <= p.aujourdhui);
    const calc = calculerHeuresJours({ jours, planning: p.planning, conges: p.conges, dateEntree: p.dateEntree, dateSortie: p.dateSortie, aujourdhui: p.aujourdhui });
    const terminee = plusJours(lundi, 6) < p.aujourdhui;
    let comptes: JourHeures[] = calc;
    if (!terminee) {
      const renseigne = (j: JourHeures) => j.date < p.aujourdhui && (pointes.has(j.date) || heuresAssimilees(j) + j.nonAutorisee > 0);
      let dernier = -1;
      calc.forEach((j, k) => {
        if (renseigne(j)) dernier = k;
      });
      comptes = calc.slice(0, dernier + 1);
    }
    let prevu = 0;
    let travaille = 0;
    let assimile = 0;
    let nonAutorise = 0;
    for (const j of comptes) {
      prevu += Math.round(j.prevu * 60);
      travaille += Math.round(pointes.get(j.date) ?? 0);
      assimile += Math.round(j.congesPayes * 60) + Math.round(j.maladie * 60) + Math.round(j.formation * 60) + Math.round(j.feries * 60) + Math.round(j.autresAbsences * 60);
      nonAutorise += Math.round(j.nonAutorisee * 60);
    }
    // Les heures pointées un jour hors compte (semaine en cours, jour du jour) ne sont pas perdues
    // de vue : elles entreront dans la semaine une fois terminée.
    return {
      lundi,
      debutCompte: depuis && depuis > lundi ? depuis : lundi,
      prevuMinutes: prevu,
      travailleMinutes: travaille,
      assimileMinutes: assimile,
      nonAutoriseMinutes: nonAutorise,
      realiseMinutes: travaille + assimile,
      ecartMinutes: travaille + assimile - prevu,
      terminee,
      soldeApresMinutes: null,
    };
  });
}

export interface ResultatCompteur {
  depart: string;
  departParDefaut: boolean;
  soldeDepartMinutes: number;
  semaines: SemaineCompteur[];
  /** Solde courant : solde de départ + écarts des semaines terminées. */
  soldeMinutes: number;
  /** Dimanche de la dernière semaine terminée comptée ; null si aucune. */
  soldeAu: string | null;
  derniereTerminee: SemaineCompteur | null;
  /** Semaine en cours (provisoire, hors solde) ; null si le compteur ne la couvre pas. */
  enCours: SemaineCompteur | null;
}

export function calculerCompteurHeures(p: DonneesCompteur & { depart?: string | null; soldeDepartMinutes?: number | null }): ResultatCompteur {
  const depart = p.depart ?? departParDefaut(p.aujourdhui, p.dateEntree, p.dateSortie);
  const soldeDepart = Math.round(Number(p.soldeDepartMinutes) || 0);
  const fin = p.dateSortie && p.dateSortie < p.aujourdhui ? p.dateSortie : p.aujourdhui;
  const lundis: string[] = [];
  if (depart <= fin) {
    for (let l = lundiDe(depart); l <= fin; l = plusJours(l, 7)) lundis.push(l);
  }
  let solde = soldeDepart;
  let derniereTerminee: SemaineCompteur | null = null;
  let enCours: SemaineCompteur | null = null;
  const semaines = mesurerSemaines(p, lundis, depart).map((m) => {
    if (m.terminee) {
      solde += m.ecartMinutes;
      const s = { ...m, soldeApresMinutes: solde };
      derniereTerminee = s;
      return s;
    }
    enCours = m;
    return m;
  });
  const der = derniereTerminee as SemaineCompteur | null;
  return {
    depart,
    departParDefaut: !p.depart,
    soldeDepartMinutes: soldeDepart,
    semaines,
    soldeMinutes: solde,
    soldeAu: der ? plusJours(der.lundi, 6) : null,
    derniereTerminee: der,
    enCours,
  };
}

/** Lecture d'un solde saisi en heures (« 3,25 », « -3.5 », « +2:30 », « −1h15 ») → minutes ; null si vide. */
export function lireSoldeHeures(v: unknown): number | null | "invalide" {
  if (v === null || v === undefined) return null;
  const t = String(v)
    .trim()
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, "")
    .replace(/h$/i, "");
  if (t === "") return null;
  const hm = /^([+-]?)(\d{1,4})[:h](\d{2})$/i.exec(t);
  const dec = /^([+-]?)(\d{1,4}(?:[.,]\d{1,2})?)$/.exec(t);
  let h: number;
  if (hm) {
    if (+hm[3]! > 59) return "invalide";
    h = (hm[1] === "-" ? -1 : 1) * (+hm[2]! + +hm[3]! / 60);
  } else if (dec) {
    h = (dec[1] === "-" ? -1 : 1) * Number(dec[2]!.replace(",", "."));
  } else return "invalide";
  if (Math.abs(h) > 2000) return "invalide";
  const m = Math.round(h * 60);
  return m === 0 ? 0 : m;
}
