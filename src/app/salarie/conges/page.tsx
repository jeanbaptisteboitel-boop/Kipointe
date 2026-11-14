import { FormulaireConge, ListeConges } from "@/components/Conges";
import { EnTete, Section } from "@/components/ui";
import { formatJours } from "@/lib/conges/types";
import { soldeCongesPayes } from "@/lib/donnees";
import { chargerEspaceSalarie } from "@/lib/espace-salarie";
import { frDate } from "@/lib/temps/zone";

export const metadata = { title: "Congés et absences" };

export default async function MesConges() {
  const { suivi } = await chargerEspaceSalarie();
  const cp = soldeCongesPayes(suivi.fiche, suivi.conges);
  return (
    <>
      <EnTete kicker={cp ? `Congés payés restants : ${formatJours(cp.solde)}` : "Demandes et déclarations"} titre="Congés et absences" />
      <div className="flex flex-col gap-6">
        <Section
          titre="Demander un congé, signaler une absence"
          aide="Congé payé, absence autorisée, formation : votre demande est transmise à votre employeur. Maladie, événement familial : déclarez-les ici dès que possible."
        >
          <FormulaireConge mode="salarie" salarieId={suivi.fiche.id} />
          {cp && suivi.fiche.cpSoldeAu && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--muted)" }}>
              Solde indicatif : {formatJours(suivi.fiche.cpSoldeJours)} au {frDate(suivi.fiche.cpSoldeAu)}, moins {formatJours(cp.pris)} accepté(s) depuis. Le solde de votre bulletin de paie fait foi.
            </p>
          )}
        </Section>
        <Section titre="Mes demandes">
          <ListeConges conges={suivi.conges} mode="salarie" vide="Aucune demande pour l'instant." />
        </Section>
      </div>
    </>
  );
}
