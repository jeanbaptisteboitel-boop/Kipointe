import { PointagesSemaines } from "@/components/PointagesSemaines";
import { TableauSemaines } from "@/components/TableauSemaines";
import { EnTete, Section } from "@/components/ui";
import { chargerEspaceSalarie } from "@/lib/espace-salarie";
import { formatEcart } from "@/lib/pointage/paires";
import { frDate, lundisJusqua } from "@/lib/temps/zone";

export const metadata = { title: "Mes heures" };

export default async function MesHeures() {
  const { aujourdhui, suivi } = await chargerEspaceSalarie();
  const premier = lundisJusqua(aujourdhui, 12)[0]!;
  return (
    <>
      <EnTete kicker={`Compteur : ${formatEcart(suivi.compteur.soldeMinutes)}${suivi.compteur.soldeAu ? ` au ${frDate(suivi.compteur.soldeAu)}` : ""}`} titre="Mes heures" />
      <div className="flex flex-col gap-6">
        <Section
          titre="Mes pointages"
          aide="Vos badgeages, tels que la pointeuse les a transmis. Chaque semaine terminée, vérifiez-les puis validez ; s'il manque un badgeage ou qu'une heure est fausse, demandez une modification à votre employeur."
        >
          <PointagesSemaines semaines={suivi.semaines.filter((s) => s.semaineDebut >= premier)} mode="salarie" salarieId={suivi.fiche.id} aujourdhui={aujourdhui} />
        </Section>
        <Section
          titre="Écart au contrat, semaine par semaine"
          aide="Écart négatif : heures non effectuées par rapport à votre contrat. Écart positif : heures effectuées en plus. Les congés, arrêts maladie, formations et jours fériés comptent comme du temps réalisé."
        >
          <TableauSemaines semaines={suivi.semainesAffichees} />
        </Section>
      </div>
    </>
  );
}
