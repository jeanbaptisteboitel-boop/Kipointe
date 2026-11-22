import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { COOKIE_TABLETTE, trouverTablette } from "@/lib/tablette/service";
import { demanderCodeSms } from "@/lib/tablette/sms";

export const runtime = "nodejs";

/** POST /api/tablette/sms { salarieId } — envoie au salarié choisi un code de pointage par SMS. */
export const POST = route(async (req) => {
  const db = getDb();
  const t = await trouverTablette(db, (await cookies()).get(COOKIE_TABLETTE)?.value);
  if (!t) throw new HttpError(401, "TABLETTE_INCONNUE");
  const { salarieId } = await lireJson(req, z.object({ salarieId: z.string().uuid() }));
  const r = await demanderCodeSms(db, t, salarieId);
  if (r.ok) return json({ mobile: r.mobile });
  throw new HttpError(r.raison === "PATIENTEZ" || r.raison === "TROP_DE_SMS" ? 429 : r.raison === "ENVOI_IMPOSSIBLE" || r.raison === "SERVICE_ABSENT" ? 503 : 403, r.raison);
});
