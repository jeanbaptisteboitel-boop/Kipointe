/**
 * Sessions maison : cookie httpOnly contenant un token aléatoire ; seule son empreinte HMAC est en base.
 */
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Tx } from "@/db";
import { session, utilisateur, type Utilisateur } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { hacherTokenSession, tokenAleatoire } from "@/lib/crypto";
import { HttpError } from "@/lib/http";

export const COOKIE_SESSION = "kipointe_session";
const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000;

export type UtilisateurConnecte = Pick<
  Utilisateur,
  "id" | "organisationId" | "email" | "nom" | "prenom" | "role" | "salarieId"
>;

export async function creerSession(tx: Tx, utilisateurId: string): Promise<{ token: string; expireLe: Date }> {
  const token = tokenAleatoire(32);
  const expireLe = new Date(Date.now() + DUREE_SESSION_MS);
  await tx.insert(session).values({ tokenHash: hacherTokenSession(token), utilisateurId, expireLe });
  return { token, expireLe };
}

export async function poserCookieSession(token: string, expireLe: Date): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_SESSION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expireLe,
  });
}

export async function supprimerSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_SESSION)?.value;
  if (token) {
    await withBypass(getDb(), async (tx) => {
      await tx.delete(session).where(eq(session.tokenHash, hacherTokenSession(token)));
    });
  }
  store.delete(COOKIE_SESSION);
}

/** Utilisateur connecté (ou null). Lecture seule : utilisable dans les Server Components. */
export async function utilisateurCourant(): Promise<UtilisateurConnecte | null> {
  const store = await cookies();
  const token = store.get(COOKIE_SESSION)?.value;
  if (!token) return null;
  const tokenHash = hacherTokenSession(token);
  return withBypass(getDb(), async (tx) => {
    const rows = await tx
      .select({
        id: utilisateur.id,
        organisationId: utilisateur.organisationId,
        email: utilisateur.email,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        role: utilisateur.role,
        salarieId: utilisateur.salarieId,
        actif: utilisateur.actif,
      })
      .from(session)
      .innerJoin(utilisateur, eq(session.utilisateurId, utilisateur.id))
      .where(and(eq(session.tokenHash, tokenHash), gt(session.expireLe, new Date())))
      .limit(1);
    const u = rows[0];
    if (!u || !u.actif) return null;
    const { actif: _actif, ...reste } = u;
    return reste;
  });
}

/** Pages gérant : redirige vers la connexion si nécessaire. */
export async function exigerGerant(): Promise<UtilisateurConnecte> {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (u.role !== "GERANT") redirect("/salarie");
  return u;
}

/** Pages salarié : compte SALARIE ou GERANT. */
export async function exigerConnecte(): Promise<UtilisateurConnecte> {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return u;
}

/** Routes API admin. */
export async function exigerGerantApi(): Promise<UtilisateurConnecte> {
  const u = await utilisateurCourant();
  if (!u) throw new HttpError(401, "NON_CONNECTE");
  if (u.role !== "GERANT") throw new HttpError(403, "ROLE_INSUFFISANT");
  return u;
}

export async function exigerConnecteApi(): Promise<UtilisateurConnecte> {
  const u = await utilisateurCourant();
  if (!u) throw new HttpError(401, "NON_CONNECTE");
  return u;
}
