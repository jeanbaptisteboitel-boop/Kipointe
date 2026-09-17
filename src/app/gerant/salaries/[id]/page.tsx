import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerGerant } from "@/lib/auth/session";
import { libelleType } from "@/lib/pointage/service";
import { formatDateFr, formatDuree, formatHeure, formatSemaine, nomJour } from "@/lib/temps/journee";
import { chargerSemaineSalarie, semaineDemandee } from "@/lib/ui/data";
import { LIBELLES_ANOMALIE, LIBELLES_SOURCE } from "@/lib/ui/libelles";
import { SelecteurSemaine } from "../../SelecteurSemaine";
import { ActionsSalarie } from "./ActionsSalarie";
import { Corrections, SaisieManuelle } from "./Corrections";
import { ValidationRecap } from "./ValidationRecap";

export const metadata = { title: "Fiche salarié" };

export default async function PageSalarie({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerGerant();
  const { id } = await params;
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const data = await chargerSemaineSalarie(u, id, annee, semaine);
  if (!data) notFound();
  const { salarie: s, resultat, pointages, recap, parametres, anomalies } = data;
  const maintenant = new Date();
  const verrouille = !!s.pinVerrouilleJusqua && s.pinVerrouilleJusqua > maintenant;
  const tz = parametres.timezone;
  const base = `/gerant/salaries/${s.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {s.nom} {s.prenom}
          </h1>
          <p className="text-sm text-slate-600">
            {s.matricule ? `Matricule ${s.matricule} · ` : ""}
            {formatDuree(s.contratHeuresHebdo)} / semaine · entré le {s.dateEntree ? formatDateFr(s.dateEntree) : "—"}
            {!s.actif && " · SORTI"}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">Badge : BADGE:{s.badgeUuid}</p>
          {verrouille && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-800">Badge verrouillé jusqu'à {formatHeure(s.pinVerrouilleJusqua!, tz)} (5 PIN erronés).</p>
          )}
        </div>
        <ActionsSalarie salarieId={s.id} actif={s.actif} verrouille={verrouille} />
      </div>

      <SelecteurSemaine annee={annee} semaine={semaine} base={base} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Semaine {semaine} — détail par journée</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Journée</th>
                <th>Entrées → sorties</th>
                <th className="text-right">Total</th>
                <th>Alertes</th>
              </tr>
            </thead>
            <tbody>
              {resultat.jours.map((j) => {
                const alertes = resultat.anomalies.filter((a) => a.dateJour === j.date);
                return (
                  <tr key={j.date}>
                    <td className="whitespace-nowrap">
                      {nomJour(j.date, true)} {formatDateFr(j.date)}
                    </td>
                    <td className="tabular-nums">
                      {j.intervalles.length === 0
                        ? "—"
                        : j.intervalles.map((it, i) => (
                            <span key={i} className="mr-3 inline-block">
                              {formatHeure(it.debut, tz)} → {it.fin ? formatHeure(it.fin, tz) : it.enCours ? "…" : "??"}
                            </span>
                          ))}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{formatDuree(j.minutes)}</td>
                    <td className="text-xs text-amber-800">{alertes.map((a) => LIBELLES_ANOMALIE[a.type]).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="font-semibold">
                  Total hebdomadaire
                </td>
                <td className="text-right font-bold tabular-nums">{formatDuree(resultat.totalMinutes)}</td>
                <td className="text-xs">
                  {resultat.heuresSup
                    .filter((h) => h.minutes > 0)
                    .map((h) => `${formatDuree(h.minutes)} à ${h.taux} %`)
                    .join(" · ") || "pas d'heures sup."}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <ValidationRecap recap={{ id: recap.id, valideLe: recap.valideLe?.toISOString() ?? null, hash: recap.hashSha256 }} terminee={resultat.terminee} nbOublis={resultat.anomalies.filter((a) => a.type === "OUBLI_SORTIE").length} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Pointages de la semaine ({pointages.length})</h2>
        <Corrections
          pointages={pointages.map((p) => ({
            id: p.id,
            horodatage: p.horodatage.toISOString(),
            libelle: `${nomJour(p.horodatage.toISOString().slice(0, 10), true)} ${formatHeure(p.horodatage, tz)}`,
            type: p.type,
            typeLibelle: libelleType(p.type),
            source: LIBELLES_SOURCE[p.source] ?? p.source,
            corrige: p.corrige,
            motif: p.motif,
          }))}
          timezone={tz}
        />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <SaisieManuelle salarieId={s.id} timezone={tz} />
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Historique des anomalies</h2>
          <ul className="space-y-1 text-sm">
            {anomalies.map((a) => (
              <li key={a.id}>
                <Link href={`${base}?semaine=${formatSemaine(annee, semaine)}`} className="text-slate-500">
                  {formatDateFr(a.dateJour)}
                </Link>{" "}
                — {LIBELLES_ANOMALIE[a.type]} <span className="badge ml-1 bg-slate-100 text-slate-600">{a.statut.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
