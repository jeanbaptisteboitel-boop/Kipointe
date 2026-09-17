import { and, eq } from "drizzle-orm";
import { salarie } from "@/db/schema";
import { avecConnecte } from "@/lib/api/admin";
import { pointageEffectifVersApi } from "@/lib/api/serialiser";
import { calculerSemaineSalarie } from "@/lib/calcul/recap";
import { HttpError, json, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { libelleType } from "@/lib/pointage/service";
import { formatDateHeure, parseSemaine, semaineCourante } from "@/lib/temps/journee";

export const runtime = "nodejs";

/**
 * GET /api/salarie/pointages?semaine=2026-W37[&format=csv]
 * Consultation et export par le salarié de ses propres pointages (droit d'accès RGPD).
 * Un gérant peut consulter un salarié avec `&salarie=<id>` (accès journalisé).
 */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const semaineParam = url.searchParams.get("semaine");
  const maintenant = new Date();

  return avecConnecte(async (tx, u) => {
    let salarieId: string | null = u.salarieId;
    const demande = url.searchParams.get("salarie");
    if (u.role === "GERANT" && demande) salarieId = demande;
    if (!salarieId) throw new HttpError(404, "AUCUN_SALARIE_ASSOCIE");
    const s = await tx.query.salarie.findFirst({ where: and(eq(salarie.id, salarieId), eq(salarie.organisationId, u.organisationId)) });
    if (!s) throw new HttpError(404, "SALARIE_INTROUVABLE");

    const sem = parseSemaine(semaineParam) ?? semaineCourante({ timezone: "Europe/Paris", journeeDebutHeure: 4 }, maintenant);
    const res = await calculerSemaineSalarie(tx, u.organisationId, s.id, sem.annee, sem.semaine, maintenant, { synchroniser: u.role === "GERANT" });
    if (u.role === "GERANT") {
      await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: s.id, action: format === "csv" ? "pointages.export" : "pointages.consulter" });
    }

    if (format === "csv") {
      const lignes = [
        ["date_heure", "horodatage_iso", "type", "source", "corrige", "motif"].join(";"),
        ...res.pointages.map((p) =>
          [formatDateHeure(p.horodatage, res.parametres.timezone), p.horodatage.toISOString(), libelleType(p.type), p.source, p.corrige ? "oui" : "non", (p.motif ?? "").replace(/[;\n]/g, " ")].join(";"),
        ),
        "",
        `Total semaine ${sem.annee}-W${sem.semaine};${res.resultat.totalMinutes} minutes`,
      ];
      return new Response("﻿" + lignes.join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="pointages-${s.nom}-${sem.annee}-W${sem.semaine}.csv"`,
        },
      });
    }

    return json({
      salarie: { id: s.id, nom: s.nom, prenom: s.prenom },
      semaine: sem,
      total_minutes: res.resultat.totalMinutes,
      jours: res.resultat.jours.map((j) => ({ date: j.date, minutes: j.minutes, en_cours: j.enCours })),
      pointages: res.pointages.map(pointageEffectifVersApi),
    });
  });
});
