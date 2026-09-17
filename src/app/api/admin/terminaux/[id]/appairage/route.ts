import { and, eq } from "drizzle-orm";
import { terminal } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { genererCodeAppairage, sha256Hex } from "@/lib/crypto";
import { HttpError, json, route } from "@/lib/http";

export const runtime = "nodejs";
const VALIDITE_MS = 15 * 60_000;

/** POST /api/admin/terminaux/:id/appairage → code d'appairage à saisir sur la tablette (15 min, usage unique). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const id = await paramId(ctx);
  return avecGerant(async (tx, u) => {
    const code = genererCodeAppairage();
    const expireLe = new Date(Date.now() + VALIDITE_MS);
    const [maj] = await tx
      .update(terminal)
      .set({ codeAppairageHash: sha256Hex(code), codeAppairageExpireLe: expireLe })
      .where(and(eq(terminal.id, id), eq(terminal.organisationId, u.organisationId), eq(terminal.actif, true)))
      .returning();
    if (!maj) throw new HttpError(404, "TERMINAL_INTROUVABLE");
    return json({ code: `${code.slice(0, 4)}-${code.slice(4)}`, expire_le: expireLe.toISOString() });
  });
});
