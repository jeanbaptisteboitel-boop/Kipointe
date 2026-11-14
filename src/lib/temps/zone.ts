/**
 * Heure locale d'une organisation — code PUR (Intl, aucune dépendance).
 *
 * Les journées de pointage sont des jours civils du fuseau de l'organisation
 * (« AAAA-MM-JJ »), les heures des « HH:MM » locales. La pointeuse envoie son
 * heure locale : elle est lue telle quelle, sans correction par l'horloge du serveur.
 */

export const FUSEAU_DEFAUT = "Europe/Paris";

const JOUR_MS = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

const formats = new Map<string, Intl.DateTimeFormat>();
function format(fuseau: string): Intl.DateTimeFormat {
  let f = formats.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: fuseau,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formats.set(fuseau, f);
  }
  return f;
}

export type Composantes = { annee: number; mois: number; jour: number; heure: number; minute: number; seconde: number };

/** Date et heure locales d'un instant dans un fuseau. */
export function composantes(instant: Date, fuseau: string = FUSEAU_DEFAUT): Composantes {
  const parts = format(fuseau).formatToParts(instant);
  const lire = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { annee: lire("year"), mois: lire("month"), jour: lire("day"), heure: lire("hour") % 24, minute: lire("minute"), seconde: lire("second") };
}

/** Jour civil local « AAAA-MM-JJ » d'un instant. */
export function jourLocal(instant: Date, fuseau: string = FUSEAU_DEFAUT): string {
  const c = composantes(instant, fuseau);
  return `${c.annee}-${p2(c.mois)}-${p2(c.jour)}`;
}

/** { date: 'AAAA-MM-JJ', heure: 'HH:MM' } locales d'un instant. */
export function horodatageLocal(instant: Date, fuseau: string = FUSEAU_DEFAUT): { date: string; heure: string } {
  const c = composantes(instant, fuseau);
  return { date: `${c.annee}-${p2(c.mois)}-${p2(c.jour)}`, heure: `${p2(c.heure)}:${p2(c.minute)}` };
}

/** Décalage du fuseau sur UTC, en minutes, à un instant donné (Paris : 60 l'hiver, 120 l'été). */
export function decalageMinutes(instant: Date, fuseau: string = FUSEAU_DEFAUT): number {
  const c = composantes(instant, fuseau);
  const murale = Date.UTC(c.annee, c.mois - 1, c.jour, c.heure, c.minute, c.seconde);
  return Math.round((murale - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** Instant (UTC) d'un horodatage local « AAAA-MM-JJ HH:MM[:SS] » ; null s'il est illisible. */
export function instantDepuisLocal(horodatage: string, fuseau: string = FUSEAU_DEFAUT): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(horodatage.trim());
  if (!m) return null;
  const murale = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  // Deux passes : le décalage est celui de l'instant cherché, pas de l'heure murale lue en UTC.
  let instant = new Date(murale - decalageMinutes(new Date(murale), fuseau) * 60_000);
  instant = new Date(murale - decalageMinutes(instant, fuseau) * 60_000);
  return instant;
}

// ─── Jours civils « AAAA-MM-JJ » (arithmétique à minuit UTC) ───

export function dateUtc(jour: string): Date {
  return new Date(`${jour.slice(0, 10)}T00:00:00Z`);
}

export function isoDe(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function estJourValide(jour: unknown): jour is string {
  if (typeof jour !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false;
  const d = dateUtc(jour);
  return !Number.isNaN(d.getTime()) && isoDe(d) === jour;
}

export function plusJours(jour: string, n: number): string {
  return isoDe(new Date(dateUtc(jour).getTime() + n * JOUR_MS));
}

/** Nombre de jours de `de` à `a` (négatif si `a` est avant). */
export function ecartJours(de: string, a: string): number {
  return Math.round((dateUtc(a).getTime() - dateUtc(de).getTime()) / JOUR_MS);
}

/** Lundi de la semaine d'un jour. */
export function lundiDe(jour: string): string {
  const d = dateUtc(jour);
  return isoDe(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * JOUR_MS));
}

/** Les sept jours (lundi → dimanche) de la semaine d'un lundi. */
export function joursDeSemaine(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, k) => plusJours(lundi, k));
}

/** Les `n` lundis se terminant par la semaine de `jour`, du plus ancien au plus récent. */
export function lundisJusqua(jour: string, n: number): string[] {
  const dernier = lundiDe(jour);
  return Array.from({ length: n }, (_, i) => plusJours(dernier, -(n - 1 - i) * 7));
}

/** Numéro de semaine ISO d'un jour. */
export function semaineIso(jour: string): { annee: number; semaine: number } {
  const jeudi = dateUtc(plusJours(lundiDe(jour), 3));
  const premier = Date.UTC(jeudi.getUTCFullYear(), 0, 1);
  return { annee: jeudi.getUTCFullYear(), semaine: Math.floor((jeudi.getTime() - premier) / JOUR_MS / 7) + 1 };
}

const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 14/11/2026 ». */
export function frDate(jour: string | null | undefined): string {
  if (!jour) return "—";
  const [a, m, j] = jour.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

/** « lun. 14/11 ». */
export function frJourCourt(jour: string): string {
  return `${JOURS_COURTS[dateUtc(jour).getUTCDay()]} ${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
}

/** « lundi 14 novembre 2026 ». */
export function frJourLong(jour: string): string {
  const d = dateUtc(jour);
  return `${JOURS_LONGS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « 14/11/2026 à 08:02 » dans le fuseau de l'organisation. */
export function frDateHeure(instant: Date | null | undefined, fuseau: string = FUSEAU_DEFAUT): string {
  if (!instant) return "—";
  const h = horodatageLocal(instant, fuseau);
  return `${frDate(h.date)} à ${h.heure}`;
}
