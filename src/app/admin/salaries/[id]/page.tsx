import { and, asc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormulaireConge, ListeConges } from "@/components/Conges";
import { BoutonAcces, FormulaireCompteur, FormulairePlanning, FormulaireSalarie, FormulaireSoldeConges } from "@/components/Formulaires";
import { HeuresGraphique } from "@/components/HeuresGraphique";
import { supprimerRendezVous } from "@/app/actions/rendezvous";
import { BoutonAction } from "@/components/client";
import { FormulaireRendezVous } from "@/components/RendezVous";
import { PointagesSemaines } from "@/components/PointagesSemaines";
import { TableauSemaines } from "@/components/TableauSemaines";
import { Chiffre, Ecart, EnTete, Section } from "@/components/ui";
import { rendezVous, salarie, utilisateur } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { formatJours } from "@/lib/conges/types";
import { aujourdhuiDe, chargerOrganisation, chargerSuiviSalarie, nomComplet, soldeCongesPayes } from "@/lib/donnees";
import { journaliserAcces } from "@/lib/journal";
import { formatEcart } from "@/lib/pointage/paires";
import { dureeHebdo, formatHeures, planningOrganisation, resumePlanning } from "@/lib/planning";
import { frDate, frJourLong, lundisJusqua } from "@/lib/temps/zone";

export const metadata = { title: "Fiche salarié" };

