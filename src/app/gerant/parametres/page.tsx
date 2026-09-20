import { exigerGerant } from "@/lib/auth/session";
import { chargerOrganisation } from "@/lib/ui/data";
import { Etablissements } from "./Etablissements";
import { FormulaireParametres } from "./FormulaireParametres";

export const metadata = { title: "Paramètres" };

export default async function PageParametres() {
  const u = await exigerGerant();
  const { org, etablissements } = await chargerOrganisation(u);
  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="titre text-[28px]">Paramètres</h1>
        <p className="mt-2 max-w-[74ch] text-sm" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
          Les règles de calcul varient selon la convention collective. Elles sont paramétrées ici, jamais codées en dur.
        </p>
      </div>
      <FormulaireParametres
        organisation={{
          raison_sociale: org.raisonSociale,
          siret: org.siret ?? "",
          convention_collective: org.conventionCollective ?? "",
          duree_hebdo_reference: org.dureeHebdoReference / 60,
          paliers_heures_sup: org.paliersHeuresSup,
          repos_quotidien_min: org.reposQuotidienMin,
          repos_hebdo_min: org.reposHebdoMin,
          pause_obligatoire_apres: org.pauseObligatoireApres,
          pause_duree_min: org.pauseDureeMin,
          amplitude_max: org.amplitudeMax,
          journee_debut_heure: org.journeeDebutHeure,
          anti_doublon_secondes: org.antiDoublonSecondes,
        }}
      />
      <Etablissements etablissements={etablissements.map((e) => ({ id: e.id, libelle: e.libelle, adresse: e.adresse, timezone: e.timezone }))} />
    </div>
  );
}
