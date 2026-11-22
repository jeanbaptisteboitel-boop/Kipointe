/**
 * TABLETTE — codes et jetons (fonctions pures, sans base).
 *
 *  - code personnel : 4 à 6 chiffres tapés par le salarié ; seule son empreinte (HMAC liée à
 *    l'organisation) est gardée, ce qui permet de retrouver la fiche sans stocker le code ;
 *  - code d'activation : remis une fois par l'administrateur pour relier une tablette ;
 *  - QR code tournant : « tablette.pas.signature », où le pas change toutes les 30 secondes.
 *    Une photo du QR code envoyée à un absent cesse donc de servir presque aussitôt.
 */
import { createHmac, randomInt } from "node:crypto";
import { egalConstant, hacherTokenSession } from "@/lib/crypto";

export const DUREE_PAS_MS = 30_000;
/** Pas acceptés en plus du pas courant : le temps de sortir son téléphone et d'ouvrir la page. */
export const PAS_TOLERES = 2;
export const ESSAIS_AVANT_BLOCAGE = 5;
export const DUREE_BLOCAGE_MS = 60_000;
export const DUREE_ACTIVATION_MS = 24 * 3600 * 1000;

/** Code personnel propre (4 à 6 chiffres), ou null. */
export function normaliserCode(brut: unknown): string | null {
  const c = String(brut ?? "").replace(/\s/g, "");
  return /^\d{4,6}$/.test(c) ? c : null;
}

export function hacherCode(organisationId: string, code: string): string {
  return hacherTokenSession(`code-pointage:${organisationId}:${code}`);
}

export function codeAleatoire(chiffres = 4): string {
  return String(randomInt(0, 10 ** chiffres)).padStart(chiffres, "0");
}

// Sans 0/O, 1/I/L : le code est recopié à la main sur la tablette.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function codeActivationAleatoire(): string {
  let c = "";
  for (let i = 0; i < 8; i++) c += ALPHABET[randomInt(0, ALPHABET.length)];
  return c;
}

export function normaliserActivation(brut: unknown): string | null {
  const c = String(brut ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 8 ? c : null;
}

export function hacherActivation(code: string): string {
  return hacherTokenSession(`activation-tablette:${code}`);
}

export function pasDe(instant: Date): number {
  return Math.floor(instant.getTime() / DUREE_PAS_MS);
}

function signer(secret: string, tabletteId: string, pas: number): string {
  return createHmac("sha256", secret).update(`${tabletteId}.${pas}`).digest("base64url").slice(0, 22);
}

export function jetonQr(tabletteId: string, secret: string, instant: Date): string {
  const pas = pasDe(instant);
  return `${tabletteId}.${pas}.${signer(secret, tabletteId, pas)}`;
}

/** Découpe un jeton lu dans le QR code (sans le vérifier : le secret n'est pas encore connu). */
export function lireJetonQr(jeton: unknown): { tabletteId: string; pas: number; signature: string } | null {
  const m = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(String(jeton ?? ""));
  return m ? { tabletteId: m[1]!, pas: Number(m[2]), signature: m[3]! } : null;
}

export type VerdictQr = "VALIDE" | "EXPIRE" | "FAUX";

export function verifierJetonQr(j: { tabletteId: string; pas: number; signature: string }, secret: string, instant: Date): VerdictQr {
  if (!egalConstant(j.signature, signer(secret, j.tabletteId, j.pas))) return "FAUX";
  const ecart = pasDe(instant) - j.pas;
  return ecart >= -1 && ecart <= PAS_TOLERES ? "VALIDE" : "EXPIRE";
}
