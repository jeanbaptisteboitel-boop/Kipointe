/**
 * Lectures partagées par les écrans : suivi d'un salarié (planning, absences, semaines,
 * compteur d'heures) et suivi de l'équipe.
 */
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { Tx } from "@/db";
import { congeAbsence, organisation, pointageSemaine, salarie, type CongeAbsence, type Organisation, type Salarie } from "@/db/schema";
import { avecJustificatifs, type CongeAvecJustificatifs } from "@/lib/conges/justificatifs";
import { calculerCompteurHeures, departParDefaut, mesurerSemaines, type ResultatCompteur, type SemaineCompteur } from "@/lib/heures/compteur";
import { lireJours, type JourPointage } from "@/lib/pointage/paires";
import { planningEffectif, type PlanningTravail, type SourcePlanning } from "@/lib/planning";
import { jourLocal, lundiDe, lundisJusqua } from "@/lib/temps/zone";

export async function chargerOrganisation(tx: Tx, organisationId: string): Promise<Organisation> {
  const [org] = await tx.select().from(organisation).where(eq(organisation.id, organisationId));
  if (!org) throw new Error("organisation introuvable");
  return org;
}

export function aujourdhuiDe(org: Pick<Organisation, "timezone">, maintenant: Date = new Date()): string {
  return jourLocal(maintenant, org.timezone);
}

export function nomComplet(s: Pick<Salarie, "prenom" | "nom">): string {
  return `${s.prenom} ${s.nom}`;
}

/** Le salarié est-il en poste ce jour-là ? */
export function enPoste(s: Pick<Salarie, "actif" | "dateEntree" | "dateSortie">, jour: string): boolean {
  return s.actif && (!s.dateEntree || s.dateEntree <= jour) && (!s.dateSortie || s.dateSortie >= jour);
}

export type SemaineLue = { id: string; semaineDebut: string; semaineFin: string; totalMinutes: number; jours: JourPointage[]; statut: "EN_ATTENTE" | "VALIDE" | "MODIF_DEMANDEE"; commentaire: string | null };

export interface SuiviSalarie {
  fiche: Salarie;
  planning: PlanningTravail;
  sourcePlanning: SourcePlanning;
  conges: CongeAvecJustificatifs[];
  semaines: SemaineLue[];
  compteur: ResultatCompteur;
  /** Les `n` dernières semaines (la plus récente en dernier), compteur ou non. */
  semainesAffichees: SemaineCompteur[];
}

function construireSuivi(org: Organisation, fiche: Salarie, conges: CongeAvecJustificatifs[], semaines: SemaineLue[], aujourdhui: string, nbSemaines: number): SuiviSalarie {
  const { planning, source } = planningEffectif(fiche, org);
  const donnees = { planning, conges, pointagesSemaines: semaines, dateEntree: fiche.dateEntree, dateSortie: fiche.dateSortie, aujourdhui };
  // Sans réglage, le compteur ne remonte pas avant le PREMIER JOUR POINTÉ du salarié : les semaines
  // qui précèdent l'installation de la pointeuse ne sont pas des heures « non effectuées ». Sans
  // aucun pointage, il part d'aujourd'hui (solde nul).
  const premierPointe = semaines.flatMap((s) => s.jours).filter((j) => j.pointages.length > 0).map((j) => j.date).sort()[0];
  const parDefaut = departParDefaut(aujourdhui, fiche.dateEntree, fiche.dateSortie);
  const debutSuivi = premierPointe ?? aujourdhui;
  const depart = fiche.compteurDepart ?? (debutSuivi > parDefaut ? debutSuivi : parDefaut);
  const compteur = { ...calculerCompteurHeures({ ...donnees, depart, soldeDepartMinutes: fiche.compteurSoldeDepartMinutes }), departParDefaut: !fiche.compteurDepart };
  const parLundi = new Map(compteur.semaines.map((s) => [s.lundi, s]));
  const lundis = lundisJusqua(aujourdhui, nbSemaines);
  // Semaines affichées antérieures au compteur : montrées pour mémoire, sans écart ni solde.
  const hors = new Map(mesurerSemaines(donnees, lundis.filter((l) => !parLundi.has(l))).map((m) => [m.lundi, { ...m, horsCompteur: true }]));
  return {
    fiche,
    planning,
    sourcePlanning: source,
    conges,
    semaines,
    compteur,
    semainesAffichees: lundis.map((l) => parLundi.get(l) ?? hors.get(l)!),
  };
}

