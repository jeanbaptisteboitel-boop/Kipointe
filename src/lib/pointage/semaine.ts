/**
 * SEMAINES DE POINTAGE — lecture et écriture en base.
 *
 * Toute écriture d'une semaine se fait dans une transaction, après avoir VERROUILLÉ sa ligne
 * (SELECT … FOR UPDATE) : deux badgeages simultanés du même salarié se suivent au lieu de
 * s'écraser. Une écriture remet la semaine « à valider » et efface l'ancien commentaire.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { pointageSemaine, salarie, type StatutSemaine } from "@/db/schema";
import { ErreurMetier } from "@/lib/actions";
import { fusionnerImport, normaliserNom, parsePointageCsv } from "@/lib/pointage/csv";
import { bornesSemaine, lireJours, minutesDepuisPointages, totalMinutes, type JourPointage, type Pointage, type ResultatPointage } from "@/lib/pointage/paires";
import { normaliserPin } from "@/lib/pointeuse/adms";
import { plusJours } from "@/lib/temps/zone";

export interface SemaineVerrouillee {
  lundi: string;
  dimanche: string;
  semaine: { id: string; jours: JourPointage[]; statut: StatutSemaine } | null;
}

/** DANS une transaction : verrouille puis lit la semaine du jour « AAAA-MM-JJ » d'un salarié. */
export async function lireSemaineVerrouillee(tx: Tx, salarieId: string, date: string): Promise<SemaineVerrouillee> {
  const { lundi, dimanche } = bornesSemaine(date);
  const rows = await tx
    .select({ id: pointageSemaine.id, jours: pointageSemaine.jours, statut: pointageSemaine.statut })
    .from(pointageSemaine)
    .where(and(eq(pointageSemaine.salarieId, salarieId), eq(pointageSemaine.semaineDebut, lundi)))
    .for("update");
  const s = rows[0];
  return { lundi, dimanche, semaine: s ? { id: s.id, jours: lireJours(s.jours), statut: s.statut } : null };
}

/** DANS la même transaction : écrit les jours d'une semaine, qui repasse « à valider ». */
export async function ecrireJours(tx: Tx, organisationId: string, salarieId: string, s: SemaineVerrouillee, jours: JourPointage[]): Promise<string> {
  const total = totalMinutes(jours);
  if (s.semaine) {
    await tx
      .update(pointageSemaine)
      .set({ jours, totalMinutes: total, statut: "EN_ATTENTE", commentaire: null, updatedAt: new Date() })
      .where(eq(pointageSemaine.id, s.semaine.id));
    return s.semaine.id;
  }
  const [creee] = await tx
    .insert(pointageSemaine)
    .values({ organisationId, salarieId, semaineDebut: s.lundi, semaineFin: s.dimanche, jours, totalMinutes: total })
    .returning({ id: pointageSemaine.id });
  return creee!.id;
}

/** Écrit le résultat d'un badgeage (rien si `deja`). */
export async function ecrireSemaine(tx: Tx, organisationId: string, salarieId: string, s: SemaineVerrouillee, r: ResultatPointage): Promise<void> {
  if (r.deja) return;
  await ecrireJours(tx, organisationId, salarieId, s, r.jours);
}

/** Corrige (ou crée) une journée : les paires saisies remplacent celles du jour. */
export async function enregistrerJour(tx: Tx, p: { organisationId: string; salarieId: string; date: string; pointages: Pointage[] }): Promise<{ semaineId: string; minutes: number }> {
  const s = await lireSemaineVerrouillee(tx, p.salarieId, p.date);
  const jours = (s.semaine?.jours ?? []).filter((j) => j.date !== p.date);
  const minutes = minutesDepuisPointages(p.pointages);
  if (p.pointages.length > 0) jours.push({ date: p.date, minutes, pointages: p.pointages });
  jours.sort((a, b) => a.date.localeCompare(b.date));
  const semaineId = await ecrireJours(tx, p.organisationId, p.salarieId, s, jours);
  return { semaineId, minutes };
}

