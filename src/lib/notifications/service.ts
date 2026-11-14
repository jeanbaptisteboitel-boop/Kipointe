/**
 * NOTIFICATIONS — création dédoublonnée, lecture, marquage.
 *
 * Une notification s'adresse soit à un salarié (`destinataireSalarieId`), soit aux
 * administrateurs de l'organisation (destinataire null). Sa `cle` la rend idempotente : la tâche
 * quotidienne peut repasser, la même notification n'est pas créée deux fois.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { notification, type TypeNotification } from "@/db/schema";

export interface NouvelleNotification {
  organisationId: string;
  /** null = administrateurs. */
  destinataireSalarieId: string | null;
  salarieId?: string | null;
  type: TypeNotification;
  titre: string;
  message: string;
  lien?: string | null;
  cle: string;
}

/** Crée la notification si sa clé n'existe pas encore. Rend true si elle est nouvelle. */
export async function notifier(tx: Tx, n: NouvelleNotification): Promise<boolean> {
  const creees = await tx
    .insert(notification)
    .values({
      organisationId: n.organisationId,
      destinataireSalarieId: n.destinataireSalarieId,
      salarieId: n.salarieId ?? n.destinataireSalarieId,
      type: n.type,
      titre: n.titre,
      message: n.message,
      lien: n.lien ?? null,
      // Deux destinataires de la même information (le salarié, les administrateurs) : deux clés.
      cle: `${n.destinataireSalarieId ? "s" : "a"}:${n.cle}`,
    })
    .onConflictDoNothing()
    .returning({ id: notification.id });
  return creees.length > 0;
}

function filtreDestinataire(organisationId: string, salarieId: string | null) {
  return and(eq(notification.organisationId, organisationId), salarieId ? eq(notification.destinataireSalarieId, salarieId) : isNull(notification.destinataireSalarieId));
}

/** Notifications d'un salarié (ou des administrateurs si `salarieId` est null), les plus récentes d'abord. */
export function listerNotifications(tx: Tx, organisationId: string, salarieId: string | null, limite = 60) {
  return tx.select().from(notification).where(filtreDestinataire(organisationId, salarieId)).orderBy(desc(notification.createdAt)).limit(limite);
}

export async function compterNonLues(tx: Tx, organisationId: string, salarieId: string | null): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(filtreDestinataire(organisationId, salarieId), isNull(notification.luLe)));
  return r?.n ?? 0;
}

/** Marque lues toutes les notifications du destinataire, ou une seule. */
export async function marquerLues(tx: Tx, organisationId: string, salarieId: string | null, id?: string): Promise<void> {
  await tx
    .update(notification)
    .set({ luLe: new Date() })
    .where(and(filtreDestinataire(organisationId, salarieId), isNull(notification.luLe), id ? eq(notification.id, id) : undefined));
}
