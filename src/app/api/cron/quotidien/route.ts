/**
 * Tâche quotidienne (Vercel Cron, 03:00 UTC) :
 *  1. purge des pointages au-delà de la durée de conservation (5 ans par défaut) ;
 *  2. purge des journaux techniques (tentatives > 1 an, sessions expirées) ;
 *  3. recalcul des anomalies de la semaine en cours pour tous les salariés actifs.
 */
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalie, organisation, pointage, recapHebdo, salarie, session, tentativePointage } from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { calculerSemaineOrganisation } from "@/lib/calcul/recap";
import { egalConstant } from "@/lib/crypto";
import { extraireBearer, HttpError, json, route } from "@/lib/http";
import { semaineCourante } from "@/lib/temps/journee";

export const runtime = "nodejs";
export const maxDuration = 60;

const JOUR_MS = 24 * 3600 * 1000;

export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  const fourni = extraireBearer(req);
  if (!secret || !fourni || !egalConstant(secret, fourni)) throw new HttpError(401, "CRON_NON_AUTORISE");

  const maintenant = new Date();
  const retentionJours = Number(process.env.RETENTION_POINTAGES_JOURS ?? "1826") || 1826;
  const limitePointages = new Date(maintenant.getTime() - retentionJours * JOUR_MS);
  const limiteTentatives = new Date(maintenant.getTime() - 365 * JOUR_MS);
  const db = getDb();

  const purge = await withBypass(db, async (tx) => {
    const pointagesSupprimes = await tx.delete(pointage).where(lt(pointage.horodatageEffectif, limitePointages)).returning({ id: pointage.id });
    const anomaliesSupprimees = await tx.delete(anomalie).where(lt(anomalie.dateJour, limitePointages.toISOString().slice(0, 10))).returning({ id: anomalie.id });
    const recapsSupprimes = await tx.delete(recapHebdo).where(lt(recapHebdo.createdAt, limitePointages)).returning({ id: recapHebdo.id });
    const tentativesSupprimees = await tx.delete(tentativePointage).where(lt(tentativePointage.createdAt, limiteTentatives)).returning({ id: tentativePointage.id });
    const sessionsSupprimees = await tx.delete(session).where(lt(session.expireLe, maintenant)).returning({ id: session.id });
    return {
      pointages: pointagesSupprimes.length,
      anomalies: anomaliesSupprimees.length,
      recaps: recapsSupprimes.length,
      tentatives: tentativesSupprimees.length,
      sessions: sessionsSupprimees.length,
    };
  });

  const orgs = await withBypass(db, (tx) => tx.select({ id: organisation.id, journeeDebutHeure: organisation.journeeDebutHeure }).from(organisation));
  let salariesRecalcules = 0;
  for (const org of orgs) {
    await withTenant(db, org.id, async (tx) => {
      const nb = await tx.select({ id: salarie.id }).from(salarie).where(and(eq(salarie.organisationId, org.id), eq(salarie.actif, true)));
      if (nb.length === 0) return;
      const { annee, semaine } = semaineCourante({ timezone: "Europe/Paris", journeeDebutHeure: org.journeeDebutHeure }, maintenant);
      const res = await calculerSemaineOrganisation(tx, org.id, annee, semaine, maintenant);
      salariesRecalcules += res.length;
    });
  }

  return json({ ok: true, execute_le: maintenant.toISOString(), purge, anomalies: { salaries_recalcules: salariesRecalcules } });
});
