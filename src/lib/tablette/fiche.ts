/**
 * Ce que le salarié voit en pointant : ses prochains rendez-vous, ses notifications à lire, et
 * de quoi vérifier d'un coup d'œil son solde de congés et ses derniers jours.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Tx } from "@/db";
import { rendezVous, salarie } from "@/db/schema";
import { formatJours } from "@/lib/conges/types";
import { chargerOrganisation, chargerSuiviSalarie, soldeCongesPayes } from "@/lib/donnees";
import { compterNonLues } from "@/lib/notifications/service";
import { formatEcart, formatMinutes } from "@/lib/pointage/paires";
import { formatHeures, heuresDuJour } from "@/lib/planning";
import { frJourLong, jourLocal, lundiDe, plusJours } from "@/lib/temps/zone";

/** Un rendez-vous est rappelé à partir de trente jours avant sa date. */
export const HORIZON_RAPPEL_JOURS = 30;

export interface Rappel {
  id: string;
  intitule: string;
  quand: string;
  precision: string | null;
}

export interface FichePointage {
  rappels: Rappel[];
  nonLues: number;
  conges: { solde: string; enAttente: string | null } | null;
  compteur: string;
  semaine: string;
  jours: { jour: string; prevu: string; fait: string; detail: string }[];
}

function quand(jour: string, heure: string | null, aujourdhui: string): string {
  const base = jour === aujourdhui ? "aujourd'hui" : jour === plusJours(aujourdhui, 1) ? "demain" : frJourLong(jour);
  return heure ? `${base} à ${heure.replace(":", " h ")}` : base;
}

export async function prochainsRendezVous(tx: Tx, salarieId: string, aujourdhui: string, limite = 3): Promise<Rappel[]> {
  const lignes = await tx
    .select()
    .from(rendezVous)
    .where(and(eq(rendezVous.salarieId, salarieId), gte(rendezVous.jour, aujourdhui), lte(rendezVous.jour, plusJours(aujourdhui, HORIZON_RAPPEL_JOURS))))
    .orderBy(asc(rendezVous.jour), asc(rendezVous.heure))
    .limit(limite);
  return lignes.map((r) => ({ id: r.id, intitule: r.intitule, quand: quand(r.jour, r.heure, aujourdhui), precision: r.precision }));
}

/** DANS une transaction de l'organisation. */
export async function fichePointage(tx: Tx, organisationId: string, salarieId: string, maintenant = new Date()): Promise<FichePointage | null> {
  const org = await chargerOrganisation(tx, organisationId);
  const [fiche] = await tx.select().from(salarie).where(eq(salarie.id, salarieId));
  if (!fiche) return null;
  const aujourdhui = jourLocal(maintenant, org.timezone);
  const suivi = await chargerSuiviSalarie(tx, org, fiche, aujourdhui, 2);
  const cp = soldeCongesPayes(fiche, suivi.conges);
  const pointes = new Map(suivi.semaines.flatMap((s) => s.jours).map((j) => [j.date, j]));
  const jours = [];
  for (let i = 0; i < 7; i++) {
    const d = plusJours(aujourdhui, -i);
    const j = pointes.get(d);
    const prevu = heuresDuJour(suivi.planning, d);
    if (!j?.pointages.length && prevu === 0) continue; // jour de repos sans pointage : rien à montrer
    jours.push({
      jour: i === 0 ? "Aujourd'hui" : i === 1 ? "Hier" : frJourLong(d),
      prevu: prevu > 0 ? formatHeures(prevu) : "repos",
      fait: formatMinutes(j?.minutes ?? 0),
      detail: j?.pointages.length ? j.pointages.map((p) => `${p.entree ?? "?"} → ${p.sortie ?? "…"}`).join("  ·  ") : "aucun pointage",
    });
  }
  const semaineCourante = suivi.semaines.find((x) => x.semaineDebut === lundiDe(aujourdhui));
  return {
    rappels: await prochainsRendezVous(tx, salarieId, aujourdhui),
    nonLues: await compterNonLues(tx, organisationId, salarieId),
    conges: cp ? { solde: formatJours(cp.solde), enAttente: cp.enAttente ? formatJours(cp.enAttente) : null } : null,
    compteur: formatEcart(suivi.compteur.soldeMinutes),
    semaine: formatMinutes(semaineCourante?.totalMinutes ?? 0),
    jours,
  };
}