export default async function FicheSalarie({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await exigerAdmin();
  const d = await lire(u, async (tx) => {
    const org = await chargerOrganisation(tx, u.organisationId);
    const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, id));
    if (!fiche) return null;
    const aujourdhui = aujourdhuiDe(org);
    const suivi = await chargerSuiviSalarie(tx, org, fiche, aujourdhui, 12);
    const [compte] = await tx.select({ id: utilisateur.id, actif: utilisateur.actif }).from(utilisateur).where(eq(utilisateur.salarieId, id));
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: id, action: "FICHE_CONSULTEE" });
    const rdv = await tx.select().from(rendezVous).where(and(eq(rendezVous.salarieId, id), gte(rendezVous.jour, aujourdhui))).orderBy(asc(rendezVous.jour), asc(rendezVous.heure));
    return { org, aujourdhui, suivi, compte, rdv };
  });
  if (!d) notFound();
  const { suivi } = d;
  const f = suivi.fiche;
  const cp = soldeCongesPayes(f, suivi.conges);
  const premierAffiche = lundisJusqua(d.aujourdhui, 12)[0]!;
  const semaines = suivi.semaines.filter((s) => s.semaineDebut >= premierAffiche);

  return (
    <>
      <EnTete kicker={f.matricule ? `Matricule ${f.matricule}` : "Salarié"} titre={nomComplet(f)}>
        <Link href="/admin/salaries" className="btn-secondary btn-sm">
          Tous les salariés
        </Link>
      </EnTete>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre libelle="Contrat" valeur={formatHeures(dureeHebdo(suivi.planning))} detail={`par semaine · planning ${suivi.sourcePlanning === "salarie" ? "propre" : "de l'entreprise"}`} />
        <Chiffre
          libelle="Compteur d'heures"
          valeur={<span style={{ color: suivi.compteur.soldeMinutes < 0 ? "var(--danger-ink)" : undefined }}>{formatEcart(suivi.compteur.soldeMinutes)}</span>}
          detail={suivi.compteur.soldeAu ? `au ${frDate(suivi.compteur.soldeAu)} · depuis le ${frDate(suivi.compteur.depart)}` : `depuis le ${frDate(suivi.compteur.depart)}`}
        />
        <Chiffre libelle="Semaine en cours" valeur={suivi.compteur.enCours ? <Ecart minutes={suivi.compteur.enCours.ecartMinutes} provisoire /> : "—"} detail="écart provisoire" />
        <Chiffre libelle="Congés payés" valeur={cp ? formatJours(cp.solde) : "—"} detail={cp ? `${formatJours(cp.pris)} pris${cp.enAttente ? ` · ${formatJours(cp.enAttente)} en attente` : ""}` : "solde non suivi"} />
      </div>

      <div className="flex flex-col gap-6">
        <Section titre="Heures par semaine" aide="Les douze dernières semaines, comparées à la durée prévue au contrat.">
          <HeuresGraphique semaines={suivi.semainesAffichees} />
          <div className="mt-5">
            <TableauSemaines semaines={suivi.semainesAffichees} />
          </div>
        </Section>

        <Section titre="Pointages" aide="Badgeages reçus de la pointeuse. Corrigez un oubli ou ajoutez une journée : le salarié est prévenu et revalide sa semaine.">
          <PointagesSemaines semaines={semaines} mode="admin" salarieId={f.id} aujourdhui={d.aujourdhui} />
        </Section>

        <Section titre="Rendez-vous à rappeler" aide="Médecine du travail, entretien avec la direction… Le salarié en est averti à chaque pointage sur la tablette, à partir de trente jours avant, et dans son espace.">
          {d.rdv.length > 0 && (
            <ul className="mb-5 flex flex-col gap-2">
              {d.rdv.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3" style={{ background: "var(--bg-portal)" }}>
                  <span>
                    <span className="font-bold">{r.intitule}</span> — <span className="tabnum">{frJourLong(r.jour)}{r.heure ? ` à ${r.heure}` : ""}</span>
                    {r.precision && <span className="block text-[13px]" style={{ color: "var(--muted)" }}>{r.precision}</span>}
                  </span>
                  <BoutonAction action={supprimerRendezVous.bind(null, r.id)} confirmer="Supprimer ce rendez-vous ?">
                    Supprimer
                  </BoutonAction>
                </li>
              ))}
            </ul>
          )}
          <FormulaireRendezVous salarieId={f.id} aujourdhui={d.aujourdhui} />
        </Section>

        <Section titre="Congés et absences" actions={<FormulaireConge mode="admin" salarieId={f.id} />}>
          <ListeConges conges={suivi.conges} mode="admin" vide="Aucune absence enregistrée." />
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section titre="Planning de travail" aide={suivi.sourcePlanning === "salarie" ? "Planning propre à ce salarié." : `Ce salarié suit le planning de l'entreprise (${resumePlanning(planningOrganisation(d.org))}). Modifiez-le ici pour un temps partiel ou des horaires particuliers.`}>
            <FormulairePlanning salarieId={f.id} planning={suivi.planning} propre={suivi.sourcePlanning === "salarie"} planningEntreprise={planningOrganisation(d.org)} />
          </Section>
          <div className="flex flex-col gap-6">
            <Section titre="Réglage du compteur d'heures">
              <FormulaireCompteur salarieId={f.id} depart={f.compteurDepart} soldeMinutes={f.compteurSoldeDepartMinutes} departApplique={suivi.compteur.depart} />
            </Section>
            <Section titre="Solde de congés payés">
              <FormulaireSoldeConges salarieId={f.id} solde={f.cpSoldeJours} au={f.cpSoldeAu} />
            </Section>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section titre="Fiche">
            <FormulaireSalarie
              id={f.id}
              initial={{ nom: f.nom, prenom: f.prenom, matricule: f.matricule ?? "", email: f.email ?? "", telephone: f.telephone ?? "", pointeuseRef: f.pointeuseRef ?? "", dateEntree: f.dateEntree ?? "", dateSortie: f.dateSortie ?? "", actif: f.actif }}
            />
          </Section>
          <Section titre="Espace salarié" aide={d.compte?.actif ? "Ce salarié a accès à son espace : heures, congés, compteur, notifications." : "Ouvrez l'accès pour que le salarié consulte ses heures, valide ses semaines et demande ses congés."}>
            <BoutonAcces salarieId={f.id} existe={!!d.compte} />
          </Section>
        </div>
      </div>
    </>
  );
}
