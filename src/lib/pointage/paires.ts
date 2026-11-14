/**
 * PAIRES DE POINTAGE d'une journée — code PUR.
 *
 * Une journée = des paires { entree, sortie } en « HH:MM » locales. Chaque paire porte sa
 * provenance :
 *   - 'pointeuse' : badgeage envoyé par la pointeuse (protocole ADMS) ;
 *   - 'manuel'    : journée ajoutée à la main par un administrateur ;
 *   - absente     : import du fichier CSV de la pointeuse, ou correction saisie.
 * Les minutes d'une journée sont la RÉUNION des plages : une plage couverte deux fois ne
 * compte qu'une fois.
 */
import { lundiDe, plusJours } from "@/lib/temps/zone";

export interface Pointage {
  entree: string | null;
  sortie: string | null;
  source?: string;
  /** Paire fermée par un départ en pause (code d'état « début de pause » de la pointeuse). */
  pause?: boolean;
}

export interface JourPointage {
  date: string;
  minutes: number;
  pointages: Pointage[];
  note?: string;
}

export const SOURCE_POINTEUSE = "pointeuse";
export const SOURCE_SAISIE = "manuel";

export type TypePointage = "arrivee" | "depart" | "pause_debut" | "pause_fin";

/** Délai (minutes) sous lequel un second badgeage est un double badge. */
export const DELAI_DOUBLE_BADGE = 2;

export function minutesHeure(h: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h ?? "").trim());
  if (!m) return null;
  const hh = +m[1]!;
  const mm = +m[2]!;
  return hh > 23 || mm > 59 ? null : hh * 60 + mm;
}

