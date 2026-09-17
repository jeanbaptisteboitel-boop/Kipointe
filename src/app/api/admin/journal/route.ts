import { desc, eq } from "drizzle-orm";
import { journalAcces } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";

/** GET /api/admin/journal → 200 derniers accès admin aux données salariés. */
export const GET = route(async () => {
  return avecGerant(async (tx, u) => {
    const rows = await tx.query.journalAcces.findMany({
      where: eq(journalAcces.organisationId, u.organisationId),
      orderBy: [desc(journalAcces.createdAt)],
      limit: 200,
    });
    return json({
      journal: rows.map((r) => ({ id: r.id, utilisateur_id: r.utilisateurId, salarie_id: r.salarieId, action: r.action, detail: r.detail, created_at: r.createdAt.toISOString() })),
    });
  });
});
