import { and, desc, eq } from "drizzle-orm";
import { anomalie } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { anomalieVersApi } from "@/lib/api/serialiser";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";

/** GET /api/admin/anomalies?statut=OUVERTE → anomalies (les plus récentes d'abord). */
export const GET = route(async (req) => {
  const statut = new URL(req.url).searchParams.get("statut") ?? "OUVERTE";
  const filtreStatut = statut === "TOUTES" ? null : statut === "TRAITEE" || statut === "IGNOREE" ? statut : "OUVERTE";
  return avecGerant(async (tx, u) => {
    const rows = await tx.query.anomalie.findMany({
      where: filtreStatut
        ? and(eq(anomalie.organisationId, u.organisationId), eq(anomalie.statut, filtreStatut))
        : eq(anomalie.organisationId, u.organisationId),
      with: { salarie: { columns: { nom: true, prenom: true } } },
      orderBy: [desc(anomalie.dateJour), desc(anomalie.createdAt)],
      limit: 500,
    });
    return json({ anomalies: rows.map(anomalieVersApi) });
  });
});
