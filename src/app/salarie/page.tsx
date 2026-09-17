import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { withTenant } from "@/db/tenant";
import { exigerConnecte } from "@/lib/auth/session";
import { calculerSemaineSalarie } from "@/lib/calcul/recap";
import { libelleType } from "@/lib/pointage/service";
import { formatDateFr, formatDuree, formatHeure, formatSemaine, nomJour } from "@/lib/temps/journee";
import { semaineDemandee } from "@/lib/ui/data";
import { LIBELLES_SOURCE } from "@/lib/ui/libelles";
import { Deconnexion } from "../gerant/Deconnexion";
import { SelecteurSemaine } from "../gerant/SelecteurSemaine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes pointages" };

export default async function PageSalarie({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerConnecte();
  if (u.role === "GERANT") redirect("/gerant");
  if (!u.salarieId) redirect("/connexion");
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const res = await withTenant(getDb(), u.organisationId, (tx) => calculerSemaineSalarie(tx, u.organisationId, u.salarieId!, annee, semaine, new Date(), { synchroniser: false }));
  const tz = res.parametres.timezone;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Mes pointages — {u.prenom} {u.nom}
        </h1>
        <Deconnexion />
      </header>
      <SelecteurSemaine annee={annee} semaine={semaine} base="/salarie" />
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Journée</th>
              <th>Entrées → sorties</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {res.resultat.jours.map((j) => (
              <tr key={j.date}>
                <td>
                  {nomJour(j.date, true)} {formatDateFr(j.date)}
                </td>
                <td className="tabular-nums">
                  {j.intervalles.map((it, i) => (
                    <span key={i} className="mr-3">
                      {formatHeure(it.debut, tz)} → {it.fin ? formatHeure(it.fin, tz) : it.enCours ? "…" : "??"}
                    </span>
                  ))}
                </td>
                <td className="text-right tabular-nums">{formatDuree(j.minutes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="font-semibold">
                Total de la semaine
              </td>
              <td className="text-right font-bold tabular-nums">{formatDuree(res.resultat.totalMinutes)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Détail des pointages</h2>
          <a href={`/api/salarie/pointages?semaine=${formatSemaine(annee, semaine)}&format=csv`} className="btn-secondary btn-sm">
            Exporter (CSV)
          </a>
        </div>
        <ul className="text-sm">
          {res.pointages.map((p) => (
            <li key={p.id} className="border-b border-slate-100 py-1 tabular-nums">
              {nomJour(p.horodatage.toISOString().slice(0, 10), true)} {formatHeure(p.horodatage, tz)} — {libelleType(p.type)} <span className="text-slate-500">({LIBELLES_SOURCE[p.source] ?? p.source}{p.corrige ? ", corrigé" : ""})</span>
            </li>
          ))}
          {res.pointages.length === 0 && <li className="text-slate-500">Aucun pointage cette semaine.</li>}
        </ul>
      </div>
    </div>
  );
}
