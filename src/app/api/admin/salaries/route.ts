import { and, asc, eq } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { salarieVersApi } from "@/lib/api/serialiser";
import { hacherSecret } from "@/lib/auth/password";
import { genererPin } from "@/lib/crypto";
import { json, lireJson, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { salarieCreationSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** GET /api/admin/salaries → liste des salariés (actifs par défaut, `?tous=1` pour inclure les sortis). */
export const GET = route(async (req) => {
  const tous = new URL(req.url).searchParams.get("tous") === "1";
  return avecGerant(async (tx, u) => {
    const rows = await tx
      .select()
      .from(salarie)
      .where(tous ? eq(salarie.organisationId, u.organisationId) : and(eq(salarie.organisationId, u.organisationId), eq(salarie.actif, true)))
      .orderBy(asc(salarie.nom), asc(salarie.prenom));
    return json({ salaries: rows.map((s) => salarieVersApi(s)) });
  });
});

/** POST /api/admin/salaries → crée le salarié, génère badge_uuid + PIN initial (renvoyé une seule fois). */
export const POST = route(async (req) => {
  const corps = await lireJson(req, salarieCreationSchema);
  return avecGerant(async (tx, u) => {
    const pin = genererPin();
    const [cree] = await tx
      .insert(salarie)
      .values({
        organisationId: u.organisationId,
        nom: corps.nom,
        prenom: corps.prenom,
        matricule: corps.matricule || null,
        email: corps.email || null,
        etablissementDefautId: corps.etablissement_id ?? null,
        pinHash: await hacherSecret(pin),
        contratHeuresHebdo: Math.round((corps.contrat_heures_hebdo ?? 35) * 60),
        dateEntree: corps.date_entree ?? null,
      })
      .returning();
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: cree!.id, action: "salarie.creer" });
    return json({ salarie: salarieVersApi(cree!), pin_initial: pin }, { status: 201 });
  });
});
