import Link from "next/link";
import { PastilleRecap, type EtatRecap } from "@/components/ui";
import { exigerGerant } from "@/lib/auth/session";
import { formatDuree, formatSemaine } from "@/lib/temps/journee";
import { chargerSemaineOrganisation, semaineDemandee } from "@/lib/ui/data";
import { SelecteurSemaine } from "../SelecteurSemaine";
import { ActionsRecap } from "./ActionsRecap";

export const metadata = { title: "Récapitulatifs hebdomadaires" };

export default async function PageRecaps({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerGerant();
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const lignes = await chargerSemaineOrganisation(u, annee, semaine);

  const etat = (valide: boolean, terminee: boolean): EtatRecap => (valide ? "valide" : terminee ? "a-valider" : "en-cours");
  const nb = { valide: 0, "a-valider": 0, "en-cours": 0 };
  for (const l of lignes) nb[etat(!!l.recap.valideLe, l.resultat.terminee)]++;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="titre text-[28px]">
            Récapitulatifs — semaine {semaine} · {annee}
          </h1>
          <p className="mt-2 text-[13px]" style={{ color: "var(--muted)" }}>
            {nb.valide} validé{nb.valide > 1 ? "s" : ""} · {nb["a-valider"]} à valider · {nb["en-cours"]} en cours — article D.3171-8 du Code du travail
          </p>
        </div>
        <SelecteurSemaine annee={annee} semaine={semaine} base="/gerant/recaps" />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" }}>
        {lignes.map((l) => {
          const sup = l.resultat.heuresSup.reduce((s, h) => s + h.minutes, 0);
          return (
            <div key={l.salarie.id} className="card flex flex-col gap-3.5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/gerant/salaries/${l.salarie.id}?semaine=${formatSemaine(annee, semaine)}`} className="text-base font-bold" style={{ color: "var(--ink)" }}>
                    {l.salarie.nom} {l.salarie.prenom}
                  </Link>
                  {l.salarie.matricule && (
                    <div className="mono mt-0.5 text-[11px]" style={{ color: "var(--faint)" }}>
                      {l.salarie.matricule}
                    </div>
                  )}
                </div>
                <PastilleRecap etat={etat(!!l.recap.valideLe, l.resultat.terminee)} />
              </div>

              <div className="flex items-baseline gap-5">
                <div>
                  <div className="titre tabnum text-[28px]">{formatDuree(l.resultat.totalMinutes)}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    total travaillé
                  </div>
                </div>
                <div>
                  <div className="tabnum text-base font-bold" style={{ color: "var(--muted)" }}>
                    {sup > 0 ? formatDuree(sup) : "—"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    h. sup.
                  </div>
                </div>
              </div>

              <ActionsRecap
                recapId={l.recap.id}
                valide={!!l.recap.valideLe}
                terminee={l.resultat.terminee}
                nbOublis={l.resultat.anomalies.filter((a) => a.type === "OUBLI_SORTIE").length}
              />
            </div>
          );
        })}
        {lignes.length === 0 && <p style={{ color: "var(--muted)" }}>Aucun salarié actif.</p>}
      </div>
    </div>
  );
}
