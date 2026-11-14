import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { congeAbsence, pointageSemaine, salarie } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { utilisateurCourant } from "@/lib/auth/session";
import { chargerOrganisation, nomComplet } from "@/lib/donnees";
import { minutesParJour } from "@/lib/heures/compteur";
import { calculerHeuresJours } from "@/lib/heures/hebdo";
import { HttpError, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { lireJours } from "@/lib/pointage/paires";
import { planningEffectif } from "@/lib/planning";
import { ecartJours, estJourValide, jourLocal, lundiDe, plusJours } from "@/lib/temps/zone";

export const runtime = "nodejs";

const h = (heures: number) => (Math.round(heures * 100) / 100).toFixed(2).replace(".", ",");
const cellule = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** GET /api/admin/export?du=AAAA-MM-JJ&au=AAAA-MM-JJ → CSV des heures, une ligne par salarié et par jour. */
export const GET = route(async (req) => {
  const u = await utilisateurCourant();
  if (!u) throw new HttpError(401, "NON_CONNECTE");
  if (u.role !== "ADMIN") throw new HttpError(403, "ROLE_INSUFFISANT");
  const url = new URL(req.url);
  const du = url.searchParams.get("du");
  const au = url.searchParams.get("au");
  if (!estJourValide(du) || !estJourValide(au) || au < du || ecartJours(du, au) > 366) throw new HttpError(400, "PERIODE_INVALIDE");

  const lignes = await withTenant(getDb(), u.organisationId, async (tx) => {
    const org = await chargerOrganisation(tx, u.organisationId);
    const aujourdhui = jourLocal(new Date(), org.timezone);
    const fiches = await tx.select().from(salarie).where(eq(salarie.organisationId, org.id));
    const semaines = await tx
      .select()
      .from(pointageSemaine)
      .where(and(gte(pointageSemaine.semaineDebut, lundiDe(du)), lte(pointageSemaine.semaineDebut, au)));
    const conges = await tx.select().from(congeAbsence).where(and(lte(congeAbsence.dateDebut, au), gte(congeAbsence.dateFin, du)));
    const jours = Array.from({ length: ecartJours(du, au) + 1 }, (_, k) => plusJours(du, k));
    const out: string[][] = [["Salarié", "Matricule", "Date", "Prévu", "Pointé", "Congés payés", "Maladie", "Formation", "Férié", "Autres absences", "Absence non autorisée", "Écart"]];
    for (const f of fiches.sort((a, b) => nomComplet(a).localeCompare(nomComplet(b)))) {
      const pointes = minutesParJour(semaines.filter((s) => s.salarieId === f.id).map((s) => ({ jours: lireJours(s.jours) })));
      const calc = calculerHeuresJours({ jours, planning: planningEffectif(f, org).planning, conges: conges.filter((c) => c.salarieId === f.id), dateEntree: f.dateEntree, dateSortie: f.dateSortie, aujourdhui });
      for (const j of calc) {
        const pointe = (pointes.get(j.date) ?? 0) / 60;
        if (j.horsEmploi || (j.prevu === 0 && pointe === 0)) continue;
        const realise = pointe + j.congesPayes + j.maladie + j.formation + j.feries + j.autresAbsences;
        out.push([nomComplet(f), f.matricule ?? "", j.date.split("-").reverse().join("/"), h(j.prevu), h(pointe), h(j.congesPayes), h(j.maladie), h(j.formation), h(j.feries), h(j.autresAbsences), h(j.nonAutorisee), j.aVenir ? "" : h(realise - j.prevu)]);
      }
    }
    await journaliserAcces(tx, { organisationId: org.id, utilisateurId: u.id, action: "EXPORT_HEURES", detail: { du, au } });
    return out;
  });

  // BOM : Excel ouvre le fichier en UTF-8 ; séparateur point-virgule et virgule décimale (usage français).
  const csv = "﻿" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kipointe-heures-${du}-${au}.csv"`, "Cache-Control": "no-store" } });
});
