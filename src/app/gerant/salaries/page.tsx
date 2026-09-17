import Link from "next/link";
import { exigerGerant } from "@/lib/auth/session";
import { formatDuree } from "@/lib/temps/journee";
import { chargerOrganisation, listerSalaries } from "@/lib/ui/data";
import { NouveauSalarie } from "./NouveauSalarie";

export const metadata = { title: "Salariés" };

export default async function PageSalaries({ searchParams }: { searchParams: Promise<{ tous?: string }> }) {
  const u = await exigerGerant();
  const { tous } = await searchParams;
  const [salaries, { etablissements }] = await Promise.all([listerSalaries(u, tous === "1"), chargerOrganisation(u)]);
  const maintenant = new Date();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Salariés</h1>
        <Link href={tous === "1" ? "/gerant/salaries" : "/gerant/salaries?tous=1"} className="text-sm underline">
          {tous === "1" ? "Masquer les salariés sortis" : "Afficher aussi les salariés sortis"}
        </Link>
      </div>
      <NouveauSalarie etablissements={etablissements.map((e) => ({ id: e.id, libelle: e.libelle }))} />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Matricule</th>
              <th>Contrat</th>
              <th>Badge</th>
              <th>État</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {salaries.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/gerant/salaries/${s.id}`} className="font-medium text-[var(--navy)] underline">
                    {s.nom} {s.prenom}
                  </Link>
                </td>
                <td>{s.matricule ?? "—"}</td>
                <td>{formatDuree(s.contratHeuresHebdo)} / sem.</td>
                <td className="font-mono text-xs">{s.badgeUuid.slice(0, 8)}…</td>
                <td>
                  {!s.actif ? (
                    <span className="badge bg-slate-200 text-slate-700">sorti</span>
                  ) : s.pinVerrouilleJusqua && s.pinVerrouilleJusqua > maintenant ? (
                    <span className="badge bg-red-100 text-red-800">badge verrouillé</span>
                  ) : (
                    <span className="badge bg-emerald-100 text-emerald-800">actif</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/gerant/salaries/${s.id}/badge`} className="btn-secondary btn-sm">
                    Imprimer le badge
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
