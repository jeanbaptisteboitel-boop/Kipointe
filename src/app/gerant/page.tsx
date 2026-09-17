import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { formatDuree, formatSemaine, nomJour } from "@/lib/temps/journee";
import { chargerSemaineOrganisation, semaineDemandee } from "@/lib/ui/data";
import { LIBELLES_ANOMALIE } from "@/lib/ui/libelles";
import { SelecteurSemaine } from "./SelecteurSemaine";

export const metadata = { title: "Tableau hebdomadaire" };

export default async function PageSemaine({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerGerant();
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const lignes = await chargerSemaineOrganisation(u, annee, semaine);
  const anomalies = lignes.flatMap((l) => l.resultat.anomalies.map((a) => ({ ...a, salarie: l.salarie })));
  const jours = lignes[0]?.resultat.jours.map((j) => j.date) ?? [];

  return (
    <div className="space-y-6">
      <SelecteurSemaine annee={annee} semaine={semaine} base="/gerant" />

      {anomalies.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">
            {anomalies.length} alerte{anomalies.length > 1 ? "s" : ""} cette semaine
          </h2>
          <ul className="mt-2 grid gap-1 text-sm text-amber-900 sm:grid-cols-2">
            {anomalies.slice(0, 12).map((a, i) => (
              <li key={i}>
                <Link href={`/gerant/salaries/${a.salarie.id}?semaine=${formatSemaine(annee, semaine)}`} className="underline">
                  {a.salarie.prenom} {a.salarie.nom}
                </Link>{" "}
                — {nomJour(a.dateJour, true)} {a.dateJour.slice(8)} : {LIBELLES_ANOMALIE[a.type]}
              </li>
            ))}
          </ul>
          {anomalies.length > 12 && (
            <Link href="/gerant/anomalies" className="mt-2 inline-block text-sm underline">
              Voir toutes les anomalies
            </Link>
          )}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Salarié</th>
              {jours.map((d) => (
                <th key={d} className="text-center">
                  {nomJour(d, true)} {d.slice(8)}
                </th>
              ))}
              <th className="text-right">Total</th>
              <th className="text-right">H. sup.</th>
              <th>Récap</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  Aucun salarié actif. <Link href="/gerant/salaries" className="underline">Ajouter un salarié</Link>.
                </td>
              </tr>
            )}
            {lignes.map((l) => {
              const hs = l.resultat.heuresSup.reduce((s, h) => s + h.minutes, 0);
              return (
                <tr key={l.salarie.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/gerant/salaries/${l.salarie.id}?semaine=${formatSemaine(annee, semaine)}`} className="font-medium text-[var(--navy)] underline">
                      {l.salarie.nom} {l.salarie.prenom}
                    </Link>
                  </td>
                  {l.resultat.jours.map((j) => {
                    const alertes = l.resultat.anomalies.filter((a) => a.dateJour === j.date);
                    return (
                      <td key={j.date} className={`text-center tabular-nums ${alertes.length ? "bg-amber-50 text-amber-900" : ""}`} title={alertes.map((a) => LIBELLES_ANOMALIE[a.type]).join(", ")}>
                        {j.minutes > 0 ? formatDuree(j.minutes) : j.enCours ? "en cours" : alertes.length ? "!" : "—"}
                      </td>
                    );
                  })}
                  <td className="text-right font-semibold tabular-nums">{formatDuree(l.resultat.totalMinutes)}</td>
                  <td className="text-right tabular-nums">{hs > 0 ? formatDuree(hs) : "—"}</td>
                  <td>
                    {l.recap.valideLe ? (
                      <span className="badge bg-emerald-100 text-emerald-800">validé</span>
                    ) : l.resultat.terminee ? (
                      <span className="badge bg-slate-100 text-slate-700">à valider</span>
                    ) : (
                      <span className="badge bg-blue-50 text-blue-700">en cours</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
