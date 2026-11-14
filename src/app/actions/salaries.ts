"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { Tx } from "@/db";
import { organisation, salarie, session, utilisateur } from "@/db/schema";
import { ErreurMetier, actionAdmin } from "@/lib/actions";
import { hacherSecret } from "@/lib/auth/password";
import { tokenAleatoire } from "@/lib/crypto";
import { lireSoldeHeures } from "@/lib/heures/compteur";
import { journaliserAcces } from "@/lib/journal";
import { planningOrganisation, planningsEgaux, validerPlanning } from "@/lib/planning";
import { normaliserPin } from "@/lib/pointeuse/adms";
import { retraiterNonRattaches } from "@/lib/pointeuse/enregistrement";
import { estJourValide } from "@/lib/temps/zone";

export interface SaisieSalarie {
  nom: string;
  prenom: string;
  matricule?: string;
  email?: string;
  pointeuseRef?: string;
  dateEntree?: string;
  dateSortie?: string;
  actif?: boolean;
}

function texte(v: unknown, max = 120): string | null {
  const t = String(v ?? "").trim().slice(0, max);
  return t || null;
}

function dateOuNull(v: unknown, libelle: string): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (!estJourValide(t)) throw new ErreurMetier(`${libelle} : date invalide.`);
  return t;
}

async function lireSaisie(tx: Tx, organisationId: string, s: SaisieSalarie, saufId?: string) {
  const nom = texte(s.nom);
  const prenom = texte(s.prenom);
  if (!nom || !prenom) throw new ErreurMetier("Nom et prénom sont obligatoires.");
  const email = texte(s.email, 200)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErreurMetier("Adresse e-mail invalide.");
  const pointeuseRef = normaliserPin(s.pointeuseRef) || null;
  if (pointeuseRef && pointeuseRef.length > 32) throw new ErreurMetier("Numéro de pointeuse trop long.");
  const dateEntree = dateOuNull(s.dateEntree, "Date d'entrée");
  const dateSortie = dateOuNull(s.dateSortie, "Date de sortie");
  if (dateEntree && dateSortie && dateSortie < dateEntree) throw new ErreurMetier("La date de sortie précède la date d'entrée.");
  if (pointeuseRef) {
    const doublons = await tx
      .select({ id: salarie.id, nom: salarie.nom, prenom: salarie.prenom })
      .from(salarie)
      .where(and(eq(salarie.organisationId, organisationId), eq(salarie.pointeuseRef, pointeuseRef), eq(salarie.actif, true), saufId ? ne(salarie.id, saufId) : undefined));
    if (doublons.length) throw new ErreurMetier(`Le numéro de pointeuse ${pointeuseRef} est déjà celui de ${doublons[0]!.prenom} ${doublons[0]!.nom}.`);
  }
  return { nom, prenom, matricule: texte(s.matricule, 40), email, pointeuseRef, dateEntree, dateSortie };
}

export async function creerSalarie(s: SaisieSalarie) {
  return actionAdmin(async (tx, u) => {
    const valeurs = await lireSaisie(tx, u.organisationId, s);
    const [cree] = await tx.insert(salarie).values({ organisationId: u.organisationId, ...valeurs }).returning({ id: salarie.id });
    // Des badgeages portant déjà ce numéro attendaient peut-être une fiche.
    if (valeurs.pointeuseRef) await retraiterNonRattaches(tx, u.organisationId, { pin: valeurs.pointeuseRef });
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: cree!.id, action: "SALARIE_CREE" });
    revalidatePath("/", "layout");
    return { id: cree!.id };
  });
}

export async function modifierSalarie(id: string, s: SaisieSalarie) {
  return actionAdmin(async (tx, u) => {
    const valeurs = await lireSaisie(tx, u.organisationId, s, id);
    const maj = await tx
      .update(salarie)
      .set({ ...valeurs, actif: s.actif !== false })
      .where(eq(salarie.id, id))
      .returning({ id: salarie.id });
    if (!maj.length) throw new ErreurMetier("Salarié introuvable.");
    // Un salarié désactivé perd l'accès à son espace.
    if (s.actif === false) {
      const comptes = await tx.update(utilisateur).set({ actif: false }).where(and(eq(utilisateur.salarieId, id), eq(utilisateur.role, "SALARIE"))).returning({ id: utilisateur.id });
      for (const c of comptes) await tx.delete(session).where(eq(session.utilisateurId, c.id));
    }
    if (valeurs.pointeuseRef) await retraiterNonRattaches(tx, u.organisationId, { pin: valeurs.pointeuseRef });
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "SALARIE_MODIFIE" });
    revalidatePath("/", "layout");
  });
}

