"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { organisation, tablette } from "@/db/schema";
import { ErreurMetier, actionAdmin, type Resultat } from "@/lib/actions";
import { utilisateurCourant } from "@/lib/auth/session";
import { creerTablette, definirCodeSalarie, pointerParQr, renouvelerActivation, retirerCodeSalarie } from "@/lib/tablette/service";

export async function ajouterTablette(nom: string) {
  return actionAdmin(async (tx, u) => {
    const r = await creerTablette(tx, u.organisationId, nom);
    revalidatePath("/admin/tablettes");
    return { codeActivation: r.codeActivation };
  });
}

/** Nouveau code d'activation : la tablette déjà reliée est déconnectée (perte, vol, remplacement). */
export async function nouvelleActivation(id: string) {
  return actionAdmin(async (tx) => {
    const codeActivation = await renouvelerActivation(tx, id);
    revalidatePath("/admin/tablettes");
    return { codeActivation };
  });
}

export async function modifierTablette(id: string, p: { actif: boolean }) {
  return actionAdmin(async (tx) => {
    const r = await tx.update(tablette).set({ actif: !!p.actif }).where(eq(tablette.id, id)).returning({ id: tablette.id });
    if (!r.length) throw new ErreurMetier("Tablette introuvable.");
    revalidatePath("/admin/tablettes");
  });
}

export async function supprimerTablette(id: string) {
  return actionAdmin(async (tx) => {
    await tx.delete(tablette).where(eq(tablette.id, id));
    revalidatePath("/admin/tablettes");
  });
}

export async function reglerModesTablette(p: { code: boolean; qr: boolean }) {
  return actionAdmin(async (tx, u) => {
    await tx.update(organisation).set({ tabletteCode: !!p.code, tabletteQr: !!p.qr }).where(eq(organisation.id, u.organisationId));
    revalidatePath("/admin/tablettes");
  });
}

/** Tire un nouveau code personnel : il n'est montré qu'une fois, l'ancien cesse de valoir. */
export async function genererCodeSalarie(salarieId: string) {
  return actionAdmin(async (tx, u) => {
    const code = await definirCodeSalarie(tx, u.organisationId, salarieId);
    revalidatePath("/admin/tablettes");
    return { code };
  });
}

export async function retirerCode(salarieId: string) {
  return actionAdmin(async (tx) => {
    await retirerCodeSalarie(tx, salarieId);
    revalidatePath("/admin/tablettes");
  });
}

const REFUS: Record<string, string> = {
  QR_INVALIDE: "Ce QR code n'est pas reconnu. Visez de nouveau celui de la tablette.",
  QR_EXPIRE: "Ce QR code a expiré : il change toutes les trente secondes. Visez de nouveau celui de la tablette.",
  MODE_FERME: "Le pointage par QR code n'est pas ouvert dans votre entreprise.",
  AUTRE_ENTREPRISE: "Cette tablette n'est pas celle de votre entreprise.",
  SALARIE_SORTI: "Votre fiche salarié n'est plus active : voyez votre employeur.",
};

/** Pointage du salarié connecté, sur présentation du jeton lu dans le QR code de la tablette. */
export async function pointerAvecQr(jeton: string): Promise<Resultat<{ prenom: string; sens: string; heure: string; tablette: string }>> {
  const u = await utilisateurCourant();
  if (!u) return { ok: false, erreur: "Session expirée : reconnectez-vous." };
  if (u.role === "PLATEFORME" || !u.salarieId) return { ok: false, erreur: "Ce compte n'est rattaché à aucune fiche salarié : il ne peut pas pointer." };
  try {
    const r = await pointerParQr(getDb(), { jeton, organisationId: u.organisationId, salarieId: u.salarieId });
    if (!r.ok) return { ok: false, erreur: REFUS[r.raison] ?? "Pointage impossible." };
    revalidatePath("/salarie", "layout");
    return { ok: true, prenom: r.prenom, sens: r.sens, heure: r.heure, tablette: r.tablette };
  } catch (e) {
    console.error("[pointage QR] erreur inattendue", e);
    return { ok: false, erreur: "Erreur interne, réessayez." };
  }
}
