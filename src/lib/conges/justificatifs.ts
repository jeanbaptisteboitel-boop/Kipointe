/**
 * JUSTIFICATIFS D'ABSENCE (arrêt de travail, acte de naissance, de mariage ou de décès, convocation…).
 *
 * Le salarié dépose le document sur l'absence concernée ; l'administrateur peut le faire pour lui.
 * Le fichier va dans le bucket Scaleway (src/lib/stockage.ts), en trois temps :
 *   1. `preparerDepot` : contrôle d'accès et de taille, ligne créée « non confirmée », URL d'envoi ;
 *   2. le navigateur envoie le fichier directement au bucket ;
 *   3. `confirmerDepot` : le serveur relit ce qui a réellement été déposé — taille et premiers
 *      octets (PDF, JPEG, PNG, HEIC, jamais le nom ni le type annoncé) — puis le rend consultable, ou
 *      le supprime.
 * Seuls le salarié concerné et les administrateurs de son entreprise peuvent le lire. Il est
 * supprimé avec l'absence ; un envoi jamais confirmé est purgé par la tâche quotidienne.
 */
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Tx } from "@/db";
import { congeAbsence, justificatif, salarie, type CongeAbsence } from "@/db/schema";
import { ErreurMetier } from "@/lib/actions";
import { LIBELLES_CONGE } from "@/lib/conges/types";
import { notifier } from "@/lib/notifications/service";
import type { Stockage } from "@/lib/stockage";
import { frDate } from "@/lib/temps/zone";

export const TAILLE_MAX_JUSTIFICATIF = 25 * 1024 * 1024;
export const MAX_JUSTIFICATIFS_PAR_ABSENCE = 5;
/** Un envoi annoncé mais jamais confirmé est abandonné au bout de ce délai. */
export const DELAI_ABANDON_MS = 60 * 60 * 1000;

export const TYPES_JUSTIFICATIF = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"] as const;
export type TypeJustificatif = (typeof TYPES_JUSTIFICATIF)[number];

/** Marques HEIF (octets 8 à 11 d'un conteneur ISO « ftyp ») : photos HEIC des iPhone, et HEIF générique. */
const MARQUES_HEIC = ["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"];
const MARQUES_HEIF = ["mif1", "msf1"];
export type JustificatifResume = { id: string; nom: string; taille: number };
export type CongeAvecJustificatifs = CongeAbsence & { justificatifs: JustificatifResume[] };
type Acteur = { parAdmin: boolean; salarieId: string | null };

