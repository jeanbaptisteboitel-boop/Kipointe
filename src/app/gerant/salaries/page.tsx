import Link from "next/link";
import { PastilleVerrouille } from "@/components/ui";
import { exigerGerant } from "@/lib/auth/session";
import { formatDuree } from "@/lib/temps/journee";
import { chargerOrganisation, listerSalaries } from "@/lib/ui/data";
import { NouveauSalarie } from "./NouveauSalarie";

export const metadata = { title: "Salariés" };

export default async function PageSalaries({ searchParams }: { searchParams: Promise<{ tous?: string }> }) {
  const u = await exigerGerant();
  const { tous } = await searchParams;
  const voirTous = tous === "1";
  const [salaries, { etablissements }] = await Promise.all([listerSalaries(u, voirTous), chargerOrganisation(u)]);
  const maintenant = new Date();

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titre text-[28px]">Salariés</h1>
        <Link href={voirTous ? "/gerant/salaries" : "/gerant/salaries?tous=1"} className="text-[13px] font-semibold underline" style={{ color: "var(--muted)" }}>
          {voirTous ? "Masquer les salariés sortis" : "Afficher aussi les salariés sortis"}
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="card-plat min-w-0 flex-1 basis-[520px] overflow-x-auto">
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Salarié</th>
                <th>Matricule</th>
                <th>Contrat</th>
                <th>Badge</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {salaries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center" style={{ color: "var(--muted)" }}>
                    Aucun salarié. Créez le premier avec le formulaire ci-contre.
                  </td>
                </tr>
              )}
              {salaries.map((s) => {
                const verrouille = !!s.pinVerrouilleJusqua && s.pinVerrouilleJusqua > maintenant;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/gerant/salaries/${s.id}`} className="text-sm font-bold" style={{ color: "var(--navy)" }}>
                        {s.nom} {s.prenom}
                      </Link>
                    </td>
                    <td className="mono text-xs" style={{ color: "var(--muted)" }}>
                      {s.matricule ?? "—"}
                    </td>
                    <td className="tabnum">{formatDuree(s.contratHeuresHebdo)}</td>
                    <td className="mono text-xs" style={{ color: "var(--muted)" }}>
                      {s.badgeUuid.slice(0, 8).toUpperCase()}
                    </td>
                    <td>
                      {!s.actif ? (
                        <span className="pastille pastille-attente">sorti</span>
                      ) : verrouille ? (
                        <PastilleVerrouille />
                      ) : (
                        <span className="pastille pastille-ok">actif</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link href={`/gerant/salaries/${s.id}/badge`} className="btn-secondary btn-sm">
                        Imprimer le badge
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <NouveauSalarie etablissements={etablissements.map((e) => ({ id: e.id, libelle: e.libelle }))} />
      </div>
    </div>
  );
}
