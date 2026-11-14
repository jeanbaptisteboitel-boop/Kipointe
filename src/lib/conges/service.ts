/**
 * CONGÉS ET ABSENCES — demandes, décisions, annulations.
 *
 *   - le salarié DEMANDE un congé payé, une absence autorisée ou une formation : la demande est
 *     « en attente » jusqu'à la décision d'un administrateur ;
 *   - il DÉCLARE une maladie ou un événement familial : enregistré tel quel (acceptée) ;
 *   - l'administrateur saisit tout type, accepté d'emblée, y compris l'absence non autorisée ;
 *   - une demande en attente peut être annulée par son auteur ; l'administrateur peut supprimer
 *     toute absence.
 */
import { and, eq, gte, lte, ne } from "drizzle-orm";
import type { Tx } from "@/db";
import { congeAbsence, organisation, salarie, type TypeConge } from "@/db/schema";
import { ErreurMetier } from "@/lib/actions";
import { compterJours, DUREE_MAX_JOURS, LIBELLES_CONGE, TYPES_CONGE, TYPES_CONGE_ADMIN, TYPES_CONGE_VALIDABLES } from "@/lib/conges/types";
import { notifier } from "@/lib/notifications/service";
import { planningEffectif } from "@/lib/planning";
import { ecartJours, estJourValide, frDate } from "@/lib/temps/zone";

export interface SaisieConge {
  salarieId: string;
  type: string;
  dateDebut: string;
  dateFin: string;
  demiJourDebut?: string | null;
  demiJourFin?: string | null;
  motif?: string | null;
}

function periode(c: { dateDebut: string; dateFin: string }): string {
  return c.dateDebut === c.dateFin ? `le ${frDate(c.dateDebut)}` : `du ${frDate(c.dateDebut)} au ${frDate(c.dateFin)}`;
}

export async function creerConge(tx: Tx, p: { organisationId: string; auteurId: string; parAdmin: boolean; saisie: SaisieConge }) {
  const s = p.saisie;
  if (!(TYPES_CONGE as readonly string[]).includes(s.type)) throw new ErreurMetier("Type d'absence inconnu.");
  const type = s.type as TypeConge;
  if (!p.parAdmin && TYPES_CONGE_ADMIN.includes(type)) throw new ErreurMetier("Ce type d'absence est réservé à l'administrateur.");
  if (!estJourValide(s.dateDebut) || !estJourValide(s.dateFin)) throw new ErreurMetier("Dates invalides.");
  if (s.dateFin < s.dateDebut) throw new ErreurMetier("La date de fin précède la date de début.");
  if (ecartJours(s.dateDebut, s.dateFin) > DUREE_MAX_JOURS) throw new ErreurMetier("Période trop longue : un an au plus.");
  const demiJourDebut = s.demiJourDebut === "APREM" ? "APREM" : null;
  const demiJourFin = s.demiJourFin === "MATIN" ? "MATIN" : null;

  const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, s.salarieId));
  if (!fiche) throw new ErreurMetier("Salarié introuvable.");
  const [org] = await tx.select().from(organisation).where(eq(organisation.id, p.organisationId));
  const { planning } = planningEffectif(fiche, org);
  const nbJours = compterJours({ dateDebut: s.dateDebut, dateFin: s.dateFin, demiJourDebut, demiJourFin }, planning);
  if (nbJours <= 0) throw new ErreurMetier("Cette période ne couvre aucun jour travaillé du planning (ou seulement des jours fériés).");

  // Une période déjà couverte par une demande acceptée ou en attente n'est pas redemandée.
  const existantes = await tx
    .select({ id: congeAbsence.id, type: congeAbsence.type, dateDebut: congeAbsence.dateDebut, dateFin: congeAbsence.dateFin })
    .from(congeAbsence)
    .where(and(eq(congeAbsence.salarieId, s.salarieId), ne(congeAbsence.statut, "REFUSEE"), lte(congeAbsence.dateDebut, s.dateFin), gte(congeAbsence.dateFin, s.dateDebut)));
  if (existantes.length && !p.parAdmin) {
    const e = existantes[0]!;
    throw new ErreurMetier(`Une absence couvre déjà cette période : ${LIBELLES_CONGE[e.type].toLowerCase()} ${periode(e)}.`);
  }

  const enAttente = !p.parAdmin && TYPES_CONGE_VALIDABLES.includes(type);
  const [cree] = await tx
    .insert(congeAbsence)
    .values({
      organisationId: p.organisationId,
      salarieId: s.salarieId,
      type,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      nbJours,
      demiJourDebut,
      demiJourFin,
      motif: (s.motif ?? "").trim().slice(0, 500) || null,
      statut: enAttente ? "EN_ATTENTE" : "ACCEPTEE",
      creePar: p.auteurId,
      decidePar: enAttente ? null : p.auteurId,
      decideLe: enAttente ? null : new Date(),
    })
    .returning();

  const nom = `${fiche.prenom} ${fiche.nom}`;
  if (!p.parAdmin) {
    await notifier(tx, {
      organisationId: p.organisationId,
      destinataireSalarieId: null,
      salarieId: fiche.id,
      type: "CONGE_DEMANDE",
      titre: enAttente ? `Demande de ${LIBELLES_CONGE[type].toLowerCase()}` : `${LIBELLES_CONGE[type]} déclaré${type === "MALADIE" ? "e" : ""}`,
      message: `${nom} : ${LIBELLES_CONGE[type].toLowerCase()} ${periode(s)}${enAttente ? " — à valider." : "."}`,
      lien: "/admin/conges",
      cle: `conge:${cree!.id}:demande`,
    });
  } else {
    await notifier(tx, {
      organisationId: p.organisationId,
      destinataireSalarieId: fiche.id,
      type: "CONGE_DECISION",
      titre: `${LIBELLES_CONGE[type]} enregistré${type === "MALADIE" || type === "FORMATION" || type.startsWith("ABSENCE") ? "e" : ""}`,
      message: `Votre employeur a enregistré : ${LIBELLES_CONGE[type].toLowerCase()} ${periode(s)}.`,
      lien: "/salarie/conges",
      cle: `conge:${cree!.id}:saisie`,
    });
  }
  return cree!;
}

