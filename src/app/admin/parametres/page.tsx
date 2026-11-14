import { FormulaireOrganisation, FormulairePlanning } from "@/components/Formulaires";
import { EnTete, Section } from "@/components/ui";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { aujourdhuiDe, chargerOrganisation } from "@/lib/donnees";
import { emailConfigure } from "@/lib/notifications/email";
import { planningOrganisation } from "@/lib/planning";
import { plusJours } from "@/lib/temps/zone";

export const metadata = { title: "Paramètres" };

export default async function PageParametres() {
  const u = await exigerAdmin();
  const org = await lire(u, (tx) => chargerOrganisation(tx, u.organisationId));
  const aujourdhui = aujourdhuiDe(org);
  const debutMois = `${aujourdhui.slice(0, 7)}-01`;
  const finMoisDernier = plusJours(debutMois, -1);
  const debutMoisDernier = `${finMoisDernier.slice(0, 7)}-01`;

  return (
    <>
      <EnTete kicker="Entreprise" titre="Paramètres" />
      <div className="flex flex-col gap-6">
        <Section titre="Planning de l'entreprise" aide="Heures prévues chaque jour pour un salarié à temps plein. Il s'applique à tous les salariés qui n'ont pas de planning propre, et fixe la durée à laquelle leurs heures sont comparées.">
          <FormulairePlanning salarieId={null} planning={planningOrganisation(org)} />
        </Section>
        <Section titre="Entreprise et notifications">
          <FormulaireOrganisation initial={{ raisonSociale: org.raisonSociale, siret: org.siret ?? "", seuilEcartMinutes: org.seuilEcartMinutes, notificationsEmail: org.notificationsEmail }} />
          {!emailConfigure() && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--muted)" }}>
              L'envoi par e-mail n'est pas configuré sur ce service : les notifications sont consultables dans les espaces administrateur et salarié.
            </p>
          )}
        </Section>
        <Section titre="Export des heures" aide="Un fichier CSV (ouvrable dans un tableur) : une ligne par salarié et par jour — heures prévues, pointées, absences par nature et écart. Utile pour préparer la paie.">
          <form action="/api/admin/export" method="get" className="flex flex-wrap items-end gap-3">
            <label>
              <span className="label">Du</span>
              <input type="date" name="du" className="input" defaultValue={debutMoisDernier} required />
            </label>
            <label>
              <span className="label">Au</span>
              <input type="date" name="au" className="input" defaultValue={finMoisDernier} required />
            </label>
            <button type="submit" className="btn-primary btn-sm">
              Télécharger
            </button>
          </form>
        </Section>
      </div>
    </>
  );
}
