/**
 * Parseur du FICHIER CSV de pointage exporté par une pointeuse NGTeco — code PUR.
 *
 * Le fichier contient un bloc par employé :
 *   Période de paie ,,,22/06/2026-28/06/2026,
 *   Employé,,,Melanie  Jourdain (2),
 *   Date,,ENTRÉE,SORTIE,Temps de travail, Total quotidien, Note,
 *   LUN,22/06/2026,07:04,13:24,06:20,
 *   ,,14:13,17:40,03:27,09:47,
 *   …
 *   Heures totales,,,,,44:44,
 *
 * Colonnes : [jour, date, entrée, sortie, tempsTravail, totalQuotidien, note]. Le numéro entre
 * parenthèses est celui du salarié dans la pointeuse. Une période de plusieurs semaines est
 * redécoupée par semaine civile (lundi → dimanche).
 */
import { lundiDe, plusJours } from "@/lib/temps/zone";
import { minutesDepuisPointages, SOURCE_POINTEUSE, SOURCE_SAISIE, SOURCE_TABLETTE, totalMinutes, type JourPointage, type Pointage } from "./paires";

export interface SemaineEmploye {
  nom: string;
  pointeuseRef: string | null;
  /** Lundi de la semaine. */
  semaineDebut: string;
  semaineFin: string;
  totalMinutes: number;
  jours: JourPointage[];
}

const JOURS = new Set(["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]);

function parseDuree(s: string | undefined): number | null {
  const m = /^(\d{1,3}):(\d{2})$/.exec((s ?? "").trim());
  return m ? +m[1]! * 60 + +m[2]! : null;
}

function parseHeure(s: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m || +m[1]! > 23 || +m[2]! > 59) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function parseDateFr(s: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

interface Bloc {
  employe: string;
  lignes: string[][];
}

export function parsePointageCsv(texte: string): SemaineEmploye[] {
  const blocs: Bloc[] = [];
  let cur: Bloc | null = null;
  for (const brute of texte.replace(/^﻿/, "").split(/\r?\n/)) {
    // Le fichier est séparé par des virgules ; un tableur français le réenregistre avec des points-virgules.
    const cols = brute.split(brute.includes(";") && !brute.includes(",") ? ";" : ",");
    const c0 = (cols[0] ?? "").trim();
    if (c0.startsWith("Période de paie")) {
      if (cur) blocs.push(cur);
      cur = { employe: "", lignes: [] };
      continue;
    }
    if (!cur) continue;
    if (c0 === "Employé") {
      cur.employe = (cols[3] ?? "").trim();
      continue;
    }
    if (c0 === "Date" || c0.startsWith("Heures totales")) continue;
    cur.lignes.push(cols);
  }
  if (cur) blocs.push(cur);
  return blocs.flatMap(traiterBloc);
}

function traiterBloc(b: Bloc): SemaineEmploye[] {
  const em = /^(.*?)\s*(?:\((\d+)\))?\s*$/.exec(b.employe);
  const nom = (em?.[1] ?? b.employe).replace(/\s+/g, " ").trim();
  const pointeuseRef = em?.[2] ?? null;
  if (!nom) return [];

  const parDate = new Map<string, { notes: string[]; pointages: Pointage[] }>();
  let dateCourante: string | null = null;
  for (const cols of b.lignes) {
    const jour = (cols[0] ?? "").trim().toUpperCase();
    if (JOURS.has(jour)) {
      dateCourante = parseDateFr(cols[1]);
      if (dateCourante && !parDate.has(dateCourante)) parDate.set(dateCourante, { notes: [], pointages: [] });
    }
    if (!dateCourante) continue;
    const rec = parDate.get(dateCourante);
    if (!rec) continue;
    const entree = parseHeure(cols[2]);
    const sortie = parseHeure(cols[3]);
    if (entree || sortie) rec.pointages.push({ entree, sortie });
    // Le « temps de travail » et le « total quotidien » du fichier ne sont pas repris : les
    // minutes sont recalculées sur les paires, comme pour toutes les autres provenances.
    void parseDuree(cols[4]);
    const note = (cols[6] ?? "").trim();
    if (note) rec.notes.push(note);
  }

  const parSemaine = new Map<string, JourPointage[]>();
  for (const [date, rec] of [...parDate].sort((a, b) => a[0].localeCompare(b[0]))) {
    const jour: JourPointage = { date, minutes: minutesDepuisPointages(rec.pointages), pointages: rec.pointages, ...(rec.notes.length ? { note: rec.notes.join(" ; ") } : {}) };
    const lundi = lundiDe(date);
    parSemaine.set(lundi, [...(parSemaine.get(lundi) ?? []), jour]);
  }
  return [...parSemaine].map(([lundi, jours]) => ({
    nom,
    pointeuseRef,
    semaineDebut: lundi,
    semaineFin: plusJours(lundi, 6),
    totalMinutes: totalMinutes(jours),
    jours,
  }));
}

/** Normalise un nom pour l'appariement (minuscules, sans accents, espaces simples). */
export function normaliserNom(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleTri(p: Pointage): number {
  const lire = (h: string | null) => {
    const m = /^(\d{2}):(\d{2})$/.exec(h ?? "");
    return m ? +m[1]! * 60 + +m[2]! : null;
  };
  return lire(p.entree) ?? lire(p.sortie) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Import d'une semaine par-dessus une semaine existante. Le fichier vient de la pointeuse :
 * pour chaque jour qu'il porte AVEC des paires, il remplace ce qui était enregistré (badgeages
 * reçus en direct et corrections compris). Sont conservés :
 *   - les jours absents du fichier ;
 *   - les journées AJOUTÉES À LA MAIN (source 'manuel') quand le jour du fichier est vide — le
 *     fichier liste chaque jour, même sans badgeage ; remplacées sinon, et signalées ;
 *   - les badgeages reçus en direct (source 'pointeuse') d'un jour que le fichier laisse vide
 *     (export antérieur au badgeage).
 */
export function fusionnerImport(joursImportes: JourPointage[], joursExistants: JourPointage[]): {
  jours: JourPointage[];
  totalMinutes: number;
  conserves: number;
  saisiesRemplacees: string[];
} {
  const importes = new Map(joursImportes.map((j) => [j.date, j]));
  const saisiesRemplacees: string[] = [];
  let conserves = 0;
  const jours: JourPointage[] = joursImportes.map((j) => ({ ...j, pointages: [...j.pointages] }));
  for (const existant of joursExistants) {
    const importe = importes.get(existant.date);
    if (!importe) {
      jours.push({ ...existant, pointages: [...existant.pointages] });
      conserves += existant.pointages.length;
      continue;
    }
    if (importe.pointages.length > 0) {
      if (existant.pointages.some((p) => p.source === SOURCE_SAISIE)) saisiesRemplacees.push(existant.date);
      continue;
    }
    const gardees = existant.pointages.filter((p) => p.source === SOURCE_SAISIE || p.source === SOURCE_POINTEUSE || p.source === SOURCE_TABLETTE);
    if (!gardees.length) continue;
    const cible = jours.find((j) => j.date === existant.date)!;
    cible.pointages = [...gardees].sort((a, b) => cleTri(a) - cleTri(b));
    cible.minutes = minutesDepuisPointages(cible.pointages);
    conserves += gardees.length;
  }
  jours.sort((a, b) => a.date.localeCompare(b.date));
  return { jours, totalMinutes: totalMinutes(jours), conserves, saisiesRemplacees: saisiesRemplacees.sort() };
}
