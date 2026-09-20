import { and, eq } from "drizzle-orm";
import { anomalie } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { anomalieVersApi } from "@/lib/api/serialiser";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { anomalieStatutSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** PATCH /api/admin/anomalies/:id { statut } */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const id = await paramId(ctx);
  const corps = await lireJson(req, anomalieStatutSchema);
  return avecGerant(async (tx, u) => {
    const [maj] = await tx
      .update(anomalie)
      .set({ statut: corps.statut, traiteeParId: corps.statut === "OUVERTE" ? null : u.id, traiteeLe: corps.statut === "OUVERTE" ? null : new Date() })
      .where(and(eq(anomalie.id, id), eq(anomalie.organisationId, u.organisationId)))
      .returning();
    if (!maj) throw new HttpError(404, "ANOMALIE_INTROUVABLE");
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: maj.salarieId, action: "anomalie.statut", detail: { anomalieId: id, statut: corps.statut } });
    return json({ anomalie: anomalieVersApi(maj) });
  });
});