/** Le salarié valide sa semaine, ou demande une modification (commentaire obligatoire). */
export async function deciderSemaine(tx: Tx, p: { semaineId: string; salarieId?: string; action: "valider" | "demander_modif"; commentaire?: string }): Promise<{ salarieId: string; semaineDebut: string }> {
  const [s] = await tx.select().from(pointageSemaine).where(eq(pointageSemaine.id, p.semaineId)).for("update");
  if (!s || (p.salarieId && s.salarieId !== p.salarieId)) throw new ErreurMetier("Semaine introuvable.");
  if (p.action === "valider") {
    await tx.update(pointageSemaine).set({ statut: "VALIDE", commentaire: null, updatedAt: new Date() }).where(eq(pointageSemaine.id, s.id));
  } else {
    const commentaire = (p.commentaire ?? "").trim().slice(0, 500);
    if (!commentaire) throw new ErreurMetier("Indiquez ce qu'il faut corriger.");
    await tx.update(pointageSemaine).set({ statut: "MODIF_DEMANDEE", commentaire, updatedAt: new Date() }).where(eq(pointageSemaine.id, s.id));
  }
  return { salarieId: s.salarieId, semaineDebut: s.semaineDebut };
}

/** Semaines d'un salarié entre deux lundis (inclus), de la plus récente à la plus ancienne. */
export async function semainesDuSalarie(tx: Tx, salarieId: string, du: string, au: string) {
  const rows = await tx
    .select()
    .from(pointageSemaine)
    .where(and(eq(pointageSemaine.salarieId, salarieId), gte(pointageSemaine.semaineDebut, du), lte(pointageSemaine.semaineDebut, au)))
    .orderBy(sql`${pointageSemaine.semaineDebut} desc`);
  return rows.map((r) => ({ ...r, jours: lireJours(r.jours) }));
}

export interface BilanImport {
  semaines: number;
  salaries: number;
  nonApparies: string[];
  conserves: number;
  saisiesRemplacees: { nom: string; date: string }[];
}

/**
 * Importe le fichier CSV de la pointeuse. Appariement employé ⇄ salarié : par numéro de
 * pointeuse mémorisé sur la fiche, sinon par nom (prénom + nom, accents et casse ignorés) — le
 * numéro est alors mémorisé pour les imports et les badgeages suivants.
 */
export async function importerCsv(tx: Tx, organisationId: string, texte: string): Promise<BilanImport> {
  const semaines = parsePointageCsv(texte);
  if (!semaines.length) throw new ErreurMetier("Aucun pointage lisible dans ce fichier : attendu l'export « Rapport de pointage » de la pointeuse (CSV).");
  const fiches = await tx.select().from(salarie).where(eq(salarie.organisationId, organisationId));
  const parPin = new Map(fiches.filter((f) => f.pointeuseRef).map((f) => [normaliserPin(f.pointeuseRef), f]));
  const parNom = new Map<string, (typeof fiches)[number]>();
  for (const f of fiches) {
    parNom.set(normaliserNom(`${f.prenom} ${f.nom}`), f);
    parNom.set(normaliserNom(`${f.nom} ${f.prenom}`), f);
  }
  const bilan: BilanImport = { semaines: 0, salaries: 0, nonApparies: [], conserves: 0, saisiesRemplacees: [] };
  const vus = new Set<string>();
  for (const sem of semaines) {
    let fiche = sem.pointeuseRef ? parPin.get(normaliserPin(sem.pointeuseRef)) : undefined;
    if (!fiche) {
      fiche = parNom.get(normaliserNom(sem.nom));
      if (fiche && sem.pointeuseRef && !fiche.pointeuseRef) {
        await tx.update(salarie).set({ pointeuseRef: normaliserPin(sem.pointeuseRef) }).where(eq(salarie.id, fiche.id));
        fiche.pointeuseRef = normaliserPin(sem.pointeuseRef);
        parPin.set(fiche.pointeuseRef, fiche);
      }
    }
    if (!fiche) {
      const etiquette = sem.pointeuseRef ? `${sem.nom} (n° ${sem.pointeuseRef})` : sem.nom;
      if (!bilan.nonApparies.includes(etiquette)) bilan.nonApparies.push(etiquette);
      continue;
    }
    const s = await lireSemaineVerrouillee(tx, fiche.id, sem.semaineDebut);
    const f = fusionnerImport(sem.jours, s.semaine?.jours ?? []);
    await ecrireJours(tx, organisationId, fiche.id, s, f.jours);
    bilan.semaines++;
    bilan.conserves += f.conserves;
    for (const date of f.saisiesRemplacees) bilan.saisiesRemplacees.push({ nom: `${fiche.prenom} ${fiche.nom}`, date });
    vus.add(fiche.id);
  }
  bilan.salaries = vus.size;
  return bilan;
}

/** Lundi le plus ancien à charger pour afficher `n` semaines jusqu'à celle de `jour`. */
export function lundiIlYA(lundi: string, semaines: number): string {
  return plusJours(lundi, -7 * semaines);
}