/** Valide une chaîne « HH:MM » (ou vide). Renvoie la valeur normalisée, ou null. */
export function normaliserHeure(v: unknown): string | null {
  const n = minutesHeure(String(v ?? ""));
  if (n === null) return null;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

/** « 7h05 », « −1h30 ». */
export function formatMinutes(min: number): string {
  const m = Math.abs(Math.round(min));
  return `${min < 0 ? "−" : ""}${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** « +3 h 15 », « −0 h 30 », « 0 h 00 » : écart ou solde signé. */
export function formatEcart(min: number): string {
  const m = Math.abs(Math.round(min));
  const signe = m === 0 ? "" : min < 0 ? "−" : "+";
  return `${signe}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/**
 * Minutes travaillées d'une journée : réunion des intervalles. Une entrée restée ouverte suivie
 * (dans l'ordre des heures) d'une sortie sans entrée forme une paire.
 */
export function minutesDepuisPointages(pointages: Pointage[] | null | undefined): number {
  const lues = (pointages ?? [])
    .filter(Boolean)
    .map((p) => ({ e: minutesHeure(p.entree), s: minutesHeure(p.sortie) }))
    .filter((p) => p.e != null || p.s != null)
    .sort((a, b) => (a.e ?? a.s!) - (b.e ?? b.s!));
  const intervalles: [number, number][] = [];
  let ouverte: number | null = null;
  for (const { e, s } of lues) {
    if (e != null && s != null) {
      if (s > e) intervalles.push([e, s]);
    } else if (e != null) {
      ouverte = e;
    } else if (ouverte != null) {
      if (s! > ouverte) intervalles.push([ouverte, s!]);
      ouverte = null;
    }
  }
  intervalles.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let fin = -1;
  for (const [d, f] of intervalles) {
    if (f <= fin) continue;
    total += f - Math.max(d, fin);
    fin = f;
  }
  return total;
}

/** Une journée a-t-elle une paire incomplète (entrée sans sortie, ou l'inverse) ? */
export function jourIncomplet(pointages: Pointage[] | null | undefined): boolean {
  return (pointages ?? []).some((p) => p && (p.entree == null) !== (p.sortie == null));
}

export function totalMinutes(jours: JourPointage[]): number {
  return jours.reduce((s, j) => s + (Number(j.minutes) || 0), 0);
}

/** Lecture tolérante du tableau `jours` stocké. */
export function lireJours(brut: unknown): JourPointage[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((j) => j && typeof j.date === "string")
    .map((j) => ({
      date: String(j.date).slice(0, 10),
      minutes: Number(j.minutes) || 0,
      pointages: Array.isArray(j.pointages) ? (j.pointages as Pointage[]).filter(Boolean).map((p) => ({ ...p })) : [],
      ...(j.note ? { note: String(j.note) } : {}),
    }));
}

/** Lundi et dimanche de la semaine d'un jour. */
export function bornesSemaine(date: string): { lundi: string; dimanche: string } {
  const lundi = lundiDe(date);
  return { lundi, dimanche: plusJours(lundi, 6) };
}

export interface ResultatPointage {
  /** Rien à écrire (entrée déjà ouverte, double badge de sortie). */
  deja: boolean;
  jours: JourPointage[];
  minutesJour: number;
  totalMinutes: number;
}

/**
 * Applique un badgeage au tableau `jours` d'une semaine, sans modifier l'entrée.
 *   - arrivée / fin de pause = ENTRÉE : une paire déjà ouverte → rien, sinon nouvelle paire ;
 *   - départ / début de pause = SORTIE : ferme la dernière paire ouverte ; sans paire ouverte,
 *     une sortie posée il y a 2 minutes au plus → rien (double badge), sinon paire sans entrée
 *     (anomalie visible, à corriger).
 */
export function appliquerPointage(joursAvant: unknown, date: string, heure: string, type: TypePointage, source: string = SOURCE_POINTEUSE): ResultatPointage {
  const avant = lireJours(joursAvant);
  const jours = avant.map((j) => ({ ...j, pointages: j.pointages.map((p) => ({ ...p })) }));
  let jour = jours.find((j) => j.date === date);
  if (!jour) {
    jour = { date, minutes: 0, pointages: [] };
    jours.push(jour);
    jours.sort((a, b) => a.date.localeCompare(b.date));
  }
  const paires = jour.pointages;
  const derniere = paires[paires.length - 1];
  const ouverte = !!derniere && derniere.entree != null && derniere.sortie == null;
  const inchange = (): ResultatPointage => ({
    deja: true,
    jours: avant,
    minutesJour: avant.find((j) => j.date === date)?.minutes ?? 0,
    totalMinutes: totalMinutes(avant),
  });

  if (type === "arrivee" || type === "pause_fin") {
    if (ouverte) return inchange();
    paires.push({ entree: heure, sortie: null, source });
  } else if (ouverte) {
    derniere!.sortie = heure;
    if (type === "pause_debut") derniere!.pause = true;
  } else {
    const s = minutesHeure(derniere?.sortie);
    const h = minutesHeure(heure);
    if (s != null && h != null && h - s >= 0 && h - s <= DELAI_DOUBLE_BADGE) return inchange();
    paires.push({ entree: null, sortie: heure, source });
  }
  jour.minutes = minutesDepuisPointages(paires);
  return { deja: false, jours, minutesJour: jour.minutes, totalMinutes: totalMinutes(jours) };
}

/**
 * Sens d'un badgeage SANS code d'état exploitable : alternance selon la paire ouverte du jour.
 * Un second badge dans les 2 minutes qui suivent le dernier est un double badge : null.
 */
export function resoudreTypeAuto(joursAvant: unknown, date: string, heure: string): TypePointage | null {
  const paires = lireJours(joursAvant).find((j) => j.date === date)?.pointages ?? [];
  const derniere = paires[paires.length - 1];
  const ouverte = !!derniere && derniere.entree != null && derniere.sortie == null;
  const dernier = minutesHeure(ouverte ? derniere?.entree : (derniere?.sortie ?? derniere?.entree));
  const h = minutesHeure(heure);
  if (dernier != null && h != null && h - dernier >= 0 && h - dernier <= DELAI_DOUBLE_BADGE) return null;
  return ouverte ? "depart" : "arrivee";
}

/** Paires saisies → paires propres (heures HH:MM, paires vides retirées, triées). */
export function normaliserPointagesSaisis(brut: unknown, source?: string): Pointage[] {
  const entrants = Array.isArray(brut) ? brut : [];
  return entrants
    .map((p): Pointage => {
      const r: Pointage = { entree: normaliserHeure(p?.entree), sortie: normaliserHeure(p?.sortie) };
      if (source) r.source = source;
      else if (p?.source === SOURCE_POINTEUSE || p?.source === SOURCE_SAISIE) r.source = p.source;
      if (p?.pause === true) r.pause = true;
      return r;
    })
    .filter((p) => p.entree || p.sortie)
    .sort((a, b) => (minutesHeure(a.entree) ?? minutesHeure(a.sortie) ?? 0) - (minutesHeure(b.entree) ?? minutesHeure(b.sortie) ?? 0));
}
