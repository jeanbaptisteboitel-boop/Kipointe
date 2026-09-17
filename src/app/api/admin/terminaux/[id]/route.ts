import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { terminal } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { terminalVersApi } from "@/lib/api/serialiser";
import { HttpError, json, lireJson, route } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  libelle: z.string().trim().min(1).max(100).optional(),
  actif: z.boolean().optional(),
  /** true : révoque le token (la tablette devra être réappairée). */
  revoquer: z.boolean().optional(),
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const id = await paramId(ctx);
  const corps = await lireJson(req, schema);
  return avecGerant(async (tx, u) => {
    const [maj] = await tx
      .update(terminal)
      .set({
        ...(corps.libelle !== undefined ? { libelle: corps.libelle } : {}),
        ...(corps.actif !== undefined ? { actif: corps.actif } : {}),
        ...(corps.revoquer ? { tokenHash: null, appaireLe: null } : {}),
      })
      .where(and(eq(terminal.id, id), eq(terminal.organisationId, u.organisationId)))
      .returning();
    if (!maj) throw new HttpError(404, "TERMINAL_INTROUVABLE");
    return json({ terminal: terminalVersApi(maj) });
  });
});
