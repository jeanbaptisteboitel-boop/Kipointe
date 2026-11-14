"use server";

import { revalidatePath } from "next/cache";
import { ErreurMetier, actionAdmin, actionConnecte } from "@/lib/actions";
import { deposerJustificatif, retirerJustificatif } from "@/lib/conges/justificatifs";
import { creerConge, deciderConge, supprimerConge, type SaisieConge } from "@/lib/conges/service";
import { journaliserAcces } from "@/lib/journal";

/** Demande ou déclaration d'absence. Un salarié ne saisit que pour lui-même ; l'administrateur pour tous. */
export async function enregistrerConge(saisie: SaisieConge) {
  return actionConnecte(async (tx, u) => {
    const parAdmin = u.role === "ADMIN" && saisie.salarieId !== u.salarieId;
    if (u.role !== "ADMIN" && saisie.salarieId !== u.salarieId) throw new ErreurMetier("Vous ne pouvez saisir une absence que pour vous-même.");
    const c = await creerConge(tx, { organisationId: u.organisationId, auteurId: u.id, parAdmin, saisie });
    if (parAdmin) await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: saisie.salarieId, action: "ABSENCE_SAISIE", detail: { type: c.type, du: c.dateDebut, au: c.dateFin } });
    revalidatePath("/", "layout");
    return { id: c.id, statut: c.statut, nbJours: c.nbJours };
  });
}

export async function deciderDemande(p: { id: string; statut: "ACCEPTEE" | "REFUSEE"; commentaire?: string }) {
  return actionAdmin(async (tx, u) => {
    if (p.statut !== "ACCEPTEE" && p.statut !== "REFUSEE") throw new ErreurMetier("Décision invalide.");
    const c = await deciderConge(tx, { id: p.id, decideurId: u.id, statut: p.statut, commentaire: p.commentaire });
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: c.salarieId, action: "CONGE_DECISION", detail: { id: c.id, statut: p.statut } });
    revalidatePath("/", "layout");
  });
}

/** Annulation d'une demande en attente par son auteur, ou suppression par l'administrateur. */
export async function supprimerDemande(id: string) {
  return actionConnecte(async (tx, u) => {
    const c = await supprimerConge(tx, { id, parAdmin: u.role === "ADMIN", salarieId: u.salarieId });
    if (u.role === "ADMIN") await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: c.salarieId, action: "ABSENCE_SUPPRIMEE", detail: { type: c.type, du: c.dateDebut, au: c.dateFin } });
    revalidatePath("/", "layout");
  });
}

/** Dépôt d'un justificatif sur une absence : `FormData` avec `congeId` et `fichier`. */
export async function deposerUnJustificatif(donnees: FormData) {
  return actionConnecte(async (tx, u) => {
    const fichier = donnees.get("fichier");
    const congeId = String(donnees.get("congeId") ?? "");
    if (!(fichier instanceof File)) throw new ErreurMetier("Choisissez un fichier.");
    const parAdmin = u.role === "ADMIN";
    const j = await deposerJustificatif(tx, { organisationId: u.organisationId, congeId, auteurId: u.id, parAdmin, salarieId: u.salarieId, nom: fichier.name, octets: new Uint8Array(await fichier.arrayBuffer()) });
    revalidatePath("/", "layout");
    return { nom: j.nom };
  });
}

export async function retirerUnJustificatif(id: string) {
  return actionConnecte(async (tx, u) => {
    const parAdmin = u.role === "ADMIN";
    const j = await retirerJustificatif(tx, id, { parAdmin, salarieId: u.salarieId });
    if (parAdmin) await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: j.salarieId, action: "JUSTIFICATIF_RETIRE", detail: { nom: j.nom } });
    revalidatePath("/", "layout");
  });
}
