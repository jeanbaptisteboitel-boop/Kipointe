import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { formatDateFr, formatSemaine, semaineIsoDe } from "@/lib/temps/journee";
import { listerAnomalies } from "@/lib/ui/data";
import { LIBELLES_ANOMALIE } from "@/lib/ui/libelles";
import { StatutAnomalie } from "./StatutAnomalie";

export const metadata = { title: "Anomalies" };

function resumeDetail(type: string, detail: Record<string, unknown>): string {
  const d = detail as Record<string, number | string | undefined>;
  switch (type) {
    case "REPOS_11H":
      return `repos de ${Math.floor(Number(d.reposMinutes) / 60)} h ${String(Number(d.reposMinutes) % 60).padStart(2, "0")}`;
    case "REPOS_HEBDO":
      return `repos maximal ${Math.floor(Number(d.reposMaxMinutes) / 60)} h`;
    case "PAUSE_MANQUANTE":
      return `${Math.floor(Number(d.travailContinuMinutes) / 60)} h ${String(Number(d.travailContinuMinutes) % 60).padStart(2, "0")} de travail continu`;
    case "AMPLITUDE":
      return `amplitude ${Math.floor(Number(d.amplitudeMinutes) / 60)} h ${String(Number(d.amplitudeMinutes) % 60).padStart(2, "0")}`;
    case "HORS_PLAGE":
      return d.motif === "double_entree" ? "double entrée" : "sortie sans entrée";
    default: {
      const ev = detail.evenements as unknown[] | undefined;
      return ev ? `${ev.length} événement${ev.length > 1 ? "s" : ""}` : "";
    }
  }
}

export default async function PageAnomalies({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const u = await exigerGerant();
  const { statut } = await searchParams;
  const filtre = statut === "TRAITEE" || statut === "IGNOREE" ? statut : statut === "TOUTES" ? null : "OUVERTE";
  const anomalies = await listerAnomalies(u, filtre);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Anomalies</h1>
        <div className="flex gap-2 text-sm">
          {[
            ["OUVERTE", "Ouvertes"],
            ["TRAITEE", "Traitées"],
            ["IGNOREE", "Ignorées"],
            ["TOUTES", "Toutes"],
          ].map(([v, l]) => (
            <Link key={v} href={`/gerant/anomalies?statut=${v}`} className={`rounded-md px-3 py-1 ${(filtre ?? "TOUTES") === v ? "bg-[var(--navy)] text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Jour</th>
              <th>Salarié</th>
              <th>Type</th>
              <th>Détail</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {anomalies.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Aucune anomalie.
                </td>
              </tr>
            )}
            {anomalies.map((a) => {
              const sem = semaineIsoDe(a.dateJour);
              return (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{formatDateFr(a.dateJour)}</td>
                  <td>
                    <Link href={`/gerant/salaries/${a.salarieId}?semaine=${formatSemaine(sem.annee, sem.semaine)}`} className="underline">
                      {a.salarie.nom} {a.salarie.prenom}
                    </Link>
                  </td>
                  <td className="font-medium">{LIBELLES_ANOMALIE[a.type]}</td>
                  <td className="text-xs text-slate-600">{resumeDetail(a.type, a.detail)}</td>
                  <td>
                    <span className={`badge ${a.statut === "OUVERTE" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{a.statut.toLowerCase()}</span>
                  </td>
                  <td className="text-right">
                    <StatutAnomalie id={a.id} statut={a.statut} />
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
