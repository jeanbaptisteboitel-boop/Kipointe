import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import { utilisateurCourant } from "@/lib/auth/session";
import { trouverJustificatif } from "@/lib/conges/justificatifs";
import { HttpError, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { stockage } from "@/lib/stockage";

export const runtime = "nodejs";

/**
 * GET /api/justificatifs/[id] → redirection vers le fichier (URL présignée du bucket, valable une
 * minute), pour le salarié concerné ou un administrateur de son entreprise. Toute consultation
 * par un administrateur est journalisée.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const u = await utilisateurCourant();
  if (!u) throw new HttpError(401, "NON_CONNECTE");
  if (u.role === "PLATEFORME" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "INTROUVABLE");
  const parAdmin = u.role === "ADMIN";
  const j = await withTenant(getDb(), u.organisationId, async (tx) => {
    const j = await trouverJustificatif(tx, id, { parAdmin, salarieId: u.salarieId });
    if (j && parAdmin && j.salarieId !== u.salarieId) {
      await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: j.salarieId, action: "JUSTIFICATIF_CONSULTE", detail: { id, nom: j.nom } });
    }
    return j;
  });
  if (!j) throw new HttpError(404, "INTROUVABLE");
  const s = stockage();
  if (!s) throw new HttpError(503, "STOCKAGE_NON_CONFIGURE");
  // Type servi : celui vérifié au dépôt sur le contenu du fichier, jamais celui annoncé.
  return new Response(null, { status: 302, headers: { Location: await s.urlLecture(j.cle, j.nom, j.typeMime), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
});
