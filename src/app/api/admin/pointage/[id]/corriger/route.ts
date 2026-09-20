import { and, asc, eq } from "drizzle-orm";
import { correction, pointage } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { pointageEffectifVersApi } from "@/lib/api/serialiser";
import { appliquerCorrections } from "@/lib/calcul/effectifs";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { correctionSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/admin/pointage/:id/corriger { nouvelle_valeur, motif } → correction additive avec motif obligatoire. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const id = await paramId(ctx);
  const corps = await lireJson(req, correctionSchema);
  if (corps.nouvelle_valeur.horodatage === undefined && corps.nouvelle_valeur.type === undefined && corps.nouvelle_valeur.annule === undefined) {
    throw new HttpError(400, "CORRECTION_VIDE");
  }
  return avecGerant(async (tx, u) => {
    const p = await tx.query.pointage.findFirst({ where: and(eq(pointage.id, id), eq(pointage.organisationId, u.organisationId)) });
    if (!p) throw new HttpError(404, "POINTAGE_INTROUVABLE");
    const anciennes = await tx.select().from(correction).where(eq(correction.pointageId, id)).orderBy(asc(correction.createdAt));
    const effectifAvant = appliquerCorrections([p], anciennes)[0];
    const ancienneValeur = effectifAvant
      ? { horodatage: effectifAvant.horodatage.toISOString(), type: effectifAvant.type, annule: false }
      : { horodatage: p.horodatageEffectif.toISOString(), type: p.type, annule: true };
    const nouvelleValeur = {
      horodatage: corps.nouvelle_valeur.horodatage ?? ancienneValeur.horodatage,
      type: corps.nouvelle_valeur.type ?? ancienneValeur.type,
      annule: corps.nouvelle_valeur.annule ?? false,
    };
    const [c] = await tx
      .insert(correction)
      .values({ pointageId: id, organisationId: u.organisationId, auteurId: u.id, ancienneValeur, nouvelleValeur, motif: corps.motif })
      .returning();
    await journaliserAcces(tx, {
      organisationId: u.organisationId,
      utilisateurId: u.id,
      salarieId: p.salarieId,
      action: "pointage.corriger",
      detail: { pointageId: id, correctionId: c!.id, ancienneValeur, nouvelleValeur, motif: corps.motif },
    });
    const effectifApres = appliquerCorrections([p], [...anciennes, c!])[0];
    return json({ correction: { id: c!.id, ancienne_valeur: ancienneValeur, nouvelle_valeur: nouvelleValeur, motif: corps.motif }, pointage: effectifApres ? pointageEffectifVersApi(effectifApres) : null });
  });
});
