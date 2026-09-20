import { and, eq } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecGerant, paramId } from "@/lib/api/admin";
import { salarieVersApi } from "@/lib/api/serialiser";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { salarieModificationSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const id = await paramId(ctx);
  return avecGerant(async (tx, u) => {
    const s = await tx.query.salarie.findFirst({ where: and(eq(salarie.id, id), eq(salarie.organisationId, u.organisationId)) });
    if (!s) throw new HttpError(404, "SALARIE_INTROUVABLE");
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "salarie.consulter" });
    return json({ salarie: salarieVersApi(s) });
  });
});

export const PATCH = route<Ctx>(async (req, ctx) => {
  const id = await paramId(ctx);
  const corps = await lireJson(req, salarieModificationSchema);
  return avecGerant(async (tx, u) => {
    const [maj] = await tx
      .update(salarie)
      .set({
        ...(corps.nom !== undefined ? { nom: corps.nom } : {}),
        ...(corps.prenom !== undefined ? { prenom: corps.prenom } : {}),
        ...(corps.matricule !== undefined ? { matricule: corps.matricule || null } : {}),
        ...(corps.email !== undefined ? { email: corps.email || null } : {}),
        ...(corps.etablissement_id !== undefined ? { etablissementDefautId: corps.etablissement_id } : {}),
        ...(corps.contrat_heures_hebdo !== undefined ? { contratHeuresHebdo: Math.round(corps.contrat_heures_hebdo * 60) } : {}),
        ...(corps.date_entree !== undefined ? { dateEntree: corps.date_entree } : {}),
        ...(corps.date_sortie !== undefined ? { dateSortie: corps.date_sortie } : {}),
        ...(corps.actif !== undefined ? { actif: corps.actif } : {}),
      })
      .where(and(eq(salarie.id, id), eq(salarie.organisationId, u.organisationId)))
      .returning();
    if (!maj) throw new HttpError(404, "SALARIE_INTROUVABLE");
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "salarie.modifier", detail: { champs: Object.keys(corps) } });
    return json({ salarie: salarieVersApi(maj) });
  });
});
