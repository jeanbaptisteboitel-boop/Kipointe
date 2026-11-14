/**
 * Enveloppe des actions serveur : authentification, rôle, transaction limitée à l'organisation
 * (RLS) et erreurs métier rendues sous forme de message.
 *
 * Une action rend `{ ok: true, … }` ou `{ ok: false, erreur }` : le composant affiche le message.
 */
import { getDb, type Tx } from "@/db";
import { withBypass, withTenant } from "@/db/tenant";
import { utilisateurCourant, type UtilisateurConnecte } from "@/lib/auth/session";

/** Erreur attendue, dont le message est destiné à l'utilisateur. */
export class ErreurMetier extends Error {}

export type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

async function executer<T extends object>(fn: () => Promise<T | void>): Promise<Resultat<T>> {
  try {
    const r = await fn();
    return { ok: true, ...((r ?? {}) as T) };
  } catch (e) {
    if (e instanceof ErreurMetier) return { ok: false, erreur: e.message };
    // Les redirections de Next sont des exceptions à laisser passer.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[action] erreur inattendue", e);
    return { ok: false, erreur: "Erreur interne, réessayez." };
  }
}

async function connecte(): Promise<UtilisateurConnecte> {
  const u = await utilisateurCourant();
  if (!u) throw new ErreurMetier("Session expirée : reconnectez-vous.");
  return u;
}

/** Action réservée à l'administrateur de l'organisation. */
export function actionAdmin<T extends object>(fn: (tx: Tx, u: UtilisateurConnecte) => Promise<T | void>): Promise<Resultat<T>> {
  return executer(async () => {
    const u = await connecte();
    if (u.role !== "ADMIN") throw new ErreurMetier("Action réservée à l'administrateur.");
    return withTenant(getDb(), u.organisationId, (tx) => fn(tx, u));
  });
}

/** Action d'un utilisateur de l'organisation (administrateur ou salarié). */
export function actionConnecte<T extends object>(fn: (tx: Tx, u: UtilisateurConnecte) => Promise<T | void>): Promise<Resultat<T>> {
  return executer(async () => {
    const u = await connecte();
    if (u.role === "PLATEFORME") throw new ErreurMetier("Action indisponible pour ce compte.");
    return withTenant(getDb(), u.organisationId, (tx) => fn(tx, u));
  });
}

/** Action de l'éditeur : hors du cloisonnement par organisation. */
export function actionPlateforme<T extends object>(fn: (tx: Tx, u: UtilisateurConnecte) => Promise<T | void>): Promise<Resultat<T>> {
  return executer(async () => {
    const u = await connecte();
    if (u.role !== "PLATEFORME") throw new ErreurMetier("Action réservée à l'éditeur.");
    return withBypass(getDb(), (tx) => fn(tx, u));
  });
}
