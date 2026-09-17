import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function sha256Hex(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

export function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Token aléatoire (base64url) : 32 octets par défaut, soit 256 bits d'entropie. */
export function tokenAleatoire(octets = 32): string {
  return randomBytes(octets).toString("base64url");
}

/** PIN initial à 4 chiffres, tirage cryptographique. */
export function genererPin(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

/** Code d'appairage à 8 chiffres (affiché « 1234-5678 »), valable 15 minutes. */
export function genererCodeAppairage(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function normaliserCodeAppairage(code: string): string {
  return code.replace(/\D/g, "");
}

/** Comparaison en temps constant de deux chaînes. */
export function egalConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Vérificateur de PIN hors ligne remis à la tablette après un pointage réussi en ligne.
 * La tablette recalcule la même valeur (WebCrypto) avec son token pour vérifier un PIN sans réseau.
 * Le serveur ne stocke rien : il dérive la clé du token porteur présent dans la requête.
 */
export function verificateurHorsLigne(tokenTerminal: string, badgeUuid: string, pinVersion: number, pin: string): string {
  const cle = createHash("sha256").update(`kipointe-verif:${tokenTerminal}`).digest();
  return createHmac("sha256", cle).update(`${badgeUuid}:${pinVersion}:${pin}`).digest("base64url");
}

/** Empreinte HMAC des tokens de session (clé = SESSION_SECRET) : une fuite de la table ne suffit pas à rejouer une session. */
export function hacherTokenSession(token: string): string {
  return createHmac("sha256", secretSession()).update(token).digest("hex");
}

function secretSession(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET manquante ou trop courte (16 caractères minimum).");
  }
  return "dev-secret-non-securise";
}
