import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { recapHebdo } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { HttpError, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { urlPresigneeLecture } from "@/lib/storage/scaleway";

export const runtime = "nodejs";

/** GET /api/admin/recap/:id/pdf → redirection vers une URL présignée (15 min) du PDF archivé. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const id = await paramId(ctx);
  return avecGerant(async (tx, u) => {
    const r = await tx.query.recapHebdo.findFirst({ where: and(eq(recapHebdo.id, id), eq(recapHebdo.organisationId, u.organisationId)) });
    if (!r) throw new HttpError(404, "RECAP_INTROUVABLE");
    if (!r.pdfObjectKey) throw new HttpError(409, "RECAP_NON_VALIDE");
    const { url } = await urlPresigneeLecture(r.pdfObjectKey);
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: r.salarieId, action: "recap.pdf", detail: { recapId: r.id } });
    return NextResponse.redirect(url, { status: 302 });
  });
});
