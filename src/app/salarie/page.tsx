import Link from "next/link";
import { HeuresGraphique } from "@/components/HeuresGraphique";
import { ListeNotifications } from "@/components/ListeNotifications";
import { Chiffre, Ecart, EnTete, Section } from "@/components/ui";
import { formatJours } from "@/lib/conges/types";
import { soldeCongesPayes } from "@/lib/donnees";
import { chargerEspaceSalarie } from "@/lib/espace-salarie";
import { formatEcart, formatMinutes } from "@/lib/pointage/paires";
import { JOURS_PLANNING, LIBELLES_JOURS, dureeHebdo, formatHeures } from "@/lib/planning";
import { frDate, frJourLong, lundiDe } from "@/lib/temps/zone";

export const metadata = { title: "Mon espace" };

export default async function AccueilSalarie() {
  const { u, org, aujourdhui, suivi, notifications } = await chargerEspaceSalarie();
  const { compteur } = suivi;
  const cp = soldeCongesPayes(suivi.fiche, suivi.conges);
  const semaineCourante = suivi.semaines.find((s) => s.semaineDebut === lundiDe(aujourdhui));
  const aValider = suivi.semaines.filter((s) => s.statut === "EN_ATTENTE" && s.semaineFin < aujourdhui && s.totalMinutes > 0);
  const nonLues = notifications.filter((n) => !n.luLe).slice(0, 5);
  const jourPointe = semaineCourante?.jours.find((j) => j.date === aujourdhui);

  return (
    <>
      <EnTete kicker={frJourLong(aujourdhui)} titre={`Bonjour ${u.prenom}`} />

      {aValider.length > 0 && (
        <div className="encart-alerte mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-semibold">
            {aValider.length === 1 ? `Votre semaine du ${frDate(aValider[0]!.semaineDebut)} attend votre validation.` : `${aValider.length} semaines attendent votre validation.`}
          </span>
          <Link href="/salarie/heures" className="btn-navy btn-sm">
            Vérifier mes heures
          </Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre libelle="Aujourd'hui" valeur={formatMinutes(jourPointe?.minutes ?? 0)} detail={jourPointe?.pointages.length ? jourPointe.pointages.map((p) => `${p.entree ?? "?"} → ${p.sortie ?? "…"}`).join(" · ") : "aucun badgeage reçu"} />
        <Chiffre
          libelle="Cette semaine"
          valeur={formatMinutes(semaineCourante?.totalMinutes ?? 0)}
          detail={
            compteur.enCours && compteur.enCours.prevuMinutes > 0 ? (
              <>
                écart provisoire <Ecart minutes={compteur.enCours.ecartMinutes} />
              </>
            ) : (
              `contrat : ${formatHeures(dureeHebdo(suivi.planning))} par semaine`
            )
          }
        />
        <Chiffre
          libelle="Compteur d'heures"
          valeur={<span style={{ color: compteur.soldeMinutes < 0 ? "var(--danger-ink)" : undefined }}>{formatEcart(compteur.soldeMinutes)}</span>}
          detail={compteur.soldeMinutes < 0 ? "heures non effectuées par rapport au contrat" : compteur.soldeMinutes > 0 ? "heures effectuées au-delà du contrat" : "conforme au contrat"}
        />
        <Chiffre libelle="Congés payés" valeur={cp ? formatJours(cp.solde) : "—"} detail={cp ? `restants${cp.enAttente ? ` · ${formatJours(cp.enAttente)} en attente` : ""}` : "solde tenu par votre employeur"} />
      </div>

      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Section titre="À savoir" actions={<Link href="/salarie/notifications" className="btn-secondary btn-sm">Toutes mes notifications</Link>}>
            <ListeNotifications notifications={nonLues} pourAdmins={false} fuseau={org.timezone} compact />
          </Section>
          <Section titre="Mon planning" aide={`${formatHeures(dureeHebdo(suivi.planning))} par semaine. C'est à cette durée que vos heures sont comparées.`}>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {JOURS_PLANNING.map((j) => (
                <div key={j} className="rounded-lg py-2.5" style={{ background: suivi.planning[j] > 0 ? "var(--info-bg)" : "var(--bg-portal)" }}>
                  <div className="kicker">{LIBELLES_JOURS[j].slice(0, 3)}.</div>
                  <div className="tabnum mt-1 text-[13px] font-bold" style={{ color: suivi.planning[j] > 0 ? "var(--ink)" : "var(--faint)" }}>
                    {suivi.planning[j] > 0 ? formatHeures(suivi.planning[j]) : "repos"}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
        <Section titre="Mes heures par semaine" aide="Les douze dernières semaines, comparées à la durée prévue à votre contrat." actions={<Link href="/salarie/heures" className="btn-secondary btn-sm">Le détail</Link>}>
          <HeuresGraphique semaines={suivi.semainesAffichees} />
        </Section>
      </div>
    </>
  );
}
