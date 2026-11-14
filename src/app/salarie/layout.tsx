import { Coquille } from "@/components/Coquille";
import { lire } from "@/lib/acces";
import { exigerSalarie } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/donnees";
import { compterNonLues } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";
// La vérification d'un justificatif (action serveur) peut convertir une photo HEIC : quelques secondes.
export const maxDuration = 60;

export default async function LayoutSalarie({ children }: { children: React.ReactNode }) {
  const u = await exigerSalarie();
  const { org, nonLues } = await lire(u, async (tx) => ({ org: await chargerOrganisation(tx, u.organisationId), nonLues: await compterNonLues(tx, u.organisationId, u.salarieId) }));
  return (
    <Coquille
      entreprise={org.raisonSociale}
      email={u.email}
      racine="/salarie"
      libelle="Espace salarié"
      lienAutreEspace={u.role === "ADMIN" ? { href: "/admin", texte: "Espace administrateur" } : undefined}
      onglets={[
        ["/salarie", "Accueil"],
        ["/salarie/heures", "Mes heures"],
        ["/salarie/conges", "Congés et absences"],
        ["/salarie/notifications", nonLues ? `Notifications (${nonLues})` : "Notifications"],
      ]}
    >
      {children}
    </Coquille>
  );
}
