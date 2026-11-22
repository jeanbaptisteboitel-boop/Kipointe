"use server";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { organisation, session, utilisateur } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { ErreurMetier, actionAdmin, actionConnecte, actionPlateforme, type Resultat } from "@/lib/actions";
import { hacherSecret, verifierSecret } from "@/lib/auth/password";
import { COOKIE_SESSION, accueilDe, utilisateurCourant } from "@/lib/auth/session";
import { hacherTokenSession, tokenAleatoire } from "@/lib/crypto";
import { marquerLues } from "@/lib/notifications/service";

/** Change son mot de passe (tous rôles). Les autres sessions du compte sont fermées. */
export async function changerMotDePasse(p: { actuel: string; nouveau: string }): Promise<Resultat<{ suite: string }>> {
  const u = await utilisateurCourant();
  if (!u) return { ok: false, erreur: "Session expirée : reconnectez-vous." };
  if (typeof p.nouveau !== "string" || p.nouveau.length < 10) return { ok: false, erreur: "Le nouveau mot de passe doit compter au moins 10 caractères." };
  if (p.nouveau === p.actuel) return { ok: false, erreur: "Le nouveau mot de passe doit être différent de l'actuel." };
  const token = (await cookies()).get(COOKIE_SESSION)?.value ?? "";
  return withBypass(getDb(), async (tx) => {
    const [compte] = await tx.select().from(utilisateur).where(eq(utilisateur.id, u.id));
    if (!compte || !(await verifierSecret(compte.motDePasseHash, String(p.actuel ?? "")))) return { ok: false as const, erreur: "Mot de passe actuel incorrect." };
    await tx.update(utilisateur).set({ motDePasseHash: await hacherSecret(p.nouveau), motDePasseProvisoire: false }).where(eq(utilisateur.id, u.id));
    await tx.delete(session).where(and(eq(session.utilisateurId, u.id), ne(session.tokenHash, hacherTokenSession(token))));
    return { ok: true as const, suite: accueilDe(u) };
  });
}

/** Marque lues ses notifications : celles de l'entreprise pour l'administrateur (`pourAdmins`), les siennes sinon. */
export async function marquerNotificationsLues(pourAdmins: boolean) {
  return actionConnecte(async (tx, u) => {
    if (pourAdmins && u.role !== "ADMIN") throw new ErreurMetier("Action réservée à l'administrateur.");
    if (!pourAdmins && !u.salarieId) return;
    await marquerLues(tx, u.organisationId, pourAdmins ? null : u.salarieId);
    revalidatePath("/", "layout");
  });
}

export async function modifierOrganisation(p: { raisonSociale: string; siret: string; seuilEcartMinutes: string; notificationsEmail: boolean }) {
  return actionAdmin(async (tx, u) => {
    const raisonSociale = p.raisonSociale.trim().slice(0, 160);
    if (!raisonSociale) throw new ErreurMetier("La raison sociale est obligatoire.");
    const siret = p.siret.replace(/\s/g, "");
    if (siret && !/^\d{14}$/.test(siret)) throw new ErreurMetier("SIRET : 14 chiffres.");
    const seuil = Number(p.seuilEcartMinutes);
    if (!Number.isInteger(seuil) || seuil < 1 || seuil > 600) throw new ErreurMetier("Seuil de notification : de 1 à 600 minutes.");
    await tx.update(organisation).set({ raisonSociale, siret: siret || null, seuilEcartMinutes: seuil, notificationsEmail: !!p.notificationsEmail }).where(eq(organisation.id, u.organisationId));
    revalidatePath("/", "layout");
  });
}

/** Éditeur : crée une entreprise cliente et son premier administrateur (mot de passe provisoire affiché une fois). */
export async function creerClient(p: { raisonSociale: string; siret: string; email: string; prenom: string; nom: string }) {
  return actionPlateforme(async (tx) => {
    const raisonSociale = p.raisonSociale.trim().slice(0, 160);
    const email = p.email.trim().toLowerCase();
    const prenom = p.prenom.trim().slice(0, 80);
    const nom = p.nom.trim().slice(0, 80);
    if (!raisonSociale || !prenom || !nom) throw new ErreurMetier("Raison sociale, prénom et nom de l'administrateur sont obligatoires.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErreurMetier("Adresse e-mail invalide.");
    const siret = p.siret.replace(/\s/g, "");
    if (siret && !/^\d{14}$/.test(siret)) throw new ErreurMetier("SIRET : 14 chiffres.");
    const [existe] = await tx.select({ id: utilisateur.id }).from(utilisateur).where(eq(utilisateur.email, email));
    if (existe) throw new ErreurMetier("Cette adresse e-mail a déjà un compte.");
    const motDePasse = tokenAleatoire(9);
    const [org] = await tx.insert(organisation).values({ raisonSociale, siret: siret || null }).returning({ id: organisation.id });
    await tx.insert(utilisateur).values({ organisationId: org!.id, email, nom, prenom, motDePasseHash: await hacherSecret(motDePasse), motDePasseProvisoire: true, role: "ADMIN" });
    revalidatePath("/plateforme");
    return { email, motDePasse };
  });
}

/** Éditeur : suspend ou rétablit un client (connexions et réception des badgeages). */
export async function basculerClient(id: string, actif: boolean) {
  return actionPlateforme(async (tx) => {
    const r = await tx.update(organisation).set({ actif }).where(and(eq(organisation.id, id), eq(organisation.plateforme, false))).returning({ id: organisation.id });
    if (!r.length) throw new ErreurMetier("Client introuvable.");
    revalidatePath("/plateforme");
  });
}

/** Ouvre ou ferme l'option SMS d'un client (facturée à l'usage). La fermer coupe aussitôt le pointage par SMS. */
export async function basculerOptionSms(id: string, ouverte: boolean) {
  return actionPlateforme(async (tx) => {
    const r = await tx
      .update(organisation)
      .set(ouverte ? { optionSms: true } : { optionSms: false, tabletteSms: false })
      .where(and(eq(organisation.id, id), eq(organisation.plateforme, false)))
      .returning({ id: organisation.id });
    if (!r.length) throw new ErreurMetier("Client introuvable.");
    revalidatePath("/plateforme");
  });
}