/** Planning propre d'un salarié (null = revenir au planning de l'entreprise), ou planning par défaut de l'entreprise (salarieId null). */
export async function definirPlanning(salarieId: string | null, planning: unknown) {
  return actionAdmin(async (tx, u) => {
    const [org] = await tx.select().from(organisation).where(eq(organisation.id, u.organisationId));
    if (salarieId === null) {
      const v = validerPlanning(planning);
      if (!v.ok) throw new ErreurMetier(v.erreur);
      await tx.update(organisation).set({ planningDefaut: v.planning }).where(eq(organisation.id, u.organisationId));
    } else if (planning === null) {
      await tx.update(salarie).set({ planning: null }).where(eq(salarie.id, salarieId));
    } else {
      const v = validerPlanning(planning);
      if (!v.ok) throw new ErreurMetier(v.erreur);
      // Identique à celui de l'entreprise : le salarié continue de suivre ce dernier et ses changements.
      const identique = planningsEgaux(v.planning, planningOrganisation(org));
      await tx.update(salarie).set({ planning: identique ? null : v.planning }).where(eq(salarie.id, salarieId));
      revalidatePath("/", "layout");
      return { identique };
    }
    revalidatePath("/", "layout");
    return { identique: false };
  });
}

/** Compteur d'heures : date de départ et solde repris à cette date (vides = valeurs par défaut). */
export async function reglerCompteur(salarieId: string, p: { depart: string; solde: string }) {
  return actionAdmin(async (tx, u) => {
    const depart = dateOuNull(p.depart, "Date de départ");
    const solde = lireSoldeHeures(p.solde);
    if (solde === "invalide") throw new ErreurMetier("Solde invalide : en heures, par exemple 3,5 ou -1:30.");
    if (solde && !depart) throw new ErreurMetier("Un solde de départ demande une date de départ.");
    await tx.update(salarie).set({ compteurDepart: depart, compteurSoldeDepartMinutes: solde ?? 0 }).where(eq(salarie.id, salarieId));
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId, action: "COMPTEUR_REGLE", detail: { depart, solde: solde ?? 0 } });
    revalidatePath("/", "layout");
  });
}

/** Solde de congés payés constaté à une date (vide = pas de suivi du solde). */
export async function reglerSoldeConges(salarieId: string, p: { solde: string; au: string }) {
  return actionAdmin(async (tx) => {
    const brut = String(p.solde ?? "").trim().replace(",", ".");
    if (!brut) {
      await tx.update(salarie).set({ cpSoldeJours: null, cpSoldeAu: null }).where(eq(salarie.id, salarieId));
    } else {
      const n = Number(brut);
      if (!Number.isFinite(n) || n < -60 || n > 120) throw new ErreurMetier("Solde de congés invalide (en jours).");
      const au = dateOuNull(p.au, "Date du solde");
      if (!au) throw new ErreurMetier("Indiquez la date à laquelle ce solde est constaté.");
      await tx.update(salarie).set({ cpSoldeJours: Math.round(n * 2) / 2, cpSoldeAu: au }).where(eq(salarie.id, salarieId));
    }
    revalidatePath("/", "layout");
  });
}

/**
 * Ouvre (ou réinitialise) l'accès du salarié à son espace : compte à son adresse e-mail et mot de
 * passe provisoire, affiché une seule fois à l'administrateur, à changer à la première connexion.
 */
export async function ouvrirAcces(salarieId: string) {
  return actionAdmin(async (tx, u) => {
    const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, salarieId));
    if (!fiche) throw new ErreurMetier("Salarié introuvable.");
    if (!fiche.email) throw new ErreurMetier("Renseignez d'abord l'adresse e-mail du salarié : elle sert d'identifiant.");
    const motDePasse = tokenAleatoire(9);
    const motDePasseHash = await hacherSecret(motDePasse);
    const [compte] = await tx.select().from(utilisateur).where(eq(utilisateur.salarieId, salarieId));
    if (compte) {
      await tx.update(utilisateur).set({ motDePasseHash, motDePasseProvisoire: true, actif: true, email: compte.role === "SALARIE" ? fiche.email : compte.email }).where(eq(utilisateur.id, compte.id));
      await tx.delete(session).where(eq(session.utilisateurId, compte.id));
      await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId, action: "ACCES_REINITIALISE" });
      revalidatePath("/", "layout");
      return { email: compte.role === "SALARIE" ? fiche.email : compte.email, motDePasse };
    }
    const [pris] = await tx.select({ n: sql<number>`count(*)::int` }).from(utilisateur).where(eq(sql`lower(${utilisateur.email})`, fiche.email));
    // L'adresse peut appartenir à un compte d'une autre entreprise : invisible d'ici, la contrainte d'unicité tranche.
    if ((pris?.n ?? 0) > 0) throw new ErreurMetier("Cette adresse e-mail a déjà un compte.");
    try {
      await tx.insert(utilisateur).values({ organisationId: u.organisationId, email: fiche.email, nom: fiche.nom, prenom: fiche.prenom, motDePasseHash, motDePasseProvisoire: true, role: "SALARIE", salarieId });
    } catch {
      throw new ErreurMetier("Cette adresse e-mail a déjà un compte Kipointe.");
    }
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId, action: "ACCES_OUVERT" });
    revalidatePath("/", "layout");
    return { email: fiche.email, motDePasse };
  });
}
