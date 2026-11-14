/**
 * JUSTIFICATIFS D'ABSENCE (arrêt de travail, acte de naissance ou de mariage, convocation…).
 *
 * Le salarié dépose le document sur l'absence concernée ; l'administrateur peut aussi le faire
 * pour lui. Le fichier est conservé en base, dans l'organisation : seuls le salarié concerné et
 * les administrateurs de son entreprise peuvent le lire, et il est supprimé avec l'absence.
 * Formats : PDF, JPEG, PNG — vérifiés sur le contenu, pas sur le nom du fichier.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { congeAbsence, justificatif, salarie, type CongeAbsence } from "@/db/schema";
import { ErreurMetier } from "@/lib/actions";
import { LIBELLES_CONGE } from "@/lib/conges/types";
import { notifier } from "@/lib/notifications/service";
import { frDate } from "@/lib/temps/zone";

/** Taille maximale d'un fichier (la plateforme d'hébergement plafonne une requête à 4,5 Mo). */
export const TAILLE_MAX_JUSTIFICATIF = 4 * 1024 * 1024;
export const MAX_JUSTIFICATIFS_PAR_ABSENCE = 5;

export type JustificatifResume = { id: string; nom: string; taille: number };
export type CongeAvecJustificatifs = CongeAbsence & { justificatifs: JustificatifResume[] };

/** Type du fichier d'après ses premiers octets ; null s'il n'est pas accepté. */
export function typeDuFichier(octets: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  const debut = (...v: number[]) => v.every((x, i) => octets[i] === x);
  if (debut(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (debut(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  return null;
}

/** Nom de fichier présentable : sans chemin ni caractère de contrôle, 120 caractères au plus. */
export function nettoyerNom(nom: string): string {
  const propre = nom
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .trim()
    .slice(0, 120);
  return propre || "justificatif";
}

/** Complète des absences avec la liste de leurs justificatifs (sans le contenu). */
export async function avecJustificatifs<T extends CongeAbsence>(tx: Tx, conges: T[]): Promise<(T & { justificatifs: JustificatifResume[] })[]> {
  const ids = conges.map((c) => c.id);
  const lignes = ids.length
    ? await tx.select({ id: justificatif.id, congeId: justificatif.congeId, nom: justificatif.nom, taille: justificatif.taille }).from(justificatif).where(inArray(justificatif.congeId, ids)).orderBy(justificatif.createdAt)
    : [];
  return conges.map((c) => ({ ...c, justificatifs: lignes.filter((l) => l.congeId === c.id).map(({ id, nom, taille }) => ({ id, nom, taille })) }));
}

/** L'absence visée, si l'utilisateur y a accès : la sienne pour un salarié, toutes pour l'administrateur. */
async function absenceAccessible(tx: Tx, congeId: string, acteur: { parAdmin: boolean; salarieId: string | null }): Promise<CongeAbsence> {
  const [c] = await tx.select().from(congeAbsence).where(eq(congeAbsence.id, congeId));
  if (!c || (!acteur.parAdmin && c.salarieId !== acteur.salarieId)) throw new ErreurMetier("Absence introuvable.");
  return c;
}

export async function deposerJustificatif(
  tx: Tx,
  p: { organisationId: string; congeId: string; auteurId: string; parAdmin: boolean; salarieId: string | null; nom: string; octets: Uint8Array },
): Promise<JustificatifResume> {
  const c = await absenceAccessible(tx, p.congeId, p);
  if (p.octets.length === 0) throw new ErreurMetier("Fichier vide.");
  if (p.octets.length > TAILLE_MAX_JUSTIFICATIF) throw new ErreurMetier("Fichier trop volumineux : 4 Mo au plus. Une photo prise en qualité normale suffit.");
  const typeMime = typeDuFichier(p.octets);
  if (!typeMime) throw new ErreurMetier("Format non accepté : déposez un PDF, une photo JPEG ou une image PNG.");
  const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(justificatif).where(eq(justificatif.congeId, c.id));
  if ((n?.n ?? 0) >= MAX_JUSTIFICATIFS_PAR_ABSENCE) throw new ErreurMetier(`${MAX_JUSTIFICATIFS_PAR_ABSENCE} justificatifs au plus par absence : retirez-en un d'abord.`);

  const nom = nettoyerNom(p.nom);
  const [cree] = await tx
    .insert(justificatif)
    .values({ organisationId: p.organisationId, congeId: c.id, nom, typeMime, taille: p.octets.length, contenu: Buffer.from(p.octets), deposePar: p.auteurId })
    .returning({ id: justificatif.id });

  if (!p.parAdmin) {
    const [fiche] = await tx.select({ prenom: salarie.prenom, nom: salarie.nom }).from(salarie).where(eq(salarie.id, c.salarieId));
    await notifier(tx, {
      organisationId: p.organisationId,
      destinataireSalarieId: null,
      salarieId: c.salarieId,
      type: "JUSTIFICATIF_DEPOSE",
      titre: "Justificatif déposé",
      message: `${fiche ? `${fiche.prenom} ${fiche.nom}` : "Un salarié"} a déposé un justificatif pour : ${LIBELLES_CONGE[c.type].toLowerCase()} du ${frDate(c.dateDebut)} au ${frDate(c.dateFin)}.`,
      lien: `/admin/salaries/${c.salarieId}`,
      cle: `justificatif:${cree!.id}`,
    });
  }
  return { id: cree!.id, nom, taille: p.octets.length };
}

/** Lecture d'un justificatif, contenu compris, après contrôle d'accès. */
export async function lireJustificatif(tx: Tx, id: string, acteur: { parAdmin: boolean; salarieId: string | null }) {
  const [j] = await tx.select().from(justificatif).where(eq(justificatif.id, id));
  if (!j) return null;
  const [c] = await tx.select({ salarieId: congeAbsence.salarieId }).from(congeAbsence).where(eq(congeAbsence.id, j.congeId));
  if (!c || (!acteur.parAdmin && c.salarieId !== acteur.salarieId)) return null;
  return { ...j, salarieId: c.salarieId };
}

/** Retrait : par l'administrateur, ou par le salarié sur sa propre absence. */
export async function retirerJustificatif(tx: Tx, id: string, acteur: { parAdmin: boolean; salarieId: string | null }): Promise<{ salarieId: string; nom: string }> {
  const j = await lireJustificatif(tx, id, acteur);
  if (!j) throw new ErreurMetier("Justificatif introuvable.");
  await tx.delete(justificatif).where(and(eq(justificatif.id, id)));
  return { salarieId: j.salarieId, nom: j.nom };
}
