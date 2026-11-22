import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { COOKIE_TABLETTE, pointerParCode, trouverTablette } from "@/lib/tablette/service";

export const runtime = "nodejs";

/** POST /api/tablette/pointer { code } — pointage par code personnel, depuis une tablette reliée. */
export const POST = route(async (req) => {
  const db = getDb();
  const t = await trouverTablette(db, (await cookies()).get(COOKIE_TABLETTE)?.value);
  if (!t) throw new HttpError(401, "TABLETTE_INCONNUE");
  const { code } = await lireJson(req, z.object({ code: z.string().max(12) }));
  const r = await pointerParCode(db, t, code);
  if (r.ok) return json({ prenom: r.prenom, sens: r.sens, heure: r.heure });
  if (r.raison === "BLOQUEE") throw new HttpError(429, "CLAVIER_BLOQUE", { attenteSecondes: r.attenteSecondes });
  throw new HttpError(r.raison === "MODE_FERME" ? 403 : 401, r.raison);
});
