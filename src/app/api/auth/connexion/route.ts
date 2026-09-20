import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { utilisateur } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { verifierSecret } from "@/lib/auth/password";
import { creerSession, poserCookieSession } from "@/lib/auth/session";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { connexionSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Empreinte factice : le temps de réponse ne révèle pas si l'email existe.
const HASH_FACTICE = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** POST /api/auth/connexion { email, mot_de_passe } → cookie de session httpOnly. */
export const POST = route(async (req) => {
  const corps = await lireJson(req, connexionSchema);
  const email = corps.email.trim().toLowerCase();

  const resultat = await withBypass(getDb(), async (tx) => {
    const u = await tx.query.utilisateur.findFirst({ where: eq(sql`lower(${utilisateur.email})`, email) });
    const ok = await verifierSecret(u?.motDePasseHash ?? HASH_FACTICE, corps.mot_de_passe);
    if (!u || !u.actif || !ok) return null;
    const { token, expireLe } = await creerSession(tx, u.id);
    return { u, token, expireLe };
  });

  if (!resultat) throw new HttpError(401, "IDENTIFIANTS_INVALIDES");
  await poserCookieSession(resultat.token, resultat.expireLe);
  const { u } = resultat;
  return json({ utilisateur: { id: u.id, prenom: u.prenom, nom: u.nom, role: u.role } });
});