/** Premier lundi à lire pour couvrir le compteur d'un salarié et les semaines affichées. */
function premierLundi(fiche: Salarie, aujourdhui: string, nbSemaines: number): string {
  const depart = fiche.compteurDepart ?? departParDefaut(aujourdhui, fiche.dateEntree, fiche.dateSortie);
  const affiche = lundisJusqua(aujourdhui, nbSemaines)[0]!;
  const l = lundiDe(depart);
  return l < affiche ? l : affiche;
}

export async function chargerSuiviSalarie(tx: Tx, org: Organisation, fiche: Salarie, aujourdhui: string, nbSemaines = 12): Promise<SuiviSalarie> {
  const du = premierLundi(fiche, aujourdhui, nbSemaines);
  const [conges, semaines] = await Promise.all([
    tx.select().from(congeAbsence).where(eq(congeAbsence.salarieId, fiche.id)).orderBy(desc(congeAbsence.dateDebut)),
    tx
      .select()
      .from(pointageSemaine)
      .where(and(eq(pointageSemaine.salarieId, fiche.id), gte(pointageSemaine.semaineDebut, du)))
      .orderBy(desc(pointageSemaine.semaineDebut)),
  ]);
  return construireSuivi(org, fiche, await avecJustificatifs(tx, conges), semaines.map((s) => ({ ...s, jours: lireJours(s.jours) })), aujourdhui, nbSemaines);
}

/** Suivi de tous les salariés de l'organisation (actifs par défaut), triés par nom. */
export async function chargerSuiviEquipe(tx: Tx, org: Organisation, aujourdhui: string, options: { nbSemaines?: number; tous?: boolean } = {}): Promise<SuiviSalarie[]> {
  const nb = options.nbSemaines ?? 4;
  const fiches = await tx
    .select()
    .from(salarie)
    .where(options.tous ? eq(salarie.organisationId, org.id) : and(eq(salarie.organisationId, org.id), eq(salarie.actif, true)))
    .orderBy(asc(salarie.nom), asc(salarie.prenom));
  if (!fiches.length) return [];
  const ids = fiches.map((f) => f.id);
  const du = fiches.map((f) => premierLundi(f, aujourdhui, nb)).sort()[0]!;
  const [conges, semaines] = await Promise.all([
    tx.select().from(congeAbsence).where(inArray(congeAbsence.salarieId, ids)).orderBy(desc(congeAbsence.dateDebut)),
    tx
      .select()
      .from(pointageSemaine)
      .where(and(inArray(pointageSemaine.salarieId, ids), gte(pointageSemaine.semaineDebut, du)))
      .orderBy(desc(pointageSemaine.semaineDebut)),
  ]);
  const complets = await avecJustificatifs(tx, conges);
  return fiches.map((f) =>
    construireSuivi(
      org,
      f,
      complets.filter((c) => c.salarieId === f.id),
      semaines.filter((s) => s.salarieId === f.id).map((s) => ({ ...s, jours: lireJours(s.jours) })),
      aujourdhui,
      nb,
    ),
  );
}

/** Solde de congés payés : solde saisi à une date, moins les congés payés acceptés qui commencent après. */
export function soldeCongesPayes(fiche: Pick<Salarie, "cpSoldeJours" | "cpSoldeAu">, conges: CongeAbsence[]): { solde: number; pris: number; enAttente: number } | null {
  if (fiche.cpSoldeJours == null) return null;
  const depuis = fiche.cpSoldeAu ?? "0000-01-01";
  const cp = conges.filter((c) => c.type === "CONGE_PAYE" && c.dateDebut > depuis);
  const pris = cp.filter((c) => c.statut === "ACCEPTEE").reduce((s, c) => s + (c.nbJours ?? 0), 0);
  const enAttente = cp.filter((c) => c.statut === "EN_ATTENTE").reduce((s, c) => s + (c.nbJours ?? 0), 0);
  return { solde: fiche.cpSoldeJours - pris, pris, enAttente };
}
