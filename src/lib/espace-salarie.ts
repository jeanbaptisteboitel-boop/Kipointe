import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { salarie } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerSalarie } from "@/lib/auth/session";
import { aujourdhuiDe, chargerOrganisation, chargerSuiviSalarie } from "@/lib/donnees";
import { listerNotifications } from "@/lib/notifications/service";

/** Tout ce que l'espace salarié affiche : la fiche du salarié connecté, et elle seule. */
export async function chargerEspaceSalarie(nbSemaines = 12) {
  const u = await exigerSalarie();
  const d = await lire(u, async (tx) => {
    const org = await chargerOrganisation(tx, u.organisationId);
    const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, u.salarieId));
    if (!fiche) return null;
    const aujourdhui = aujourdhuiDe(org);
    return { org, aujourdhui, suivi: await chargerSuiviSalarie(tx, org, fiche, aujourdhui, nbSemaines), notifications: await listerNotifications(tx, u.organisationId, fiche.id, 100) };
  });
  if (!d) redirect("/compte");
  return { u, ...d };
}
