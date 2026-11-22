import { asc, eq, sql } from "drizzle-orm";
import { basculerClient, basculerOptionSms } from "@/app/actions/compte";
import { BoutonAction } from "@/components/client";
import { Coquille } from "@/components/Coquille";
import { FormulaireClient } from "@/components/Formulaires";
import { EnTete, Section, Vide } from "@/components/ui";
import { getDb } from "@/db";
import { organisation, pointeuse, salarie, smsPointage, tablette } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { exigerPlateforme } from "@/lib/auth/session";
import { frDate, frDateHeure, jourLocal } from "@/lib/temps/zone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients" };

export default async function PagePlateforme() {
  const u = await exigerPlateforme();
  const { clients, editeur } = await withBypass(getDb(), async (tx) => {
    const clients = await tx
      .select({
        id: organisation.id,
        raisonSociale: organisation.raisonSociale,
        siret: organisation.siret,
        actif: organisation.actif,
        createdAt: organisation.createdAt,
        salaries: sql<number>`(select count(*)::int from ${salarie} where ${salarie.organisationId} = ${organisation.id} and ${salarie.actif})`,
        pointeuses: sql<number>`(select count(*)::int from ${pointeuse} where ${pointeuse.organisationId} = ${organisation.id})`,
        optionSms: organisation.optionSms,
        tablettes: sql<number>`(select count(*)::int from ${tablette} where ${tablette.organisationId} = ${organisation.id})`,
        smsMois: sql<number>`(select count(*)::int from ${smsPointage} where ${smsPointage.organisationId} = ${organisation.id} and ${smsPointage.createdAt} >= date_trunc('month', now()))`,
        smsMoisDernier: sql<number>`(select count(*)::int from ${smsPointage} where ${smsPointage.organisationId} = ${organisation.id} and ${smsPointage.createdAt} >= date_trunc('month', now()) - interval '1 month' and ${smsPointage.createdAt} < date_trunc('month', now()))`,
        dernierContact: sql<string | null>`(select max(${pointeuse.derniereConnexion}) from ${pointeuse} where ${pointeuse.organisationId} = ${organisation.id})`,
      })
      .from(organisation)
      .where(eq(organisation.plateforme, false))
      .orderBy(asc(organisation.raisonSociale));
    const [editeur] = await tx.select().from(organisation).where(eq(organisation.id, u.organisationId));
    return { clients, editeur: editeur! };
  });

  return (
    <Coquille entreprise={editeur.raisonSociale} email={u.email} racine="/plateforme" libelle="Espace éditeur" onglets={[["/plateforme", "Clients"]]}>
      <EnTete kicker={`${clients.filter((c) => c.actif).length} client(s) actif(s)`} titre="Clients" />
      <div className="flex flex-col gap-6">
        <Section titre="Entreprises clientes" aide="Chaque client ne voit que ses propres données. Un client suspendu ne peut plus se connecter et sa pointeuse garde ses badgeages jusqu'au rétablissement.">
          {clients.length === 0 ? (
            <Vide>Aucun client pour l'instant.</Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Client</th>
                    <th className="text-left">Depuis le</th>
                    <th className="text-right">Salariés</th>
                    <th className="text-right">Pointeuses</th>
                    <th className="text-right">Tablettes</th>
                    <th className="text-left">SMS (ce mois · mois dernier)</th>
                    <th className="text-left">Dernier contact pointeuse</th>
                    <th className="text-left">État</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="font-bold">{c.raisonSociale}</div>
                        {c.siret && (
                          <div className="mono text-[12px]" style={{ color: "var(--muted)" }}>
                            {c.siret}
                          </div>
                        )}
                      </td>
                      <td className="tabnum">{frDate(jourLocal(c.createdAt))}</td>
                      <td className="tabnum text-right">{c.salaries}</td>
                      <td className="tabnum text-right">{c.pointeuses}</td>
                      <td className="tabnum text-right">{c.tablettes}</td>
                      <td>
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {c.optionSms ? <span className="tabnum font-bold">{c.smsMois} · {c.smsMoisDernier}</span> : <span style={{ color: "var(--faint)" }}>option fermée</span>}
                          <BoutonAction action={basculerOptionSms.bind(null, c.id, !c.optionSms)} confirmer={c.optionSms ? `Fermer l'option SMS de ${c.raisonSociale} ? Le pointage par SMS s'arrête aussitôt.` : undefined}>
                            {c.optionSms ? "Fermer" : "Ouvrir"}
                          </BoutonAction>
                        </span>
                      </td>
                      <td className="tabnum">{frDateHeure(c.dernierContact ? new Date(c.dernierContact) : null)}</td>
                      <td>{c.actif ? <span className="pastille pastille-ok">actif</span> : <span className="pastille pastille-danger">suspendu</span>}</td>
                      <td className="text-right">
                        <BoutonAction action={basculerClient.bind(null, c.id, !c.actif)} confirmer={c.actif ? `Suspendre ${c.raisonSociale} ? Ses utilisateurs ne pourront plus se connecter.` : undefined}>
                          {c.actif ? "Suspendre" : "Rétablir"}
                        </BoutonAction>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section titre="Nouveau client" aide="Crée l'entreprise et le compte de son administrateur, qui installe ensuite sa pointeuse et crée ses salariés.">
          <FormulaireClient />
        </Section>
      </div>
    </Coquille>
  );
}
