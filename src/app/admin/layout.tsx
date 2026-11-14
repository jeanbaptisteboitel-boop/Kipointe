import { Coquille } from "@/components/Coquille";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/donnees";
import { compterNonLues } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const u = await exigerAdmin();
  const { org, nonLues } = await lire(u, async (tx) => ({ org: await chargerOrganisation(tx, u.organisationId), nonLues: await compterNonLues(tx, u.organisationId, null) }));
  return (
    <Coquille
      entreprise={org.raisonSociale}
      email={u.email}
      racine="/admin"
      libelle="Espace administrateur"
      lienAutreEspace={u.salarieId ? { href: "/salarie", texte: "Mon espace salarié" } : undefined}
      onglets={[
        ["/admin", "Tableau de bord"],
        ["/admin/salaries", "Salariés"],
        ["/admin/conges", "Congés et absences"],
        ["/admin/pointeuses", "Pointeuses"],
        ["/admin/notifications", nonLues ? `Notifications (${nonLues})` : "Notifications"],
        ["/admin/parametres", "Paramètres"],
      ]}
    >
      {children}
    </Coquille>
  );
}
