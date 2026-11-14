import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { organisation, utilisateur } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { verifierSecret } from "@/lib/auth/password";
import { accueilDe, creerSession, poserCookieSession } from "@/lib/auth/session";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { LimiteurDebit } from "@/lib/pointeuse/adms";

export const runtime = "nodejs";

const connexionSchema = z.object({ email: z.string().min(3).max(200), mot_de_passe: z.string().min(1).max(200) });

// Empreinte factice : le temps de réponse ne révèle pas si l'adresse existe.
const HASH_FACTICE = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** Dix essais par quart d'heure et par adresse e-mail (par instance du serveur). */
const essais = new LimiteurDebit(10, 15 * 60_000);

/** POST /api/auth/connexion { email, mot_de_passe } → cookie de session httpOnly. */
export const POST = route(async (req) => {
  const corps = await lireJson(req, connexionSchema);
  const email = corps.email.trim().toLowerCase();
  if (!essais.autoriser(email)) throw new HttpError(429, "TROP_DE_TENTATIVES");

  const resultat = await withBypass(getDb(), async (tx) => {
    const [ligne] = await tx
      .select({ u: utilisateur, orgActive: organisation.actif })
      .from(utilisateur)
      .innerJoin(organisation, eq(utilisateur.organisationId, organisation.id))
      .where(eq(sql`lower(${utilisateur.email})`, email))
      .limit(1);
    const ok = await verifierSecret(ligne?.u.motDePasseHash ?? HASH_FACTICE, corps.mot_de_passe);
    if (!ligne || !ligne.u.actif || !ligne.orgActive || !ok) return null;
    const { token, expireLe } = await creerSession(tx, ligne.u.id);
    return { u: ligne.u, token, expireLe };
  });

  if (!resultat) throw new HttpError(401, "IDENTIFIANTS_INVALIDES");
  await poserCookieSession(resultat.token, resultat.expireLe);
  const { u } = resultat;
  return json({ suite: u.motDePasseProvisoire ? "/compte" : accueilDe(u) });
});
