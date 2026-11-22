import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { LimiteurDebit } from "@/lib/pointeuse/adms";
import { COOKIE_TABLETTE, activerTablette } from "@/lib/tablette/service";

export const runtime = "nodejs";

/** Dix essais par quart d'heure et par adresse (par instance) : le code d'activation ne se devine pas. */
const essais = new LimiteurDebit(10, 15 * 60_000);

/** POST /api/tablette/activer { code } → relie cette tablette et pose son jeton en cookie. */
export const POST = route(async (req) => {
  const { code } = await lireJson(req, z.object({ code: z.string().max(40) }));
  const adresse = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  if (!essais.autoriser(adresse)) throw new HttpError(429, "TROP_DE_TENTATIVES");
  const jeton = await activerTablette(getDb(), code);
  if (!jeton) throw new HttpError(401, "CODE_ACTIVATION_INVALIDE");
  (await cookies()).set(COOKIE_TABLETTE, jeton, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 5 * 365 * 24 * 3600 });
  return json({ ok: true });
});
