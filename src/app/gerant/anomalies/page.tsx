import Link from "next/link";
import { Chip, libelleAnomalie, PastilleAnomalie } from "@/components/ui";
import { exigerGerant } from "@/lib/auth/session";
import { formatDateFr, formatSemaine, nomJour, semaineIsoDe } from "@/lib/temps/journee";
import { listerAnomalies } from "@/lib/ui/data";
import { StatutAnomalie } from "./StatutAnomalie";

export const metadata = { title: "Anomalies" };

/** Le détail d'une anomalie en une phrase courte, jamais du JSON brut. */
function resume(type: string, detail: Record<string, unknown>): string {
  const d = detail as Record<string, number | string | undefined>;
  const h = (min: unknown) => {
    const n = Number(min);
    return Number.isFinite(n) ? `${Math.floor(n / 60)} h ${String(Math.round(n % 60)).padStart(2, "0")}` : "";
  };
  switch (type) {
    case "REPOS_11H":
      return `repos de ${h(d.reposMinutes)} entre deux journées`;
    case "REPOS_HEBDO":
      return `repos maximal de ${h(d.reposMaxMinutes)} dans la semaine`;
    case "PAUSE_MANQUANTE":
      return `${h(d.travailContinuMinutes)} de travail continu sans pause`;
    case "AMPLITUDE":
      return `amplitude de ${h(d.amplitudeMinutes)}`;
    case "HORS_PLAGE":
      return d.motif === "double_entree" ? "deux entrées consécutives" : "sortie sans entrée";
    case "OUBLI_SORTIE":
      return "aucune sortie enregistrée";
    default: {
      const ev = detail.evenements as unknown[] | undefined;
      return ev ? `${ev.length} événement${ev.length > 1 ? "s" : ""}` : "";
    }
  }
}

const FILTRES: [string, string][] = [
  ["OUVERTE", "Ouvertes"],
  ["TRAITEE", "Traitées"],
  ["IGNOREE", "Ignorées"],
  ["TOUTES", "Toutes"],
];

export default async function PageAnomalies({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const u = await exigerGerant();
  const { statut } = await searchParams;
  const filtre = statut === "TRAITEE" || statut === "IGNOREE" ? statut : statut === "TOUTES" ? null : "OUVERTE";
  const anomalies = await listerAnomalies(u, filtre);

  return (
    <div className="flex flex-col gap-[18px]">
      <h1 className="titre text-[28px]">Anomalies</h1>

      <div className="flex flex-wrap gap-2.5">
        {FILTRES.map(([v, l]) => (
          <Chip key={v} href={`/gerant/anomalies?statut=${v}`} actif={(filtre ?? "TOUTES") === v}>
            {l}
          </Chip>
        ))}
      </div>

      <div className="card-plat overflow-x-auto">
        <table className="tbl" style={{ minWidth: 940 }}>
          <thead>
            <tr>
              <th style={{ width: 100 }}>Jour</th>
              <th style={{ width: 156 }}>Salarié</th>
              <th style={{ width: 196 }}>Type</th>
              <th>Détail</th>
              <th style={{ width: 110 }}>Statut</th>
              <th style={{ width: 200 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center" style={{ color: "var(--muted)" }}>
                  Aucune anomalie.
                </td>
              </tr>
            )}
            {anomalies.map((a) => {
              const sem = semaineIsoDe(a.dateJour);
              return (
                <tr key={a.id}>
                  <td className="tabnum text-[13px] font-semibold whitespace-nowrap">
                    {nomJour(a.dateJour, true)} {formatDateFr(a.dateJour)}
                  </td>
                  <td>
                    <Link href={`/gerant/salaries/${a.salarieId}?semaine=${formatSemaine(sem.annee, sem.semaine)}`} className="font-semibold" style={{ color: "var(--navy)" }}>
                      {a.salarie.nom} {a.salarie.prenom}
                    </Link>
                  </td>
                  <td>{libelleAnomalie(a.type)}</td>
                  <td className="tabnum text-[13px]" style={{ color: "var(--muted)" }}>
                    {resume(a.type, a.detail)}
                  </td>
                  <td>
                    <PastilleAnomalie statut={a.statut} />
                  </td>
                  <td>
                    <StatutAnomalie id={a.id} statut={a.statut} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-[80ch] text-[13px]" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
        Une anomalie ignorée reste visible dans le filtre «&nbsp;Ignorées&nbsp;» et sur le récapitulatif hebdomadaire. Elle peut être rouverte à tout moment. Les seuils se règlent
        dans Paramètres.
      </p>
    </div>
  );
}
