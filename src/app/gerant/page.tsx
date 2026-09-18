import Link from "next/link";
import { IconeAlerte } from "@/components/icones";
import { libelleAnomalie, PastilleRecap, type EtatRecap } from "@/components/ui";
import { exigerGerant } from "@/lib/auth/session";
import { formatDateCourte, formatDuree, formatSemaine, nomJour } from "@/lib/temps/journee";
import { chargerSemaineOrganisation, semaineDemandee } from "@/lib/ui/data";
import { SelecteurSemaine } from "./SelecteurSemaine";

export const metadata = { title: "Tableau hebdomadaire" };

export default async function PageSemaine({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerGerant();
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const lignes = await chargerSemaineOrganisation(u, annee, semaine);

  const alertes = lignes.flatMap((l) => l.resultat.anomalies.map((a) => ({ ...a, salarie: l.salarie })));
  const jours = lignes[0]?.resultat.jours.map((j) => j.date) ?? [];
  const totalMinutes = lignes.reduce((s, l) => s + l.resultat.totalMinutes, 0);
  const totalSup = lignes.reduce((s, l) => s + l.resultat.heuresSup.reduce((x, h) => x + h.minutes, 0), 0);
  const lienSemaine = (id: string) => `/gerant/salaries/${id}?semaine=${formatSemaine(annee, semaine)}`;

  function etatRecap(valide: boolean, terminee: boolean): EtatRecap {
    return valide ? "valide" : terminee ? "a-valider" : "en-cours";
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titre text-[28px]">Tableau hebdomadaire</h1>
        <SelecteurSemaine annee={annee} semaine={semaine} base="/gerant" />
      </div>

      {alertes.length > 0 && (
        <div className="encart-alerte">
          <div className="flex items-center gap-2.5">
            <IconeAlerte size={19} />
            <span className="text-[15px] font-bold">
              {alertes.length} anomalie{alertes.length > 1 ? "s" : ""} sur la semaine
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-[7px]">
            {alertes.slice(0, 6).map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <span className="h-[5px] w-[5px] flex-none rounded-full" style={{ background: "#B97500" }} />
                <span>
                  <Link href={lienSemaine(a.salarie.id)} className="underline" style={{ color: "inherit" }}>
                    {a.salarie.prenom} {a.salarie.nom}
                  </Link>
                  {" — "}
                  {nomJour(a.dateJour, true)} {formatDateCourte(a.dateJour)} : {libelleAnomalie(a.type)}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/gerant/anomalies"
            className="mt-3.5 inline-block rounded-full bg-white px-4 py-[7px] text-[13px] font-bold"
            style={{ border: "1px solid #B97500", color: "var(--warn-ink)" }}
          >
            Traiter les anomalies
          </Link>
        </div>
      )}

      <div className="card-plat overflow-x-auto">
        <table className="tbl" style={{ minWidth: 940 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}>Salarié</th>
              {jours.map((d) => (
                <th key={d} className="text-center whitespace-nowrap">
                  {nomJour(d, true)} {formatDateCourte(d)}
                </th>
              ))}
              <th className="text-right whitespace-nowrap">Total</th>
              <th className="text-right whitespace-nowrap">H. sup.</th>
              <th>Récap</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center" style={{ color: "var(--muted)" }}>
                  Aucun salarié actif.{" "}
                  <Link href="/gerant/salaries" className="underline">
                    Ajouter un salarié
                  </Link>
                  .
                </td>
              </tr>
            )}
            {lignes.map((l) => {
              const sup = l.resultat.heuresSup.reduce((s, h) => s + h.minutes, 0);
              return (
                <tr key={l.salarie.id}>
                  <td style={{ minWidth: 170 }}>
                    <Link href={lienSemaine(l.salarie.id)} className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                      {l.salarie.nom} {l.salarie.prenom}
                    </Link>
                    {l.salarie.matricule && (
                      <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--faint)" }}>
                        {l.salarie.matricule}
                      </div>
                    )}
                  </td>
                  {l.resultat.jours.map((j) => {
                    const alerte = l.resultat.anomalies.filter((a) => a.dateJour === j.date);
                    const vide = j.minutes === 0 && !j.enCours;
                    return (
                      <td
                        key={j.date}
                        className="tabnum text-center whitespace-nowrap"
                        title={alerte.map((a) => libelleAnomalie(a.type)).join(", ")}
                        style={
                          alerte.length
                            ? { background: "var(--warn-bg)", color: "var(--warn-ink)", fontWeight: 700 }
                            : { color: vide ? "var(--faint)" : "var(--ink)" }
                        }
                      >
                        {j.minutes > 0 ? formatDuree(j.minutes) : j.enCours ? "en cours" : "—"}
                        {alerte.length > 0 && <span aria-label="anomalie"> !</span>}
                      </td>
                    );
                  })}
                  <td className="tabnum text-right font-bold whitespace-nowrap">{formatDuree(l.resultat.totalMinutes)}</td>
                  <td className="tabnum text-right whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {sup > 0 ? formatDuree(sup) : "—"}
                  </td>
                  <td>
                    <PastilleRecap etat={etatRecap(!!l.recap.valideLe, l.resultat.terminee)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {lignes.length > 0 && (
            <tfoot>
              <tr>
                <td className="text-[13px]" style={{ color: "var(--muted)" }}>
                  {lignes.length} salarié{lignes.length > 1 ? "s" : ""}
                </td>
                <td colSpan={7} />
                <td className="tabnum text-right text-sm font-extrabold whitespace-nowrap">{formatDuree(totalMinutes)}</td>
                <td className="tabnum text-right text-sm whitespace-nowrap" style={{ color: "var(--muted)" }}>
                  {formatDuree(totalSup)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[13px]" style={{ color: "var(--muted)" }}>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-[3px]" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn)" }} />
          cellule avec anomalie, marquée «&nbsp;!&nbsp;»
        </span>
        <span>Les durées sont arrondies à la minute. Heures supplémentaires calculées au-delà de la durée de référence.</span>
      </div>
    </div>
  );
}
