import { asc, desc, eq } from "drizzle-orm";
import { FormulaireConge, ListeConges } from "@/components/Conges";
import { Chip, EnTete, Section } from "@/components/ui";
import { congeAbsence, salarie } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { nomComplet } from "@/lib/donnees";

export const metadata = { title: "Congés et absences" };

const FILTRES = [
  ["attente", "En attente"],
  ["acceptees", "Acceptées"],
  ["refusees", "Refusées"],
  ["toutes", "Toutes"],
] as const;

export default async function PageConges({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { vue = "attente" } = await searchParams;
  const u = await exigerAdmin();
  const { conges, fiches } = await lire(u, async (tx) => ({
    conges: await tx.select().from(congeAbsence).orderBy(desc(congeAbsence.dateDebut)).limit(400),
    fiches: await tx.select().from(salarie).where(eq(salarie.actif, true)).orderBy(asc(salarie.nom), asc(salarie.prenom)),
  }));
  const noms = new Map(fiches.map((f) => [f.id, nomComplet(f)]));
  const statut = vue === "acceptees" ? "ACCEPTEE" : vue === "refusees" ? "REFUSEE" : vue === "toutes" ? null : "EN_ATTENTE";
  const affiches = conges.filter((c) => !statut || c.statut === statut).map((c) => ({ ...c, nomSalarie: noms.get(c.salarieId) ?? "Salarié inactif" }));
  const enAttente = conges.filter((c) => c.statut === "EN_ATTENTE").length;

  return (
    <>
      <EnTete kicker={`${enAttente} demande(s) en attente`} titre="Congés et absences" />
      <div className="flex flex-col gap-6">
        <Section
          titre="Saisir une absence"
          aide="Maladie, absence non autorisée, congé posé de vive voix… Une absence saisie ici est enregistrée directement et le salarié en est informé. L'absence non autorisée n'est pas comptée comme du temps réalisé : ses heures restent dues au compteur."
        >
          <FormulaireConge mode="admin" salaries={fiches.map((f) => ({ id: f.id, nom: nomComplet(f) }))} />
        </Section>
        <Section titre="Demandes et absences">
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTRES.map(([cle, libelle]) => (
              <Chip key={cle} href={`/admin/conges?vue=${cle}`} actif={vue === cle}>
                {libelle}
              </Chip>
            ))}
          </div>
          <ListeConges conges={affiches} mode="admin" vide="Rien à afficher." />
        </Section>
      </div>
    </>
  );
}
