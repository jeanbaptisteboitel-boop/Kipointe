/**
 * Jours fériés légaux en France métropolitaine (article L.3133-1 du Code du travail) — code PUR.
 * Les jours propres à l'Alsace-Moselle et aux départements d'outre-mer ne sont pas comptés.
 */
import { dateUtc, isoDe } from "@/lib/temps/zone";

const JOUR_MS = 86_400_000;

/** Dimanche de Pâques (algorithme de Meeus / Butcher), « AAAA-MM-JJ ». */
export function paques(annee: number): string {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDe(new Date(Date.UTC(annee, mois - 1, jour)));
}

const cache = new Map<number, Map<string, string>>();

/** Jours fériés d'une année : date → libellé. */
export function joursFeries(annee: number): Map<string, string> {
  let m = cache.get(annee);
  if (m) return m;
  const p = dateUtc(paques(annee)).getTime();
  const plus = (n: number) => isoDe(new Date(p + n * JOUR_MS));
  m = new Map([
    [`${annee}-01-01`, "Jour de l'an"],
    [plus(1), "Lundi de Pâques"],
    [`${annee}-05-01`, "Fête du Travail"],
    [`${annee}-05-08`, "Victoire 1945"],
    [plus(39), "Ascension"],
    [plus(50), "Lundi de Pentecôte"],
    [`${annee}-07-14`, "Fête nationale"],
    [`${annee}-08-15`, "Assomption"],
    [`${annee}-11-01`, "Toussaint"],
    [`${annee}-11-11`, "Armistice 1918"],
    [`${annee}-12-25`, "Noël"],
  ]);
  cache.set(annee, m);
  return m;
}

export function estJourFerie(jour: string): boolean {
  return joursFeries(Number(jour.slice(0, 4))).has(jour.slice(0, 10));
}

export function libelleFerie(jour: string): string | null {
  return joursFeries(Number(jour.slice(0, 4))).get(jour.slice(0, 10)) ?? null;
}
