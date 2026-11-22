/**
 * TÂCHE QUOTIDIENNE — fait le point de la veille et de la semaine écoulée pour chaque
 * organisation cliente, et crée les notifications correspondantes :
 *
 *   - ABSENCE_A_JUSTIFIER : hier était un jour travaillé du planning, sans badgeage, sans
 *     absence enregistrée ni jour férié → le salarié et les administrateurs sont prévenus ;
 *   - POINTAGE_INCOMPLET : une entrée sans sortie (ou l'inverse) hier → oubli de badge à corriger ;
 *   - HEURES_MANQUANTES / HEURES_SUP : la dernière semaine terminée s'écarte du contrat d'au
 *     moins le seuil de l'organisation ;
 *   - SEMAINE_A_VALIDER : la dernière semaine terminée attend la validation du salarié ;
 *   - POINTEUSE_SILENCIEUSE : un appareil actif (pointeuse ou tablette) n'a pas donné signe de vie
 *     depuis plus de 26 h ;
 *   - BADGE_NON_RATTACHE : des badgeages attendent d'être rattachés à une fiche.
 *
 * Les constats tirés de l'ABSENCE de badgeage (absence à justifier, heures manquantes) ne sont
 * faits que si la pointeuse ou la tablette communique, et pour les salariés qui s'en servent : une organisation qui importe son fichier CSV une fois
 * par semaine n'est pas inondée de fausses absences, et une panne de réseau donne une alerte
 * « pointeuse silencieuse », pas une absence par salarié.
 *
 * Idempotente : chaque notification porte une clé, la tâche peut repasser sans doublon.
 */
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { badgeage, notification, organisation, pointageTablette, pointeuse, session, tablette, type Organisation } from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { chargerSuiviEquipe, enPoste, nomComplet } from "@/lib/donnees";
import { calculerHeuresJours, heuresAssimilees } from "@/lib/heures/hebdo";
import { notifier } from "@/lib/notifications/service";
import { formatEcart, jourIncomplet } from "@/lib/pointage/paires";
import { dureeHebdo, formatHeures } from "@/lib/planning";
import { frDate, frJourLong, jourLocal, lundiDe, plusJours } from "@/lib/temps/zone";

/** Au-delà de ce silence, la pointeuse est considérée comme déconnectée. */
export const SILENCE_MAX_MS = 26 * 3600 * 1000;
/** Une tablette interroge le service toutes les dix secondes : cinq minutes sans nouvelles, elle est éteinte ou hors réseau. */
export const SILENCE_TABLETTE_MS = 5 * 60 * 1000;

export interface BilanQuotidien {
  organisations: number;
  notifications: number;
}

