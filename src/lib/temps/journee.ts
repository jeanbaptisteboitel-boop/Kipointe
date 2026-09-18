/**
 * Gestion du temps : tout est stocké en UTC, tout est raisonné dans le fuseau de l'établissement
 * (Europe/Paris par défaut). Une « journée de pointage » commence à `journeeDebutHeure` (04:00 par
 * défaut) pour que le service de nuit d'un restaurant reste rattaché à la veille.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, format, getISOWeek, getISOWeekYear } from "date-fns";

export type ParametresJournee = { timezone: string; journeeDebutHeure: number };

export const PARAMETRES_JOURNEE_DEFAUT: ParametresJournee = { timezone: "Europe/Paris", journeeDebutHeure: 4 };

function instantLocal(annee: number, mois: number, jour: number, heure: number, tz: string): Date {
  return new Date(new TZDate(annee, mois, jour, heure, 0, 0, 0, tz).getTime());
}

/** Début (instant UTC) de la journée de pointage contenant `instant`. */
export function debutJournee(instant: Date, p: ParametresJournee): Date {
  let local = new TZDate(instant.getTime(), p.timezone);
  if (local.getHours() < p.journeeDebutHeure) {
    local = addDays(local, -1);
  }
  return instantLocal(local.getFullYear(), local.getMonth(), local.getDate(), p.journeeDebutHeure, p.timezone);
}

/** Fin (exclue) de la journée de pointage qui commence à `debut`. */
export function finJournee(debut: Date, p: ParametresJournee): Date {
  const lendemain = addDays(new TZDate(debut.getTime(), p.timezone), 1);
  return instantLocal(lendemain.getFullYear(), lendemain.getMonth(), lendemain.getDate(), p.journeeDebutHeure, p.timezone);
}

/** Date calendaire (YYYY-MM-DD) de la journée de pointage contenant `instant`. */
export function dateJournee(instant: Date, p: ParametresJournee): string {
  return format(new TZDate(debutJournee(instant, p).getTime(), p.timezone), "yyyy-MM-dd");
}

/** Bornes [debut, fin) de la journée de pointage `dateJour` (YYYY-MM-DD). */
export function bornesJour(dateJour: string, p: ParametresJournee): { debut: Date; fin: Date } {
  const [a, m, j] = dateJour.split("-").map(Number) as [number, number, number];
  const debut = instantLocal(a, m - 1, j, p.journeeDebutHeure, p.timezone);
  return { debut, fin: finJournee(debut, p) };
}

/** Semaine ISO (lundi → dimanche) contenant une date calendaire. */
export function semaineIsoDe(dateJour: string): { annee: number; semaine: number } {
  const [a, m, j] = dateJour.split("-").map(Number) as [number, number, number];
  const d = new TZDate(a, m - 1, j, 12, 0, 0, 0, "UTC");
  return { annee: getISOWeekYear(d), semaine: getISOWeek(d) };
}

/** Les 7 dates (YYYY-MM-DD) d'une semaine ISO, du lundi au dimanche. */
export function joursSemaine(annee: number, semaine: number): string[] {
  // Le 4 janvier est toujours en semaine 1.
  const jan4 = new TZDate(annee, 0, 4, 12, 0, 0, 0, "UTC");
  const decalage = (jan4.getDay() + 6) % 7; // 0 = lundi
  const lundi1 = addDays(jan4, -decalage);
  const lundi = addDays(lundi1, (semaine - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => format(addDays(lundi, i), "yyyy-MM-dd"));
}

/** Bornes de la semaine ISO en instants UTC (du lundi `journeeDebutHeure` au lundi suivant). */
export function bornesSemaine(
  annee: number,
  semaine: number,
  p: ParametresJournee,
): { debut: Date; fin: Date; jours: string[] } {
  const jours = joursSemaine(annee, semaine);
  const debut = bornesJour(jours[0]!, p).debut;
  const fin = bornesJour(jours[6]!, p).fin;
  return { debut, fin, jours };
}

export function semaineCourante(p: ParametresJournee, maintenant = new Date()): { annee: number; semaine: number } {
  return semaineIsoDe(dateJournee(maintenant, p));
}

/** Parse « 2026-W37 » (ou « 2026-W7 »). */
export function parseSemaine(s: string | null | undefined): { annee: number; semaine: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-W(\d{1,2})$/i.exec(s.trim());
  if (!m) return null;
  const annee = Number(m[1]);
  const semaine = Number(m[2]);
  if (semaine < 1 || semaine > 53) return null;
  return { annee, semaine };
}

export function formatSemaine(annee: number, semaine: number): string {
  return `${annee}-W${String(semaine).padStart(2, "0")}`;
}

export function semaineSuivante(annee: number, semaine: number): { annee: number; semaine: number } {
  const dimanche = joursSemaine(annee, semaine)[6]!;
  const [a, m, j] = dimanche.split("-").map(Number) as [number, number, number];
  const lundiSuivant = format(addDays(new TZDate(a, m - 1, j, 12, 0, 0, 0, "UTC"), 1), "yyyy-MM-dd");
  return semaineIsoDe(lundiSuivant);
}

export function semainePrecedente(annee: number, semaine: number): { annee: number; semaine: number } {
  const lundi = joursSemaine(annee, semaine)[0]!;
  const [a, m, j] = lundi.split("-").map(Number) as [number, number, number];
  const dimanchePrecedent = format(addDays(new TZDate(a, m - 1, j, 12, 0, 0, 0, "UTC"), -1), "yyyy-MM-dd");
  return semaineIsoDe(dimanchePrecedent);
}

export function formatHeure(instant: Date, timezone: string): string {
  return format(new TZDate(instant.getTime(), timezone), "HH:mm");
}

export function formatDateHeure(instant: Date, timezone: string): string {
  return format(new TZDate(instant.getTime(), timezone), "dd/MM/yyyy HH:mm");
}

export function formatDateFr(dateJour: string): string {
  const [a, m, j] = dateJour.split("-");
  return `${j}/${m}/${a}`;
}

/** « 14/09 » : forme compacte pour les tableaux hebdomadaires, où l'année est déjà connue. */
export function formatDateCourte(dateJour: string): string {
  const [, m, j] = dateJour.split("-");
  return `${j}/${m}`;
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function nomJour(dateJour: string, court = false): string {
  const [a, m, j] = dateJour.split("-").map(Number) as [number, number, number];
  const d = new TZDate(a, m - 1, j, 12, 0, 0, 0, "UTC");
  return (court ? JOURS_COURTS : JOURS)[d.getDay()]!;
}

/** « 7 h 35 » à partir de minutes. */
export function formatDuree(minutes: number): string {
  const signe = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${signe}${h} h ${String(m).padStart(2, "0")}`;
}
