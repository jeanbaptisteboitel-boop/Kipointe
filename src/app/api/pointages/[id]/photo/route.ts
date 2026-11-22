import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import { utilisateurCourant } from "@/lib/auth/session";
import { HttpError, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { stockage } from "@/lib/stockage";
import { trouverPhoto } from "@/lib/tablette/photo";

export const runtime = "nodejs";

/**
 * GET /api/pointages/[id]/photo → redirection vers la photo d'un pointage (URL présignée d'une
 * minute). Réservée aux administrateurs de l'entreprise ; chaque consultation est journalisée.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const u = await utilisateurCourant();
  if (!u) throw new HttpError(401, "NON_CONNECTE");
  if (u.role !== "ADMIN" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "INTROUVABLE");
  const p = await withTenant(getDb(), u.organisationId, async (tx) => {
    const p = await trouverPhoto(tx, id);
    if (p) await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: p.salarieId, action: "PHOTO_POINTAGE_CONSULTEE", detail: { pointageId: id } });
    return p;
  });
  if (!p) throw new HttpError(404, "INTROUVABLE");
  const s = stockage();
  if (!s) throw new HttpError(503, "STOCKAGE_NON_CONFIGURE");
  return new Response(null, { status: 302, headers: { Location: await s.urlLecture(p.cle, `pointage-${p.jour}-${p.heure.replace(":", "h")}.jpg`, "image/jpeg"), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
});
