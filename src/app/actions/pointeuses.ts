"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { badgeage, pointeuse, salarie } from "@/db/schema";
import { ErreurMetier, actionAdmin } from "@/lib/actions";
import { MODES_STATUT, normaliserNumeroSerie, normaliserPin, type ModeStatut } from "@/lib/pointeuse/adms";
import { retraiterNonRattaches } from "@/lib/pointeuse/enregistrement";

export async function ajouterPointeuse(p: { numeroSerie: string; nom: string }) {
  return actionAdmin(async (tx, u) => {
    const numeroSerie = normaliserNumeroSerie(p.numeroSerie);
    if (!numeroSerie) throw new ErreurMetier("Numéro de série invalide : 4 à 40 lettres, chiffres ou tirets, tel qu'il figure au dos de l'appareil.");
    try {
      await tx.insert(pointeuse).values({ organisationId: u.organisationId, numeroSerie, nom: p.nom.trim().slice(0, 80) || null });
    } catch {
      // Un numéro de série est unique tous clients confondus.
      throw new ErreurMetier("Ce numéro de série est déjà enregistré.");
    }
    revalidatePath("/admin/pointeuses");
  });
}

export async function modifierPointeuse(id: string, p: { nom?: string; actif?: boolean; modeStatut?: string }) {
  return actionAdmin(async (tx) => {
    const maj: { nom?: string | null; actif?: boolean; modeStatut?: ModeStatut } = {};
    if (p.nom !== undefined) maj.nom = p.nom.trim().slice(0, 80) || null;
    if (p.actif !== undefined) maj.actif = !!p.actif;
    if (p.modeStatut !== undefined) {
      if (!(MODES_STATUT as readonly string[]).includes(p.modeStatut)) throw new ErreurMetier("Mode inconnu.");
      maj.modeStatut = p.modeStatut as ModeStatut;
    }
    const r = await tx.update(pointeuse).set(maj).where(eq(pointeuse.id, id)).returning({ id: pointeuse.id });
    if (!r.length) throw new ErreurMetier("Pointeuse introuvable.");
    revalidatePath("/admin/pointeuses");
  });
}

export async function supprimerPointeuse(id: string) {
  return actionAdmin(async (tx) => {
    await tx.delete(pointeuse).where(eq(pointeuse.id, id));
    revalidatePath("/admin/pointeuses");
  });
}

/** Pose le numéro de pointeuse sur une fiche et reporte les badgeages qui l'attendaient. */
export async function rattacherBadge(p: { pin: string; salarieId: string }) {
  return actionAdmin(async (tx, u) => {
    const pin = normaliserPin(p.pin);
    const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, p.salarieId));
    if (!pin || !fiche) throw new ErreurMetier("Salarié introuvable.");
    if (fiche.pointeuseRef && normaliserPin(fiche.pointeuseRef) !== pin) {
      throw new ErreurMetier(`${fiche.prenom} ${fiche.nom} porte déjà le numéro ${fiche.pointeuseRef} : modifiez sa fiche si ce numéro a changé.`);
    }
    await tx.update(salarie).set({ pointeuseRef: pin }).where(eq(salarie.id, fiche.id));
    const bilan = await retraiterNonRattaches(tx, u.organisationId, { pin });
    revalidatePath("/", "layout");
    return { bilan };
  });
}

/** Reprend tous les badgeages non rattachés dont le numéro correspond désormais à une fiche. */
export async function retraiterBadges() {
  return actionAdmin(async (tx, u) => {
    const bilan = await retraiterNonRattaches(tx, u.organisationId);
    revalidatePath("/", "layout");
    return { bilan };
  });
}

/** Écarte les badgeages d'un numéro (badge de test, visiteur) : ils ne seront jamais comptés. */
export async function ecarterBadge(pin: string) {
  return actionAdmin(async (tx, u) => {
    await tx
      .update(badgeage)
      .set({ etat: "ECARTE", traiteLe: new Date() })
      .where(and(eq(badgeage.organisationId, u.organisationId), eq(badgeage.etat, "NON_RATTACHE"), eq(badgeage.pin, normaliserPin(pin))));
    revalidatePath("/admin/pointeuses");
  });
}
