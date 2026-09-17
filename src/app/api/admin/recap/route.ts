import { avecGerant } from "@/lib/api/admin";
import { pointageEffectifVersApi, recapVersApi } from "@/lib/api/serialiser";
import { calculerSemaineOrganisation, calculerSemaineSalarie } from "@/lib/calcul/recap";
import { HttpError, json, route } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { enregistrerBrouillonRecap } from "@/lib/recap/service";
import { parseSemaine, semaineCourante } from "@/lib/temps/journee";

export const runtime = "nodejs";

/** GET /api/admin/recap?semaine=2026-W37&salarie=<id> → calcul hebdo (brouillon rafraîchi, anomalies synchronisées). */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const semaineParam = url.searchParams.get("semaine");
  const salarieId = url.searchParams.get("salarie");
  const maintenant = new Date();

  return avecGerant(async (tx, u) => {
    const sem = parseSemaine(semaineParam) ?? semaineCourante({ timezone: "Europe/Paris", journeeDebutHeure: 4 }, maintenant);
    if (semaineParam && !parseSemaine(semaineParam)) throw new HttpError(400, "SEMAINE_INVALIDE");

    if (salarieId) {
      const res = await calculerSemaineSalarie(tx, u.organisationId, salarieId, sem.annee, sem.semaine, maintenant);
      const brouillon = await enregistrerBrouillonRecap(tx, u.organisationId, res);
      await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId, action: "recap.consulter", detail: { semaine: semaineParam } });
      return json({
        semaine: sem,
        recap: recapVersApi(brouillon),
        resultat: serialiserResultat(res.resultat),
        pointages: res.pointages.map(pointageEffectifVersApi),
      });
    }

    const tous = await calculerSemaineOrganisation(tx, u.organisationId, sem.annee, sem.semaine, maintenant);
    const sortie = [];
    for (const res of tous) {
      const brouillon = await enregistrerBrouillonRecap(tx, u.organisationId, res);
      sortie.push({ salarie: { id: res.salarie.id, nom: res.salarie.nom, prenom: res.salarie.prenom }, recap: recapVersApi(brouillon), resultat: serialiserResultat(res.resultat) });
    }
    return json({ semaine: sem, salaries: sortie });
  });
});

function serialiserResultat(r: Awaited<ReturnType<typeof calculerSemaineSalarie>>["resultat"]) {
  return {
    annee: r.annee,
    semaine: r.semaine,
    debut: r.debut.toISOString(),
    fin: r.fin.toISOString(),
    terminee: r.terminee,
    total_minutes: r.totalMinutes,
    heures_sup: r.heuresSup,
    jours: r.jours.map((j) => ({
      date: j.date,
      minutes: j.minutes,
      amplitude_minutes: j.amplitudeMinutes,
      en_cours: j.enCours,
      intervalles: j.intervalles.map((it) => ({ debut: it.debut.toISOString(), fin: it.fin?.toISOString() ?? null, minutes: it.minutes, en_cours: it.enCours })),
    })),
    anomalies: r.anomalies,
  };
}
