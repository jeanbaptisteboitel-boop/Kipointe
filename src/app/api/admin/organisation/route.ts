import { eq } from "drizzle-orm";
import { organisation, type Organisation } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { json, lireJson, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { parametresOrganisationSchema } from "@/lib/validation";

export const runtime = "nodejs";

function versApi(o: Organisation) {
  return {
    id: o.id,
    raison_sociale: o.raisonSociale,
    siret: o.siret,
    convention_collective: o.conventionCollective,
    duree_hebdo_reference: o.dureeHebdoReference,
    paliers_heures_sup: o.paliersHeuresSup,
    repos_quotidien_min: o.reposQuotidienMin,
    repos_hebdo_min: o.reposHebdoMin,
    pause_obligatoire_apres: o.pauseObligatoireApres,
    pause_duree_min: o.pauseDureeMin,
    amplitude_max: o.amplitudeMax,
    journee_debut_heure: o.journeeDebutHeure,
    anti_doublon_secondes: o.antiDoublonSecondes,
  };
}

export const GET = route(async () => {
  return avecGerant(async (tx, u) => {
    const o = await tx.query.organisation.findFirst({ where: eq(organisation.id, u.organisationId) });
    return json({ organisation: o ? versApi(o) : null });
  });
});

/** PATCH /api/admin/organisation → règles de calcul paramétrables (convention collective). */
export const PATCH = route(async (req) => {
  const corps = await lireJson(req, parametresOrganisationSchema);
  return avecGerant(async (tx, u) => {
    const [maj] = await tx
      .update(organisation)
      .set({
        ...(corps.raison_sociale !== undefined ? { raisonSociale: corps.raison_sociale } : {}),
        ...(corps.siret !== undefined ? { siret: corps.siret || null } : {}),
        ...(corps.convention_collective !== undefined ? { conventionCollective: corps.convention_collective || null } : {}),
        ...(corps.duree_hebdo_reference !== undefined ? { dureeHebdoReference: Math.round(corps.duree_hebdo_reference * 60) } : {}),
        ...(corps.paliers_heures_sup !== undefined ? { paliersHeuresSup: corps.paliers_heures_sup } : {}),
        ...(corps.repos_quotidien_min !== undefined ? { reposQuotidienMin: corps.repos_quotidien_min } : {}),
        ...(corps.repos_hebdo_min !== undefined ? { reposHebdoMin: corps.repos_hebdo_min } : {}),
        ...(corps.pause_obligatoire_apres !== undefined ? { pauseObligatoireApres: corps.pause_obligatoire_apres } : {}),
        ...(corps.pause_duree_min !== undefined ? { pauseDureeMin: corps.pause_duree_min } : {}),
        ...(corps.amplitude_max !== undefined ? { amplitudeMax: corps.amplitude_max } : {}),
        ...(corps.journee_debut_heure !== undefined ? { journeeDebutHeure: corps.journee_debut_heure } : {}),
        ...(corps.anti_doublon_secondes !== undefined ? { antiDoublonSecondes: corps.anti_doublon_secondes } : {}),
      })
      .where(eq(organisation.id, u.organisationId))
      .returning();
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, action: "organisation.parametres", detail: { champs: Object.keys(corps) } });
    return json({ organisation: maj ? versApi(maj) : null });
  });
});
