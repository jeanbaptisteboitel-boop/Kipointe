import { and, eq, sql } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { salarieVersApi } from "@/lib/api/serialiser";
import { hacherSecret } from "@/lib/auth/password";
import { genererPin } from "@/lib/crypto";
import { HttpError, json, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";

export const runtime = "nodejs";

/** POST /api/admin/salaries/:id/pin/reinitialiser → nouveau PIN (renvoyé une seule fois), déverrouillage. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const id = await paramId(ctx);
  return avecGerant(async (tx, u) => {
    const pin = genererPin();
    const [maj] = await tx
      .update(salarie)
      .set({ pinHash: await hacherSecret(pin), pinVersion: sql`${salarie.pinVersion} + 1`, pinEchecs: 0, pinVerrouilleJusqua: null })
      .where(and(eq(salarie.id, id), eq(salarie.organisationId, u.organisationId)))
      .returning();
    if (!maj) throw new HttpError(404, "SALARIE_INTROUVABLE");
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "pin.reinitialiser" });
    return json({ salarie: salarieVersApi(maj), pin: pin });
  });
});