export async function deciderConge(tx: Tx, p: { id: string; decideurId: string; statut: "ACCEPTEE" | "REFUSEE"; commentaire?: string | null }) {
  const [c] = await tx.select().from(congeAbsence).where(eq(congeAbsence.id, p.id)).for("update");
  if (!c) throw new ErreurMetier("Demande introuvable.");
  if (c.statut !== "EN_ATTENTE") throw new ErreurMetier("Cette demande a déjà été traitée.");
  const commentaire = (p.commentaire ?? "").trim().slice(0, 500) || null;
  await tx
    .update(congeAbsence)
    .set({ statut: p.statut, decidePar: p.decideurId, decideLe: new Date(), commentaireDecision: commentaire, updatedAt: new Date() })
    .where(eq(congeAbsence.id, c.id));
  await notifier(tx, {
    organisationId: c.organisationId,
    destinataireSalarieId: c.salarieId,
    type: "CONGE_DECISION",
    titre: p.statut === "ACCEPTEE" ? "Demande acceptée" : "Demande refusée",
    message: `${LIBELLES_CONGE[c.type]} ${periode(c)} : ${p.statut === "ACCEPTEE" ? "acceptée" : "refusée"}${commentaire ? ` — « ${commentaire} »` : ""}.`,
    lien: "/salarie/conges",
    cle: `conge:${c.id}:decision`,
  });
  return c;
}

/** Annulation par le salarié (demande en attente seulement) ou suppression par l'administrateur. */
export async function supprimerConge(tx: Tx, p: { id: string; parAdmin: boolean; salarieId?: string | null }) {
  const [c] = await tx.select().from(congeAbsence).where(eq(congeAbsence.id, p.id)).for("update");
  if (!c || (!p.parAdmin && c.salarieId !== p.salarieId)) throw new ErreurMetier("Demande introuvable.");
  if (!p.parAdmin && c.statut !== "EN_ATTENTE") throw new ErreurMetier("Seule une demande en attente peut être annulée : adressez-vous à votre employeur.");
  await tx.delete(congeAbsence).where(eq(congeAbsence.id, c.id));
  return c;
}
