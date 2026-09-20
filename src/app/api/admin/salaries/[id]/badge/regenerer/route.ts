import { and, eq, sql } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { salarieVersApi } from "@/lib/api/serialiser";
import { HttpError, json, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";

export const runtime = "nodejs";

/** POST /api/admin/salaries/:id/badge/regenerer → nouveau badge_uuid, l'ancien est immédiatement invalide. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const id = await paramId(ctx);
  return avecGerant(async (tx, u) => {
    const [maj] = await tx
      .update(salarie)
      .set({ badgeUuid: sql`gen_random_uuid()` })
      .where(and(eq(salarie.id, id), eq(salarie.organisationId, u.organisationId)))
      .returning();
    if (!maj) throw new HttpError(404, "SALARIE_INTROUVABLE");
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "badge.regenerer" });
    return json({ salarie: salarieVersApi(maj) });
  });
});
