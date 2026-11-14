import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organisation } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { purgerDepotsAbandonnes } from "@/lib/conges/justificatifs";
import { egalConstant } from "@/lib/crypto";
import { HttpError, extraireBearer, json, route } from "@/lib/http";
import { envoyerEmailsEnAttente } from "@/lib/notifications/email";
import { executerQuotidien } from "@/lib/notifications/quotidien";
import { stockage } from "@/lib/stockage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/quotidien — tâche quotidienne (cron Vercel, `Authorization: Bearer CRON_SECRET`) :
 * point de la veille et de la semaine écoulée pour chaque client, notifications, e-mails.
 */
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  const fourni = extraireBearer(req);
  if (!secret || !fourni || !egalConstant(secret, fourni)) throw new HttpError(401, "CRON_NON_AUTORISE");

  const db = getDb();
  const bilan = await executerQuotidien(db);
  const organisations = await withBypass(db, (tx) => tx.select({ id: organisation.id }).from(organisation).where(eq(organisation.actif, true)));
  let emails = 0;
  for (const o of organisations) emails += await envoyerEmailsEnAttente(db, o.id);
  // Envois de justificatifs annoncés mais jamais confirmés : lignes et fichiers supprimés.
  const abandonnes = await withBypass(db, (tx) => purgerDepotsAbandonnes(tx, new Date()));
  if (abandonnes.length) await stockage()?.supprimer(abandonnes);
  return json({ ...bilan, emails, depotsAbandonnes: abandonnes.length });
});
