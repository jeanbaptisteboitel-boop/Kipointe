import { ListeNotifications } from "@/components/ListeNotifications";
import { EnTete, Section } from "@/components/ui";
import { chargerEspaceSalarie } from "@/lib/espace-salarie";

export const metadata = { title: "Notifications" };

export default async function MesNotifications() {
  const { org, notifications } = await chargerEspaceSalarie(1);
  return (
    <>
      <EnTete kicker="Suivi" titre="Notifications" />
      <Section titre="Mes notifications" aide="Heures non effectuées ou supplémentaires par rapport à votre contrat, absences à justifier, badgeages incomplets, réponses à vos demandes.">
        <ListeNotifications notifications={notifications} pourAdmins={false} fuseau={org.timezone} />
      </Section>
    </>
  );
}
