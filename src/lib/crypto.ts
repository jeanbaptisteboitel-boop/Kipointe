import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Token aléatoire (base64url) : 32 octets par défaut, soit 256 bits d'entropie. */
export function tokenAleatoire(octets = 32): string {
  return randomBytes(octets).toString("base64url");
}

/** Comparaison en temps constant de deux chaînes. */
export function egalConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
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
