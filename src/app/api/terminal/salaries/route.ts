import { and, eq } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecTerminal } from "@/lib/auth/terminal";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";

/** GET /api/terminal/salaries → liste minimale (badge_uuid, prénom, version de PIN) pour l'affichage hors ligne. */
export const GET = route(async (req) => {
  return avecTerminal(req, async (tx, ctx) => {
    const rows = await tx
      .select({ badgeUuid: salarie.badgeUuid, prenom: salarie.prenom, nom: salarie.nom, matricule: salarie.matricule, pinVersion: salarie.pinVersion })
      .from(salarie)
      .where(and(eq(salarie.organisationId, ctx.organisation.id), eq(salarie.actif, true)));
    return json({
      salaries: rows.map((r) => ({ badge_uuid: r.badgeUuid, prenom: r.prenom, nom: r.nom, matricule: r.matricule, pin_version: r.pinVersion })),
      horloge_serveur: new Date().toISOString(),
    });
  });
});
