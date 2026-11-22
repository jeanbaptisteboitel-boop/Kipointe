"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { rendezVous, salarie } from "@/db/schema";
import { ErreurMetier, actionAdmin } from "@/lib/actions";
import { normaliserHeure } from "@/lib/pointage/paires";
import { estJourValide } from "@/lib/temps/zone";

export async function ajouterRendezVous(p: { salarieId: string; intitule: string; jour: string; heure: string; precision: string }) {
  return actionAdmin(async (tx, u) => {
    const intitule = p.intitule.trim().slice(0, 80);
    if (!intitule) throw new ErreurMetier("Indiquez l'objet du rendez-vous.");
    if (!estJourValide(p.jour)) throw new ErreurMetier("Date invalide.");
    const heure = p.heure.trim() ? normaliserHeure(p.heure) : null;
    if (p.heure.trim() && !heure) throw new ErreurMetier("Heure invalide.");
    const [fiche] = await tx.select({ id: salarie.id }).from(salarie).where(eq(salarie.id, p.salarieId));
    if (!fiche) throw new ErreurMetier("Salarié introuvable.");
    await tx.insert(rendezVous).values({ organisationId: u.organisationId, salarieId: fiche.id, intitule, jour: p.jour, heure, precision: p.precision.trim().slice(0, 200) || null });
    revalidatePath("/", "layout");
  });
}

export async function supprimerRendezVous(id: string) {
  return actionAdmin(async (tx) => {
    await tx.delete(rendezVous).where(eq(rendezVous.id, id));
    revalidatePath("/", "layout");
  });
}
