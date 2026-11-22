import { cookies } from "next/headers";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { HttpError, json, route } from "@/lib/http";
import { DUREE_PAS_MS, jetonQr } from "@/lib/tablette/jeton";
import { COOKIE_TABLETTE, dernierPointage, noterContactTablette, trouverTablette } from "@/lib/tablette/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tablette/etat — interrogé par l'écran de la tablette toutes les dix secondes : modes
 * ouverts, QR code du moment, dernier pointage à afficher. Sert aussi de signe de vie.
 */
export const GET = route(async (req) => {
  const db = getDb();
  const t = await trouverTablette(db, (await cookies()).get(COOKIE_TABLETTE)?.value);
  if (!t) throw new HttpError(401, "TABLETTE_INCONNUE");
  const maintenant = new Date();
  await noterContactTablette(db, t, maintenant);
  let qr: { svg: string; resteMs: number } | null = null;
  if (t.modeQr) {
    const url = `${new URL(req.url).origin}/pointer?j=${jetonQr(t.id, t.secretQr, maintenant)}`;
    qr = { svg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }), resteMs: DUREE_PAS_MS - (maintenant.getTime() % DUREE_PAS_MS) };
  }
  return json(
    { nom: t.nom, entreprise: t.entreprise, fuseau: t.fuseau, modeCode: t.modeCode, qr, dernier: await dernierPointage(db, t), bloqueeMs: t.bloqueeJusqua ? Math.max(0, t.bloqueeJusqua.getTime() - maintenant.getTime()) : 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
});
