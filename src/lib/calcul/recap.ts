/**
 * Calcul d'une semaine pour un salarié à partir de la base (paramètres de l'organisation,
 * fuseau de l'établissement, pointages effectifs), avec synchronisation des anomalies.
 */
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { etablissement, organisation, salarie, type Organisation, type Salarie } from "@/db/schema";
import { synchroniserAnomalies } from "./anomalies";
import { chargerPointagesEffectifs, type PointageEffectif } from "./effectifs";
import { calculerSemaine, MARGE_DONNEES_APRES_MS, MARGE_DONNEES_AVANT_MS, parametresDepuis, type ParametresCalcul, type ResultatSemaine } from "./semaine";
import { bornesSemaine } from "@/lib/temps/journee";

export async function chargerOrganisation(tx: Tx, organisationId: string): Promise<Organisation> {
  const org = await tx.query.organisation.findFirst({ where: eq(organisation.id, organisationId) });
  if (!org) throw new Error(`Organisation introuvable : ${organisationId}`);
  return org;
}

/** Fuseau applicable à un salarié : son établissement par défaut, sinon le premier établissement actif. */
export async function timezoneSalarie(tx: Tx, organisationId: string, s: Pick<Salarie, "etablissementDefautId">): Promise<string> {
  if (s.etablissementDefautId) {
    const e = await tx.query.etablissement.findFirst({ where: eq(etablissement.id, s.etablissementDefautId) });
    if (e) return e.timezone;
  }
  const premier = await tx.query.etablissement.findFirst({
    where: and(eq(etablissement.organisationId, organisationId), eq(etablissement.actif, true)),
  });
  return premier?.timezone ?? "Europe/Paris";
}

export async function parametresSalarie(tx: Tx, organisationId: string, s: Salarie): Promise<ParametresCalcul> {
  const org = await chargerOrganisation(tx, organisationId);
  const tz = await timezoneSalarie(tx, organisationId, s);
  return parametresDepuis(org, tz);
}

export type SemaineSalarie = {
  salarie: Salarie;
  parametres: ParametresCalcul;
  resultat: ResultatSemaine;
  pointages: PointageEffectif[];
};

/** Calcule la semaine d'un salarié et met à jour ses anomalies calculées. */
export async function calculerSemaineSalarie(
  tx: Tx,
  organisationId: string,
  salarieId: string,
  annee: number,
  semaine: number,
  maintenant = new Date(),
  options: { synchroniser?: boolean; parametres?: ParametresCalcul } = {},
): Promise<SemaineSalarie> {
  const s = await tx.query.salarie.findFirst({ where: and(eq(salarie.id, salarieId), eq(salarie.organisationId, organisationId)) });
  if (!s) throw new Error(`Salarié introuvable : ${salarieId}`);
  const parametres = options.parametres ?? (await parametresSalarie(tx, organisationId, s));
  const { debut, fin, jours } = bornesSemaine(annee, semaine, parametres);
  const pointages = await chargerPointagesEffectifs(
    tx,
    organisationId,
    salarieId,
    new Date(debut.getTime() - MARGE_DONNEES_AVANT_MS),
    new Date(fin.getTime() + MARGE_DONNEES_APRES_MS),
  );
  const resultat = calculerSemaine(pointages, annee, semaine, parametres, maintenant);
  if (options.synchroniser !== false) {
    await synchroniserAnomalies(tx, organisationId, salarieId, jours, resultat.anomalies);
  }
  return { salarie: s, parametres, resultat, pointages: pointages.filter((p) => p.horodatage >= debut && p.horodatage < fin) };
}

/** Calcule la semaine de tous les salariés actifs d'une organisation. */
export async function calculerSemaineOrganisation(
  tx: Tx,
  organisationId: string,
  annee: number,
  semaine: number,
  maintenant = new Date(),
): Promise<SemaineSalarie[]> {
  const org = await chargerOrganisation(tx, organisationId);
  const salaries = await tx.query.salarie.findMany({
    where: and(eq(salarie.organisationId, organisationId), eq(salarie.actif, true)),
    orderBy: (s, { asc }) => [asc(s.nom), asc(s.prenom)],
  });
  const resultats: SemaineSalarie[] = [];
  for (const s of salaries) {
    const tz = await timezoneSalarie(tx, organisationId, s);
    resultats.push(
      await calculerSemaineSalarie(tx, organisationId, s.id, annee, semaine, maintenant, { parametres: parametresDepuis(org, tz) }),
    );
  }
  return resultats;
}
