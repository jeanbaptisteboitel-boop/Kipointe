import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { formatDuree, formatSemaine } from "@/lib/temps/journee";
import { chargerSemaineOrganisation, semaineDemandee } from "@/lib/ui/data";
import { SelecteurSemaine } from "../SelecteurSemaine";
import { ValidationRecap } from "../salaries/[id]/ValidationRecap";

export const metadata = { title: "Récapitulatifs hebdomadaires" };

export default async function PageRecaps({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const u = await exigerGerant();
  const { semaine: param } = await searchParams;
  const { annee, semaine } = semaineDemandee(param);
  const lignes = await chargerSemaineOrganisation(u, annee, semaine);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Récapitulatifs hebdomadaires (D.3171-8)</h1>
      <SelecteurSemaine annee={annee} semaine={semaine} base="/gerant/recaps" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lignes.map((l) => (
          <div key={l.salarie.id} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Link href={`/gerant/salaries/${l.salarie.id}?semaine=${formatSemaine(annee, semaine)}`} className="font-semibold underline">
                {l.salarie.nom} {l.salarie.prenom}
              </Link>
              <span className="tabular-nums">{formatDuree(l.resultat.totalMinutes)}</span>
            </div>
            <ValidationRecap
              recap={{ id: l.recap.id, valideLe: l.recap.valideLe?.toISOString() ?? null, hash: l.recap.hashSha256 }}
              terminee={l.resultat.terminee}
              nbOublis={l.resultat.anomalies.filter((a) => a.type === "OUBLI_SORTIE").length}
            />
          </div>
        ))}
        {lignes.length === 0 && <p className="text-slate-500">Aucun salarié actif.</p>}
      </div>
    </div>
  );
}
