import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import { utilisateurCourant } from "@/lib/auth/session";
import { lireJustificatif } from "@/lib/conges/justificatifs";
import { HttpError, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";

export const runtime = "nodejs";

/**
 * GET /api/justificatifs/[id] → le fichier, pour le salarié concerné ou un administrateur de son
 * entreprise. Toute consultation par un administrateur est journalisée.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const u = await utilisateurCourant();
  if (!u) throw new HttpError(401, "NON_CONNECTE");
  if (u.role === "PLATEFORME" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "INTROUVABLE");
  const parAdmin = u.role === "ADMIN";
  const j = await withTenant(getDb(), u.organisationId, async (tx) => {
    const j = await lireJustificatif(tx, id, { parAdmin, salarieId: u.salarieId });
    if (j && parAdmin && j.salarieId !== u.salarieId) {
      await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: j.salarieId, action: "JUSTIFICATIF_CONSULTE", detail: { id, nom: j.nom } });
    }
    return j;
  });
  if (!j) throw new HttpError(404, "INTROUVABLE");
  return new Response(new Uint8Array(j.contenu), {
    headers: {
      "Content-Type": j.typeMime,
      "Content-Length": String(j.taille),
      // Affiché dans le navigateur (PDF, image) ; le type est celui vérifié au dépôt, jamais deviné.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(j.nom)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