async function pointOrganisation(tx: Tx, org: Organisation, maintenant: Date): Promise<number> {
  let crees = 0;
  const creer = async (n: Parameters<typeof notifier>[1]) => {
    if (await notifier(tx, n)) crees++;
  };
  const aujourdhui = jourLocal(maintenant, org.timezone);
  const hier = plusJours(aujourdhui, -1);
  const lundiCourant = lundiDe(aujourdhui);
  const lundiDernier = plusJours(lundiCourant, -7);

  // ─── Pointeuses ───
  const appareils = await tx
    .select()
    .from(pointeuse)
    .where(and(eq(pointeuse.organisationId, org.id), eq(pointeuse.actif, true)));
  let enDirect = false;
  for (const a of appareils) {
    const silence = a.derniereConnexion ? maintenant.getTime() - a.derniereConnexion.getTime() : maintenant.getTime() - a.createdAt.getTime();
    if (silence <= SILENCE_MAX_MS) {
      if (a.derniereConnexion) enDirect = true;
      continue;
    }
    await creer({
      organisationId: org.id,
      destinataireSalarieId: null,
      type: "POINTEUSE_SILENCIEUSE",
      titre: "Pointeuse silencieuse",
      message: a.derniereConnexion
        ? `La pointeuse ${a.nom ?? a.numeroSerie} n'a plus communiqué depuis le ${frDate(jourLocal(a.derniereConnexion, org.timezone))}. Vérifiez son alimentation et sa connexion Wi-Fi : les badgeages restent dans l'appareil et seront renvoyés.`
        : `La pointeuse ${a.nom ?? a.numeroSerie} ne s'est jamais connectée. Vérifiez l'adresse du serveur dans ses réglages.`,
      lien: "/admin/pointeuses",
      cle: `silence:${a.id}:${lundiCourant}`,
    });
  }

  // ─── Tablettes ───
  const tablettes = await tx
    .select()
    .from(tablette)
    .where(and(eq(tablette.organisationId, org.id), eq(tablette.actif, true), isNotNull(tablette.jetonHash)));
  let tabletteEnDirect = false;
  for (const t of tablettes) {
    const silence = maintenant.getTime() - (t.dernierContact ?? t.createdAt).getTime();
    if (silence <= SILENCE_MAX_MS) {
      tabletteEnDirect = true;
      continue;
    }
    await creer({
      organisationId: org.id,
      destinataireSalarieId: null,
      type: "POINTEUSE_SILENCIEUSE",
      titre: "Tablette silencieuse",
      message: `La tablette ${t.nom} n'a plus communiqué depuis le ${frDate(jourLocal(t.dernierContact ?? t.createdAt, org.timezone))}. Vérifiez qu'elle est allumée, branchée et reliée au Wi-Fi : personne ne peut y pointer.`,
      lien: "/admin/tablettes",
      cle: `silence-tablette:${t.id}:${lundiCourant}`,
    });
  }
  // Salariés qui pointent sur tablette : ceux qui ont un code, ou qui y ont déjà pointé.
  const habitues = tabletteEnDirect
    ? new Set((await tx.selectDistinct({ id: pointageTablette.salarieId }).from(pointageTablette).where(eq(pointageTablette.organisationId, org.id))).map((r) => r.id))
    : new Set<string>();
  const suivi = (f: { id: string; pointeuseRef: string | null; codePointageHash: string | null }) =>
    (enDirect && !!f.pointeuseRef) || (tabletteEnDirect && (!!f.codePointageHash || habitues.has(f.id)));

  const [orphelins] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(badgeage)
    .where(and(eq(badgeage.organisationId, org.id), eq(badgeage.etat, "NON_RATTACHE")));
  if ((orphelins?.n ?? 0) > 0) {
    await creer({
      organisationId: org.id,
      destinataireSalarieId: null,
      type: "BADGE_NON_RATTACHE",
      titre: "Badgeages non rattachés",
      message: `${orphelins!.n} badgeage(s) portent un numéro qu'aucune fiche salarié ne connaît. Rattachez-les pour qu'ils soient comptés.`,
      lien: "/admin/pointeuses",
      cle: `orphelins:${lundiCourant}`,
    });
  }

  // ─── Salariés ───
  const equipe = await chargerSuiviEquipe(tx, org, aujourdhui, { nbSemaines: 2 });
  for (const s of equipe) {
    const f = s.fiche;
    const nom = nomComplet(f);
    const lienAdmin = `/admin/salaries/${f.id}`;

    // Hier : absence à justifier, oubli de badge.
    if (enPoste(f, hier)) {
      const jourPointe = s.semaines.flatMap((x) => x.jours).find((j) => j.date === hier);
      const [calc] = calculerHeuresJours({ jours: [hier], planning: s.planning, conges: s.conges, dateEntree: f.dateEntree, dateSortie: f.dateSortie, aujourdhui });
      const couvert = heuresAssimilees(calc!) + calc!.nonAutorisee > 0;
      if (suivi(f) && calc!.prevu > 0 && !couvert && !jourPointe?.pointages.length) {
        const prevu = formatHeures(calc!.prevu);
        await creer({
          organisationId: org.id,
          destinataireSalarieId: f.id,
          type: "ABSENCE_A_JUSTIFIER",
          titre: "Absence à justifier",
          message: `Aucun badgeage ${frJourLong(hier)}, alors que votre planning prévoyait ${prevu}. Déclarez votre absence, ou signalez un oubli de badge à votre employeur.`,
          lien: "/salarie/conges",
          cle: `absence:${f.id}:${hier}`,
        });
        await creer({
          organisationId: org.id,
          destinataireSalarieId: null,
          salarieId: f.id,
          type: "ABSENCE_A_JUSTIFIER",
          titre: "Absence non justifiée",
          message: `${nom} : aucun badgeage ${frJourLong(hier)} (${prevu} prévues), et aucune absence enregistrée.`,
          lien: lienAdmin,
          cle: `absence:${f.id}:${hier}`,
        });
      }
      if (jourPointe && jourIncomplet(jourPointe.pointages)) {
        await creer({
          organisationId: org.id,
          destinataireSalarieId: f.id,
          type: "POINTAGE_INCOMPLET",
          titre: "Badgeage incomplet",
          message: `Il manque une entrée ou une sortie ${frJourLong(hier)} : signalez l'heure exacte à votre employeur.`,
          lien: "/salarie/heures",
          cle: `incomplet:${f.id}:${hier}`,
        });
        await creer({
          organisationId: org.id,
          destinataireSalarieId: null,
          salarieId: f.id,
          type: "POINTAGE_INCOMPLET",
          titre: "Badgeage incomplet",
          message: `${nom} : il manque une entrée ou une sortie ${frJourLong(hier)}. La journée est à corriger.`,
          lien: lienAdmin,
          cle: `incomplet:${f.id}:${hier}`,
        });
      }
    }

    // Dernière semaine terminée : écart au contrat, validation.
    const semaine = s.semainesAffichees.find((x) => x.lundi === lundiDernier);
    const ligne = s.semaines.find((x) => x.semaineDebut === lundiDernier);
    if (semaine && semaine.terminee && !semaine.horsCompteur && semaine.prevuMinutes + semaine.realiseMinutes > 0 && (ligne || (suivi(f)))) {
      const contrat = formatHeures(dureeHebdo(s.planning));
      const du = frDate(lundiDernier);
      if (semaine.ecartMinutes <= -org.seuilEcartMinutes) {
        const manque = formatEcart(-semaine.ecartMinutes).replace("+", "");
        await creer({
          organisationId: org.id,
          destinataireSalarieId: f.id,
          type: "HEURES_MANQUANTES",
          titre: "Heures non effectuées",
          message: `Semaine du ${du} : ${manque} de moins que votre contrat (${contrat} par semaine).`,
          lien: "/salarie/heures",
          cle: `ecart:${f.id}:${lundiDernier}`,
        });
        await creer({
          organisationId: org.id,
          destinataireSalarieId: null,
          salarieId: f.id,
          type: "HEURES_MANQUANTES",
          titre: "Heures non effectuées",
          message: `${nom}, semaine du ${du} : ${manque} de moins que le contrat (${contrat}).`,
          lien: lienAdmin,
          cle: `ecart:${f.id}:${lundiDernier}`,
        });
      } else if (semaine.ecartMinutes >= org.seuilEcartMinutes) {
        const plus = formatEcart(semaine.ecartMinutes).replace("+", "");
        const nature = dureeHebdo(s.planning) < 35 ? "complémentaires" : "supplémentaires";
        await creer({
          organisationId: org.id,
          destinataireSalarieId: f.id,
          type: "HEURES_SUP",
          titre: `Heures ${nature}`,
          message: `Semaine du ${du} : ${plus} au-delà de votre contrat (${contrat} par semaine).`,
          lien: "/salarie/heures",
          cle: `ecart:${f.id}:${lundiDernier}`,
        });
        await creer({
          organisationId: org.id,
          destinataireSalarieId: null,
          salarieId: f.id,
          type: "HEURES_SUP",
          titre: `Heures ${nature}`,
          message: `${nom}, semaine du ${du} : ${plus} au-delà du contrat (${contrat}).`,
          lien: lienAdmin,
          cle: `ecart:${f.id}:${lundiDernier}`,
        });
      }
    }
    if (ligne && ligne.statut === "EN_ATTENTE" && ligne.totalMinutes > 0) {
      await creer({
        organisationId: org.id,
        destinataireSalarieId: f.id,
        type: "SEMAINE_A_VALIDER",
        titre: "Semaine à valider",
        message: `Vérifiez vos heures de la semaine du ${frDate(lundiDernier)}, puis validez-les ou demandez une modification.`,
        lien: "/salarie/heures",
        cle: `valider:${f.id}:${lundiDernier}`,
      });
    }
  }
  return crees;
}

export async function executerQuotidien(db: Db, maintenant: Date = new Date()): Promise<BilanQuotidien> {
  const organisations = await withBypass(db, async (tx) => {
    // Ménage : sessions expirées, notifications lues depuis plus de six mois.
    await tx.delete(session).where(lt(session.expireLe, maintenant));
    await tx.delete(notification).where(and(isNotNull(notification.luLe), lt(notification.luLe, new Date(maintenant.getTime() - 183 * 86_400_000))));
    return tx
      .select()
      .from(organisation)
      .where(and(eq(organisation.actif, true), eq(organisation.plateforme, false)));
  });
  const bilan: BilanQuotidien = { organisations: organisations.length, notifications: 0 };
  for (const org of organisations) {
    try {
      bilan.notifications += await withTenant(db, org.id, (tx) => pointOrganisation(tx, org, maintenant));
    } catch (e) {
      // Une organisation en erreur n'empêche pas les autres d'être traitées.
      console.error(`[quotidien] organisation ${org.id} : échec`, e);
    }
  }
  return bilan;
}
