import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { etablissement, pointage, salarie } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { saisieManuelleSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/admin/pointage { salarie_id, horodatage, type, motif } → saisie manuelle tracée (source SAISIE_MANUELLE). */
export const POST = route(async (req) => {
  const corps = await lireJson(req, saisieManuelleSchema);
  const maintenant = new Date();
  return avecGerant(async (tx, u) => {
    const s = await tx.query.salarie.findFirst({ where: and(eq(salarie.id, corps.salarie_id), eq(salarie.organisationId, u.organisationId)) });
    if (!s) throw new HttpError(404, "SALARIE_INTROUVABLE");
    const horodatage = new Date(corps.horodatage);
    if (horodatage.getTime() > maintenant.getTime() + 60_000) throw new HttpError(400, "HORODATAGE_FUTUR");
    const etab =
      (s.etablissementDefautId ? await tx.query.etablissement.findFirst({ where: eq(etablissement.id, s.etablissementDefautId) }) : null) ??
      (await tx.query.etablissement.findFirst({ where: and(eq(etablissement.organisationId, u.organisationId), eq(etablissement.actif, true)) }));
    if (!etab) throw new HttpError(409, "AUCUN_ETABLISSEMENT");
    const [cree] = await tx
      .insert(pointage)
      .values({
        organisationId: u.organisationId,
        salarieId: s.id,
        etablissementId: etab.id,
        terminalId: null,
        horodatageServeur: maintenant,
        horodatageTerminal: null,
        offsetHorlogeMs: null,
        horodatageEffectif: horodatage,
        type: corps.type,
        source: "SAISIE_MANUELLE",
        idempotencyKey: randomUUID(),
        saisiParId: u.id,
        motif: corps.motif,
      })
      .returning();
    await journaliserAcces(tx, {
      organisationId: u.organisationId,
      utilisateurId: u.id,
      salarieId: s.id,
      action: "pointage.saisie_manuelle",
      detail: { pointageId: cree!.id, type: corps.type, horodatage: corps.horodatage, motif: corps.motif },
    });
    return json({ pointage: { id: cree!.id, type: cree!.type, horodatage: cree!.horodatageEffectif.toISOString(), source: cree!.source } }, { status: 201 });
  });
});
