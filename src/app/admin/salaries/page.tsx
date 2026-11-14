import Link from "next/link";
import { FormulaireSalarie } from "@/components/Formulaires";
import { EnTete, Section, Vide } from "@/components/ui";
import { utilisateur } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { aujourdhuiDe, chargerOrganisation, chargerSuiviEquipe, nomComplet } from "@/lib/donnees";
import { formatEcart } from "@/lib/pointage/paires";
import { dureeHebdo, formatHeures } from "@/lib/planning";
import { frDate } from "@/lib/temps/zone";

export const metadata = { title: "Salariés" };

export default async function PageSalaries() {
  const u = await exigerAdmin();
  const { equipe, comptes } = await lire(u, async (tx) => {
    const org = await chargerOrganisation(tx, u.organisationId);
    const equipe = await chargerSuiviEquipe(tx, org, aujourdhuiDe(org), { nbSemaines: 1, tous: true });
    const comptes = await tx.select({ salarieId: utilisateur.salarieId, actif: utilisateur.actif }).from(utilisateur);
    return { equipe, comptes };
  });
  const avecAcces = new Set(comptes.filter((c) => c.actif && c.salarieId).map((c) => c.salarieId));

  return (
    <>
      <EnTete kicker="Équipe" titre="Salariés" />
      <div className="flex flex-col gap-6">
        <Section titre="Fiches">
          {equipe.length === 0 ? (
            <Vide>Aucun salarié. Créez la première fiche ci-dessous.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Salarié</th>
                    <th className="text-left">N° pointeuse</th>
                    <th className="text-right">Contrat</th>
                    <th className="text-left">Planning</th>
                    <th className="text-right">Compteur</th>
                    <th className="text-left">Espace salarié</th>
                  </tr>
                </thead>
                <tbody>
                  {equipe.map((s) => (
                    <tr key={s.fiche.id} style={s.fiche.actif ? undefined : { opacity: 0.55 }}>
                      <td>
                        <Link href={`/admin/salaries/${s.fiche.id}`} className="font-bold underline" style={{ color: "var(--navy)" }}>
                          {nomComplet(s.fiche)}
                        </Link>
                        <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                          {!s.fiche.actif ? "fiche inactive" : s.fiche.dateSortie ? `sortie le ${frDate(s.fiche.dateSortie)}` : s.fiche.dateEntree ? `depuis le ${frDate(s.fiche.dateEntree)}` : ""}
                        </div>
                      </td>
                      <td className="mono">{s.fiche.pointeuseRef ?? <span style={{ color: "var(--warn-ink)" }}>à renseigner</span>}</td>
                      <td className="tabnum text-right">{formatHeures(dureeHebdo(s.planning))}</td>
                      <td>{s.sourcePlanning === "salarie" ? "propre au salarié" : "de l'entreprise"}</td>
                      <td className="tabnum text-right font-bold">{formatEcart(s.compteur.soldeMinutes)}</td>
                      <td>{avecAcces.has(s.fiche.id) ? "ouvert" : <span style={{ color: "var(--faint)" }}>non ouvert</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section titre="Nouveau salarié" aide="Le numéro dans la pointeuse est celui que vous avez attribué au salarié en l'enregistrant sur l'appareil.">
          <FormulaireSalarie />
        </Section>
      </div>
    </>
  );
}
