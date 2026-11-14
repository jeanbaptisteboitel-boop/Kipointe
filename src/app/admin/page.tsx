import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ListeConges } from "@/components/Conges";
import { ListeNotifications } from "@/components/ListeNotifications";
import { Chiffre, Ecart, EnTete, PastilleSemaine, Section, Vide } from "@/components/ui";
import { congeAbsence, pointeuse } from "@/db/schema";
import { lire } from "@/lib/acces";
import { exigerAdmin } from "@/lib/auth/session";
import { aujourdhuiDe, chargerOrganisation, chargerSuiviEquipe, nomComplet } from "@/lib/donnees";
import { SILENCE_MAX_MS } from "@/lib/notifications/quotidien";
import { listerNotifications } from "@/lib/notifications/service";
import { formatEcart, formatMinutes } from "@/lib/pointage/paires";
import { dureeHebdo, formatHeures } from "@/lib/planning";
import { frDate, frDateHeure, frJourLong, lundiDe, plusJours, semaineIso } from "@/lib/temps/zone";

export const metadata = { title: "Tableau de bord" };

export default async function TableauDeBord() {
  const u = await exigerAdmin();
  const d = await lire(u, async (tx) => {
    const org = await chargerOrganisation(tx, u.organisationId);
    const aujourdhui = aujourdhuiDe(org);
    const equipe = await chargerSuiviEquipe(tx, org, aujourdhui, { nbSemaines: 2 });
    const ids = equipe.map((s) => s.fiche.id);
    const attente = ids.length
      ? await tx
          .select()
          .from(congeAbsence)
          .where(and(eq(congeAbsence.statut, "EN_ATTENTE"), inArray(congeAbsence.salarieId, ids)))
          .orderBy(asc(congeAbsence.dateDebut))
      : [];
    const appareils = await tx.select().from(pointeuse).where(eq(pointeuse.actif, true));
    const notifications = (await listerNotifications(tx, u.organisationId, null, 30)).filter((n) => !n.luLe).slice(0, 6);
    return { org, aujourdhui, equipe, attente, appareils, notifications };
  });

  const lundi = lundiDe(d.aujourdhui);
  const lundiDernier = plusJours(lundi, -7);
  const noms = new Map(d.equipe.map((s) => [s.fiche.id, nomComplet(s.fiche)]));
  const dernierContact = d.appareils.map((a) => a.derniereConnexion).filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0];
  const silencieuse = d.appareils.some((a) => !a.derniereConnexion || Date.now() - a.derniereConnexion.getTime() > SILENCE_MAX_MS);
  const aValider = d.equipe.filter((s) => s.semaines.find((x) => x.semaineDebut === lundiDernier)?.statut === "MODIF_DEMANDEE").length;

  return (
    <>
      <EnTete kicker={`Semaine ${semaineIso(d.aujourdhui).semaine} · ${frJourLong(d.aujourdhui)}`} titre="Tableau de bord" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Chiffre libelle="Salariés suivis" valeur={d.equipe.length} />
        <Chiffre libelle="Demandes à traiter" valeur={d.attente.length} detail={aValider ? `et ${aValider} modification(s) de pointage demandée(s)` : "congés et absences en attente"} />
        <Chiffre libelle="Alertes non lues" valeur={d.notifications.length >= 6 ? "6+" : d.notifications.length} detail={<Link href="/admin/notifications" className="underline">toutes les notifications</Link>} />
        <Chiffre
          libelle="Pointeuse"
          valeur={
            d.appareils.length === 0 ? (
              <span className="text-[17px]">à installer</span>
            ) : silencieuse ? (
              <span className="text-[17px]" style={{ color: "var(--danger-ink)" }}>
                silencieuse
              </span>
            ) : (
              <span className="text-[17px]" style={{ color: "var(--success-ink)" }}>
                connectée
              </span>
            )
          }
          detail={d.appareils.length === 0 ? <Link href="/admin/pointeuses" className="underline">enregistrer l'appareil</Link> : `dernier contact : ${frDateHeure(dernierContact, d.org.timezone)}`}
        />
      </div>

      <div className="flex flex-col gap-6">
        <Section titre="Heures de l'équipe" aide={`Écart au contrat : heures non effectuées (−) ou effectuées en plus (+). Semaine écoulée du ${frDate(lundiDernier)} au ${frDate(plusJours(lundiDernier, 6))}.`}>
          {d.equipe.length === 0 ? (
            <Vide>
              Aucun salarié pour l'instant. <Link href="/admin/salaries" className="underline">Créez les fiches</Link>, avec leur numéro dans la pointeuse.
            </Vide>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Salarié</th>
                    <th className="text-right">Contrat</th>
                    <th className="text-right">Semaine écoulée</th>
                    <th className="text-right">Écart</th>
                    <th className="text-left">Validation</th>
                    <th className="text-right">Semaine en cours</th>
                    <th className="text-right">Compteur</th>
                  </tr>
                </thead>
                <tbody>
                  {d.equipe.map((s) => {
                    const ecoulee = s.semainesAffichees.find((x) => x.lundi === lundiDernier);
                    const enCours = s.semainesAffichees.find((x) => x.lundi === lundi);
                    const ligne = s.semaines.find((x) => x.semaineDebut === lundiDernier);
                    const pointeEnCours = s.semaines.find((x) => x.semaineDebut === lundi)?.totalMinutes ?? 0;
                    return (
                      <tr key={s.fiche.id}>
                        <td>
                          <Link href={`/admin/salaries/${s.fiche.id}`} className="font-bold underline" style={{ color: "var(--navy)" }}>
                            {nomComplet(s.fiche)}
                          </Link>
                          {!s.fiche.pointeuseRef && (
                            <div className="text-[11px]" style={{ color: "var(--warn-ink)" }}>
                              sans numéro de pointeuse
                            </div>
                          )}
                        </td>
                        <td className="tabnum text-right">{formatHeures(dureeHebdo(s.planning))}</td>
                        <td className="tabnum text-right">{ecoulee ? formatMinutes(ecoulee.realiseMinutes) : "—"}</td>
                        <td className="text-right">{ecoulee && !ecoulee.horsCompteur && ecoulee.prevuMinutes + ecoulee.realiseMinutes > 0 ? <Ecart minutes={ecoulee.ecartMinutes} /> : "—"}</td>
                        <td>{ligne ? <PastilleSemaine statut={ligne.statut} /> : <span style={{ color: "var(--faint)" }}>aucun pointage</span>}</td>
                        <td className="tabnum text-right">
                          {formatMinutes(pointeEnCours)}
                          {enCours && enCours.prevuMinutes > 0 && (
                            <span className="ml-1.5">
                              <Ecart minutes={enCours.ecartMinutes} provisoire />
                            </span>
                          )}
                        </td>
                        <td className="tabnum text-right font-bold" title={s.compteur.soldeAu ? `Solde au ${frDate(s.compteur.soldeAu)}` : "Aucune semaine terminée"}>
                          {formatEcart(s.compteur.soldeMinutes)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[12px]" style={{ color: "var(--muted)" }}>
                * Écart provisoire de la semaine en cours, arrêté au dernier jour renseigné. Le compteur cumule les écarts des semaines terminées.
              </p>
            </div>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section titre="Demandes en attente" actions={<Link href="/admin/conges" className="btn-secondary btn-sm">Congés et absences</Link>}>
            <ListeConges conges={d.attente.map((c) => ({ ...c, nomSalarie: noms.get(c.salarieId) }))} mode="admin" vide="Aucune demande en attente." />
          </Section>
          <Section titre="Alertes récentes" actions={<Link href="/admin/notifications" className="btn-secondary btn-sm">Tout voir</Link>}>
            <ListeNotifications notifications={d.notifications} pourAdmins fuseau={d.org.timezone} compact />
          </Section>
        </div>
      </div>
    </>
  );
}
