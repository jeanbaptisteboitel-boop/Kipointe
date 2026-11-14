"use server";

import { revalidatePath } from "next/cache";
import { ErreurMetier, actionAdmin, actionConnecte } from "@/lib/actions";
import { ErreurRefus, clesDeLAbsence, confirmerDepot, preparerDepot, retirerJustificatif } from "@/lib/conges/justificatifs";
import { creerConge, deciderConge, supprimerConge, type SaisieConge } from "@/lib/conges/service";
import { journaliserAcces } from "@/lib/journal";
import { stockage } from "@/lib/stockage";

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
    const cles = /^[0-9a-f-]{36}$/i.test(id) ? await clesDeLAbsence(tx, id) : [];
    const c = await supprimerConge(tx, { id, parAdmin: u.role === "ADMIN", salarieId: u.salarieId });
    // Les fichiers de l'absence partent avec elle (les lignes, elles, suivent par cascade).
    if (cles.length) await stockage()?.supprimer(cles);
    if (u.role === "ADMIN") await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: c.salarieId, action: "ABSENCE_SUPPRIMEE", detail: { type: c.type, du: c.dateDebut, au: c.dateFin } });
    revalidatePath("/", "layout");
  });
}

function exigerStockage() {
  const s = stockage();
  if (!s) throw new ErreurMetier("Le dépôt de justificatifs n'est pas encore configuré sur ce service : remettez le document à votre employeur.");
  return s;
}

/** Temps 1 du dépôt : annonce le fichier, rend l'URL à laquelle le navigateur l'envoie directement. */
export async function preparerDepotJustificatif(p: { congeId: string; nom: string; taille: number; type: string }) {
  return actionConnecte(async (tx, u) => {
    const d = await preparerDepot(tx, exigerStockage(), { organisationId: u.organisationId, congeId: p.congeId, auteurId: u.id, parAdmin: u.role === "ADMIN", salarieId: u.salarieId, nom: String(p.nom ?? ""), taille: Number(p.taille), typeAnnonce: String(p.type ?? "") });
    return { id: d.id, url: d.url, type: d.typeMime };
  });
}

/** Temps 3 : le serveur vérifie le fichier déposé. `refus` : il a été écarté (format, taille, absent). */
export async function confirmerDepotJustificatif(id: string) {
  return actionConnecte(async (tx, u) => {
    try {
      await confirmerDepot(tx, exigerStockage(), { organisationId: u.organisationId, id, parAdmin: u.role === "ADMIN", salarieId: u.salarieId });
    } catch (e) {
      // Le fichier écarté est déjà supprimé : la transaction doit être validée, pas annulée.
      if (e instanceof ErreurRefus) return { refus: e.message };
      throw e;
    }
    revalidatePath("/", "layout");
    return { refus: null as string | null };
  });
}

export async function retirerUnJustificatif(id: string) {
  return actionConnecte(async (tx, u) => {
    const parAdmin = u.role === "ADMIN";
    const j = await retirerJustificatif(tx, exigerStockage(), id, { parAdmin, salarieId: u.salarieId });
    if (parAdmin) await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: j.salarieId, action: "JUSTIFICATIF_RETIRE", detail: { nom: j.nom } });
    revalidatePath("/", "layout");
  });
}
