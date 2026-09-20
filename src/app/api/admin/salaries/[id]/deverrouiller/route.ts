import { and, eq } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { salarieVersApi } from "@/lib/api/serialiser";
import { HttpError, json, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";

export const runtime = "nodejs";

/** POST /api/admin/salaries/:id/deverrouiller → lève le verrouillage après 5 PIN faux. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const id = await paramId(ctx);
  return avecGerant(async (tx, u) => {
    const [maj] = await tx
      .update(salarie)
      .set({ pinEchecs: 0, pinVerrouilleJusqua: null })
      .where(and(eq(salarie.id, id), eq(salarie.organisationId, u.organisationId)))
      .returning();
    if (!maj) throw new HttpError(404, "SALARIE_INTROUVABLE");
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "badge.deverrouiller" });
    return json({ salarie: salarieVersApi(maj) });
  });
});