/** Type du fichier d'après ses premiers octets ; null s'il n'est pas accepté. */
export function typeDuFichier(octets: Uint8Array): TypeJustificatif | null {
  const debut = (...v: number[]) => v.every((x, i) => octets[i] === x);
  if (debut(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (debut(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // HEIC / HEIF : « ftyp » aux octets 4 à 7, puis la marque. Une vidéo MP4 ou une image AVIF ont
  // le même en-tête « ftyp » mais une autre marque : elles ne passent pas.
  if (octets.length >= 12 && String.fromCharCode(...octets.slice(4, 8)) === "ftyp") {
    const marque = String.fromCharCode(...octets.slice(8, 12));
    if (MARQUES_HEIC.includes(marque)) return "image/heic";
    if (MARQUES_HEIF.includes(marque)) return "image/heif";
  }
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

/** Complète des absences avec la liste de leurs justificatifs confirmés. */
export async function avecJustificatifs<T extends CongeAbsence>(tx: Tx, conges: T[]): Promise<(T & { justificatifs: JustificatifResume[] })[]> {
  const ids = conges.map((c) => c.id);
  const lignes = ids.length
    ? await tx
        .select({ id: justificatif.id, congeId: justificatif.congeId, nom: justificatif.nom, taille: justificatif.taille })
        .from(justificatif)
        .where(and(inArray(justificatif.congeId, ids), isNotNull(justificatif.confirmeLe)))
        .orderBy(justificatif.createdAt)
    : [];
  return conges.map((c) => ({ ...c, justificatifs: lignes.filter((l) => l.congeId === c.id).map(({ id, nom, taille }) => ({ id, nom, taille })) }));
}

/** L'absence visée, si l'utilisateur y a accès : la sienne pour un salarié, toutes pour l'administrateur. */
async function absenceAccessible(tx: Tx, congeId: string, acteur: Acteur): Promise<CongeAbsence> {
  const [c] = /^[0-9a-f-]{36}$/i.test(congeId) ? await tx.select().from(congeAbsence).where(eq(congeAbsence.id, congeId)) : [];
  if (!c || (!acteur.parAdmin && c.salarieId !== acteur.salarieId)) throw new ErreurMetier("Absence introuvable.");
  return c;
}

/** Temps 1 : annonce d'un envoi. Rend l'URL à laquelle le navigateur dépose le fichier. */
export async function preparerDepot(
  tx: Tx,
  stockage: Stockage,
  p: Acteur & { organisationId: string; congeId: string; auteurId: string; nom: string; taille: number; typeAnnonce: string },
): Promise<{ id: string; url: string; typeMime: TypeJustificatif }> {
  const c = await absenceAccessible(tx, p.congeId, p);
  if (!Number.isInteger(p.taille) || p.taille <= 0) throw new ErreurMetier("Fichier vide.");
  if (p.taille > TAILLE_MAX_JUSTIFICATIF) throw new ErreurMetier("Fichier trop volumineux : 25 Mo au plus.");
  const typeMime = TYPES_JUSTIFICATIF.find((t) => t === p.typeAnnonce);
  if (!typeMime) throw new ErreurMetier("Format non accepté : déposez un PDF ou une photo (JPEG, PNG, HEIC).");
  // Les envois en cours comptent : cinq onglets ne déposent pas vingt-cinq fichiers.
  const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(justificatif).where(eq(justificatif.congeId, c.id));
  if ((n?.n ?? 0) >= MAX_JUSTIFICATIFS_PAR_ABSENCE) throw new ErreurMetier(`${MAX_JUSTIFICATIFS_PAR_ABSENCE} justificatifs au plus par absence : retirez-en un d'abord.`);

  // La clé ne reprend jamais le nom fourni : rien de ce que saisit l'utilisateur n'entre dans un chemin.
  const cle = `justificatifs/${p.organisationId}/${c.id}/${randomUUID()}`;
  const [cree] = await tx
    .insert(justificatif)
    .values({ organisationId: p.organisationId, congeId: c.id, nom: nettoyerNom(p.nom), typeMime, taille: p.taille, cle, deposePar: p.auteurId })
    .returning({ id: justificatif.id });
  return { id: cree!.id, url: await stockage.urlDepot(cle, typeMime, p.taille), typeMime };
}

/** Temps 3 : vérifie ce qui a été déposé. Fichier absent, trop gros ou d'un autre format : supprimé et refusé. */
export async function confirmerDepot(tx: Tx, stockage: Stockage, p: Acteur & { organisationId: string; id: string; maintenant?: Date }): Promise<JustificatifResume> {
  const [j] = /^[0-9a-f-]{36}$/i.test(p.id) ? await tx.select().from(justificatif).where(eq(justificatif.id, p.id)).for("update") : [];
  if (!j) throw new ErreurMetier("Envoi introuvable.");
  const c = await absenceAccessible(tx, j.congeId, p);
  if (j.confirmeLe) return { id: j.id, nom: j.nom, taille: j.taille };

  const refuser = async (message: string): Promise<never> => {
    await stockage.supprimer([j.cle]);
    await tx.delete(justificatif).where(eq(justificatif.id, j.id));
    throw new ErreurRefus(message);
  };
  const depose = await stockage.lireDebut(j.cle, 16);
  if (!depose) return refuser("Le fichier n'est pas arrivé : réessayez.");
  if (depose.taille > TAILLE_MAX_JUSTIFICATIF) return refuser("Fichier trop volumineux : 25 Mo au plus.");
  const typeMime = typeDuFichier(depose.debut);
  if (!typeMime) return refuser("Format non accepté : déposez un PDF ou une photo (JPEG, PNG, HEIC).");

  await tx.update(justificatif).set({ typeMime, taille: depose.taille, confirmeLe: p.maintenant ?? new Date() }).where(eq(justificatif.id, j.id));
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
      cle: `justificatif:${j.id}`,
    });
  }
  return { id: j.id, nom: j.nom, taille: depose.taille };
}

/**
 * Refus d'un fichier déposé : la ligne a été supprimée DANS la transaction, qui doit donc être
 * validée — l'appelant rend le message sans annuler (une ErreurMetier, elle, annule).
 */
export class ErreurRefus extends Error {}

/** Un justificatif confirmé, après contrôle d'accès ; null s'il n'existe pas ou n'est pas accessible. */
export async function trouverJustificatif(tx: Tx, id: string, acteur: Acteur) {
  const [j] = /^[0-9a-f-]{36}$/i.test(id) ? await tx.select().from(justificatif).where(and(eq(justificatif.id, id), isNotNull(justificatif.confirmeLe))) : [];
  if (!j) return null;
  const [c] = await tx.select({ salarieId: congeAbsence.salarieId }).from(congeAbsence).where(eq(congeAbsence.id, j.congeId));
  if (!c || (!acteur.parAdmin && c.salarieId !== acteur.salarieId)) return null;
  return { ...j, salarieId: c.salarieId };
}

/** Retrait : par l'administrateur, ou par le salarié sur sa propre absence. */
export async function retirerJustificatif(tx: Tx, stockage: Stockage, id: string, acteur: Acteur): Promise<{ salarieId: string; nom: string }> {
  const j = await trouverJustificatif(tx, id, acteur);
  if (!j) throw new ErreurMetier("Justificatif introuvable.");
  await tx.delete(justificatif).where(eq(justificatif.id, id));
  await stockage.supprimer([j.cle]);
  return { salarieId: j.salarieId, nom: j.nom };
}

/** Clés des fichiers d'une absence, à supprimer du bucket avec elle. */
export async function clesDeLAbsence(tx: Tx, congeId: string): Promise<string[]> {
  return (await tx.select({ cle: justificatif.cle }).from(justificatif).where(eq(justificatif.congeId, congeId))).map((l) => l.cle);
}

/** Purge des envois annoncés mais jamais confirmés (onglet fermé, envoi interrompu). Rend leurs clés. */
export async function purgerDepotsAbandonnes(tx: Tx, maintenant: Date): Promise<string[]> {
  const abandonnes = await tx
    .delete(justificatif)
    .where(and(isNull(justificatif.confirmeLe), lt(justificatif.createdAt, new Date(maintenant.getTime() - DELAI_ABANDON_MS))))
    .returning({ cle: justificatif.cle });
  return abandonnes.map((a) => a.cle);
}
