import { avecGerant, paramId } from "@/lib/api/admin";
import { recapVersApi } from "@/lib/api/serialiser";
import { json, route } from "@/lib/http";
import { validerRecap } from "@/lib/recap/service";
import { exigerStockage } from "@/lib/storage/scaleway";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/admin/recap/:id/valider → PDF, upload Scaleway (Object Lock), récap figé. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const id = await paramId(ctx);
  exigerStockage();
  return avecGerant(async (tx, u) => {
    const recap = await validerRecap(tx, u.organisationId, id, u);
    return json({ recap: recapVersApi(recap) });
  });
});
