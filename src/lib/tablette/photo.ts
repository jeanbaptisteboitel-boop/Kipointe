/**
 * TABLETTE — photo prise au pointage par code.
 *
 * Option de l'entreprise, fermée par défaut. La tablette photographie la personne qui valide un
 * code ; la photo sert à vérifier, en cas de doute, que le salarié a bien pointé lui-même.
 *
 * La CNIL juge excessive une photo systématique à chaque pointage : la collecte est donc bornée.
 *   - la photo va dans le bucket privé, jamais en base ;
 *   - seuls les administrateurs de l'entreprise la consultent, et chaque consultation est
 *     journalisée ;
 *   - elle est détruite au bout de `CONSERVATION_PHOTO_JOURS`, par la tâche quotidienne ;
 *   - la tablette affiche qu'une photo est prise.
 * Le pointage ne dépend pas de la photo : sans appareil photo, ou si le dépôt échoue, il est
 * enregistré quand même, sans photo.
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { pointageTablette } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import type { Stockage } from "@/lib/stockage";

export const CONSERVATION_PHOTO_JOURS = 30;
export const TAILLE_MAX_PHOTO = 400 * 1024;

/** Photo envoyée par la tablette (« data:image/jpeg;base64,… ») → octets JPEG, ou null si ce n'en est pas une. */
export function lirePhoto(brut: unknown): Uint8Array | null {
  if (typeof brut !== "string") return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(brut);
  if (!m || m[1]!.length > TAILLE_MAX_PHOTO * 1.4) return null;
  const octets = new Uint8Array(Buffer.from(m[1]!, "base64"));
  // Contrôle sur le contenu : un JPEG commence par FF D8 FF.
  if (octets.length < 1000 || octets.length > TAILLE_MAX_PHOTO || octets[0] !== 0xff || octets[1] !== 0xd8 || octets[2] !== 0xff) return null;
  return octets;
}

/** La clé ne dépend que d'identifiants tirés par le service. */
export function clePhoto(organisationId: string, pointageId: string): string {
  return `pointages/${organisationId}/${pointageId}.jpg`;
}

/** Dépose la photo d'un pointage et la rattache à sa ligne. Rend false si rien n'a été gardé. */
export async function enregistrerPhoto(db: Db, stockage: Stockage, p: { organisationId: string; pointageId: string; octets: Uint8Array }): Promise<boolean> {
  const cle = clePhoto(p.organisationId, p.pointageId);
  await stockage.ecrire(cle, p.octets, "image/jpeg");
  const maj = await withTenant(db, p.organisationId, (tx) => tx.update(pointageTablette).set({ photoCle: cle }).where(eq(pointageTablette.id, p.pointageId)).returning({ id: pointageTablette.id }));
  if (maj.length) return true;
  await stockage.supprimer([cle]);
  return false;
}

/** DANS une transaction de l'organisation : la photo d'un pointage, ou null. */
export async function trouverPhoto(tx: Tx, pointageId: string): Promise<{ cle: string; salarieId: string; jour: string; heure: string } | null> {
  const [p] = await tx
    .select({ cle: pointageTablette.photoCle, salarieId: pointageTablette.salarieId, jour: pointageTablette.jour, heure: pointageTablette.heure })
    .from(pointageTablette)
    .where(and(eq(pointageTablette.id, pointageId), isNotNull(pointageTablette.photoCle)));
  return p?.cle ? { ...p, cle: p.cle } : null;
}

/** Détache les photos arrivées en fin de conservation et rend leurs clés, à supprimer du bucket. */
export async function purgerPhotos(tx: Tx, maintenant: Date, organisationId?: string): Promise<string[]> {
  const limite = new Date(maintenant.getTime() - CONSERVATION_PHOTO_JOURS * 24 * 3600 * 1000);
  const filtre = and(isNotNull(pointageTablette.photoCle), lt(pointageTablette.instant, limite), organisationId ? eq(pointageTablette.organisationId, organisationId) : undefined);
  const lignes = await tx.select({ cle: pointageTablette.photoCle }).from(pointageTablette).where(filtre).for("update");
  if (!lignes.length) return [];
  await tx.update(pointageTablette).set({ photoCle: null }).where(filtre);
  return lignes.map((l) => l.cle!).filter(Boolean);
}
