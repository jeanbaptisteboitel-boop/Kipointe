"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { salarie } from "@/db/schema";
import { ErreurMetier, actionAdmin, actionConnecte } from "@/lib/actions";
import { chargerOrganisation, aujourdhuiDe, nomComplet } from "@/lib/donnees";
import { journaliserAcces } from "@/lib/journal";
import { notifier } from "@/lib/notifications/service";
import { SOURCE_SAISIE, normaliserPointagesSaisis, type Pointage } from "@/lib/pointage/paires";
import { deciderSemaine, enregistrerJour, importerCsv } from "@/lib/pointage/semaine";
import { estJourValide, frDate, frJourLong } from "@/lib/temps/zone";

/** Administrateur : corrige (ou ajoute) une journée. Les paires saisies remplacent celles du jour. */
export async function corrigerJour(p: { salarieId: string; date: string; pointages: Pointage[]; ajout?: boolean }) {
  return actionAdmin(async (tx, u) => {
    const org = await chargerOrganisation(tx, u.organisationId);
    if (!estJourValide(p.date)) throw new ErreurMetier("Date invalide.");
    if (p.date > aujourdhuiDe(org)) throw new ErreurMetier("Cette journée n'est pas encore passée.");
    const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, p.salarieId));
    if (!fiche) throw new ErreurMetier("Salarié introuvable.");
    const brut = Array.isArray(p.pointages) ? p.pointages : [];
    if (brut.some((x) => (x?.entree && !/^\d{1,2}:\d{2}$/.test(x.entree.trim())) || (x?.sortie && !/^\d{1,2}:\d{2}$/.test(x.sortie.trim())))) {
      throw new ErreurMetier("Heures au format HH:MM (08:30).");
    }
    const pointages = normaliserPointagesSaisis(brut, p.ajout ? SOURCE_SAISIE : undefined);
    if (pointages.some((x) => x.entree && x.sortie && x.sortie <= x.entree)) throw new ErreurMetier("Une sortie précède son entrée.");
    const r = await enregistrerJour(tx, { organisationId: u.organisationId, salarieId: fiche.id, date: p.date, pointages });
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: fiche.id, action: "POINTAGE_CORRIGE", detail: { date: p.date, pointages } });
    await notifier(tx, {
      organisationId: u.organisationId,
      destinataireSalarieId: fiche.id,
      type: "SEMAINE_A_VALIDER",
      titre: "Pointage corrigé",
      message: `Votre employeur a corrigé vos heures du ${frJourLong(p.date)}. Vérifiez la semaine, puis validez-la.`,
      lien: "/salarie/heures",
      cle: `correction:${fiche.id}:${p.date}:${Date.now()}`,
    });
    revalidatePath("/", "layout");
    return { minutes: r.minutes };
  });
}

/** Salarié : valide sa semaine, ou demande une modification. */
export async function deciderMaSemaine(p: { semaineId: string; action: "valider" | "demander_modif"; commentaire?: string }) {
  return actionConnecte(async (tx, u) => {
    if (!u.salarieId) throw new ErreurMetier("Ce compte n'est rattaché à aucune fiche salarié.");
    const r = await deciderSemaine(tx, { semaineId: p.semaineId, salarieId: u.salarieId, action: p.action, commentaire: p.commentaire });
    if (p.action === "demander_modif") {
      const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, u.salarieId));
      await notifier(tx, {
        organisationId: u.organisationId,
        destinataireSalarieId: null,
        salarieId: u.salarieId,
        type: "MODIF_DEMANDEE",
        titre: "Modification de pointage demandée",
        message: `${fiche ? nomComplet(fiche) : "Un salarié"}, semaine du ${frDate(r.semaineDebut)} : « ${(p.commentaire ?? "").trim().slice(0, 300)} »`,
        lien: `/admin/salaries/${u.salarieId}`,
        cle: `modif:${p.semaineId}:${Date.now()}`,
      });
    }
    revalidatePath("/", "layout");
  });
}

/** Administrateur : importe le fichier CSV exporté par la pointeuse. */
export async function importerFichierPointeuse(csv: string) {
  return actionAdmin(async (tx, u) => {
    if (typeof csv !== "string" || !csv.trim()) throw new ErreurMetier("Fichier vide.");
    if (csv.length > 4_000_000) throw new ErreurMetier("Fichier trop volumineux (4 Mo au plus).");
    const bilan = await importerCsv(tx, u.organisationId, csv);
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, action: "IMPORT_CSV", detail: { semaines: bilan.semaines, salaries: bilan.salaries } });
    revalidatePath("/", "layout");
    return { bilan };
  });
}
