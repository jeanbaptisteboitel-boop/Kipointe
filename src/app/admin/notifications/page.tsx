import { ListeNotifications } from "@/components/ListeNotifications";
import { EnTete, Section } from "@/components/ui";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/donnees";
import { listerNotifications } from "@/lib/notifications/service";

export const metadata = { title: "Notifications" };

export default async function PageNotifications() {
  const u = await exigerAdmin();
  const { org, notifications } = await lire(u, async (tx) => ({ org: await chargerOrganisation(tx, u.organisationId), notifications: await listerNotifications(tx, u.organisationId, null, 100) }));
  return (
    <>
      <EnTete kicker="Suivi" titre="Notifications" />
      <Section titre="Alertes de l'entreprise" aide="Heures non effectuées ou supplémentaires, absences sans justification, oublis de badge, demandes des salariés, état de la pointeuse. Le point est fait chaque nuit.">
        <ListeNotifications notifications={notifications} pourAdmins fuseau={org.timezone} />
      </Section>
    </>
  );
}
