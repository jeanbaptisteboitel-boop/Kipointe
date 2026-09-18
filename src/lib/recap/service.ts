/**
 * Récap hebdo : brouillon recalculé à chaque consultation, puis figé à la validation
 * (PDF signé par empreinte SHA-256, archivé sur Scaleway avec Object Lock).
 */
import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { anomalie, correction, etablissement, pointage, recapHebdo, type RecapHebdo } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/auth/session";
import { calculerSemaineSalarie, chargerOrganisation, type SemaineSalarie } from "@/lib/calcul/recap";
import { detailJoursRecap, minutesAuTaux } from "@/lib/calcul/semaine";
import { libelleType } from "@/lib/pointage/service";
import { dateJournee, formatDateFr, formatHeure } from "@/lib/temps/journee";
import { sha256HexBytes } from "@/lib/crypto";
import { HttpError } from "@/lib/http";
import { journaliserAcces } from "@/lib/journal";
import { genererPdfRecap } from "@/lib/pdf/recap";
import { archiverPdf, cleArchiveRecap } from "@/lib/storage/scaleway";

/** Crée ou rafraîchit le brouillon d'un récap tant qu'il n'est pas validé. Renvoie la ligne. */
export async function enregistrerBrouillonRecap(tx: Tx, organisationId: string, sem: SemaineSalarie): Promise<RecapHebdo> {
  const { resultat, salarie } = sem;
  const existant = await tx.query.recapHebdo.findFirst({
    where: and(
      eq(recapHebdo.organisationId, organisationId),
      eq(recapHebdo.salarieId, salarie.id),
      eq(recapHebdo.annee, resultat.annee),
      eq(recapHebdo.semaineIso, resultat.semaine),
    ),
  });
  if (existant?.valideLe) return existant;
  const valeurs = {
    totalMinutes: resultat.totalMinutes,
    heuresSup25: minutesAuTaux(resultat.heuresSup, 25),
    heuresSup50: minutesAuTaux(resultat.heuresSup, 50),
    heuresSupDetail: resultat.heuresSup,
    detailJours: detailJoursRecap(resultat),
  };
  if (existant) {
    const [maj] = await tx.update(recapHebdo).set(valeurs).where(eq(recapHebdo.id, existant.id)).returning();
    return maj!;
  }
  const [cree] = await tx
    .insert(recapHebdo)
    .values({ organisationId, salarieId: salarie.id, annee: resultat.annee, semaineIso: resultat.semaine, ...valeurs })
    .returning();
  return cree!;
}

export async function validerRecap(
  tx: Tx,
  organisationId: string,
  recapId: string,
  u: UtilisateurConnecte,
  maintenant = new Date(),
): Promise<RecapHebdo> {
  const r = await tx.query.recapHebdo.findFirst({ where: and(eq(recapHebdo.id, recapId), eq(recapHebdo.organisationId, organisationId)) });
  if (!r) throw new HttpError(404, "RECAP_INTROUVABLE");
  if (r.valideLe) throw new HttpError(409, "RECAP_DEJA_VALIDE");

  const sem = await calculerSemaineSalarie(tx, organisationId, r.salarieId, r.annee, r.semaineIso, maintenant);
  if (!sem.resultat.terminee) throw new HttpError(409, "SEMAINE_NON_TERMINEE", "La semaine n'est pas terminée.");
  const org = await chargerOrganisation(tx, organisationId);
  const params = sem.parametres;

  // Adresse de l'établissement du salarié, pour l'en-tête du document.
  const etab = sem.salarie.etablissementDefautId
    ? await tx.query.etablissement.findFirst({ where: eq(etablissement.id, sem.salarie.etablissementDefautId) })
    : await tx.query.etablissement.findFirst({ where: and(eq(etablissement.organisationId, organisationId), eq(etablissement.actif, true)) });

  // ─── Traçabilité : corrections, saisies manuelles, pointages hors ligne, anomalies ───
  const pointagesSemaine = await tx
    .select()
    .from(pointage)
    .where(
      and(
        eq(pointage.organisationId, organisationId),
        eq(pointage.salarieId, r.salarieId),
        gte(pointage.horodatageEffectif, sem.resultat.debut),
        lt(pointage.horodatageEffectif, sem.resultat.fin),
      ),
    )
    .orderBy(asc(pointage.horodatageEffectif));
  const ids = pointagesSemaine.map((x) => x.id);
  const corrections = ids.length ? await tx.select().from(correction).where(inArray(correction.pointageId, ids)).orderBy(asc(correction.createdAt)) : [];
  const anomalies = await tx
    .select()
    .from(anomalie)
    .where(and(eq(anomalie.organisationId, organisationId), eq(anomalie.salarieId, r.salarieId), inArray(anomalie.dateJour, sem.resultat.jours.map((j) => j.date))));

  const notes: Record<string, string[]> = {};
  const ajouterNote = (jour: string, texte: string) => {
    (notes[jour] ??= []).push(texte);
  };
  const parId = new Map(pointagesSemaine.map((x) => [x.id, x]));

  for (const c of corrections) {
    const pt = parId.get(c.pointageId);
    if (!pt) continue;
    const jour = dateJournee(pt.horodatageEffectif, params);
    const auteur = c.auteurId === u.id ? `${u.prenom} ${u.nom}` : "le gérant";
    if (c.nouvelleValeur.annule) {
      ajouterNote(jour, `Pointage de ${formatHeure(pt.horodatageEffectif, params.timezone)} annulé par ${auteur} le ${formatDateFr(c.createdAt.toISOString().slice(0, 10))}, motif « ${c.motif} ».`);
    } else {
      const nouvelle = c.nouvelleValeur.horodatage ? new Date(c.nouvelleValeur.horodatage) : pt.horodatageEffectif;
      ajouterNote(
        jour,
        `Pointage de ${formatHeure(pt.horodatageEffectif, params.timezone)} corrigé en ${formatHeure(nouvelle, params.timezone)} par ${auteur} le ${formatDateFr(c.createdAt.toISOString().slice(0, 10))}, motif « ${c.motif} ».`,
      );
    }
  }
  for (const pt of pointagesSemaine) {
    const jour = dateJournee(pt.horodatageEffectif, params);
    if (pt.source === "SAISIE_MANUELLE") {
      ajouterNote(
        jour,
        `${libelleType(pt.type)} de ${formatHeure(pt.horodatageEffectif, params.timezone)} ajoutée par saisie manuelle du gérant le ${formatDateFr(pt.createdAt.toISOString().slice(0, 10))}${pt.motif ? `, motif « ${pt.motif} »` : ""}.`,
      );
    } else if (pt.source === "KIOSQUE_HORS_LIGNE") {
      ajouterNote(
        jour,
        `${libelleType(pt.type)} de ${formatHeure(pt.horodatageEffectif, params.timezone)} enregistrée hors ligne sur le terminal, transmise le ${formatDateFr(pt.horodatageServeur.toISOString().slice(0, 10))} à ${formatHeure(pt.horodatageServeur, params.timezone)}.`,
      );
    }
  }
  for (const a of anomalies) {
    if (a.statut === "IGNOREE") continue;
    ajouterNote(a.dateJour, `Anomalie relevée : ${LIBELLES_ANOMALIE_PDF[a.type] ?? a.type}${a.statut === "TRAITEE" ? ", traitée avant validation" : ""}.`);
  }

  const annulesCount = corrections.filter((c) => c.nouvelleValeur.annule).length;
  const [nbHorsLigne] = await tx
    .select({ n: count() })
    .from(pointage)
    .where(
      and(
        eq(pointage.salarieId, r.salarieId),
        eq(pointage.source, "KIOSQUE_HORS_LIGNE"),
        gte(pointage.horodatageEffectif, sem.resultat.debut),
        lt(pointage.horodatageEffectif, sem.resultat.fin),
      ),
    );

  const detailJours = detailJoursRecap(sem.resultat);
  const reference = `KP-${r.annee}-S${String(r.semaineIso).padStart(2, "0")}-${(sem.salarie.matricule ?? r.salarieId.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

  const pdf = await genererPdfRecap({
    recapId: r.id,
    reference,
    organisation: {
      raisonSociale: org.raisonSociale,
      siret: org.siret,
      conventionCollective: org.conventionCollective,
      adresse: etab?.adresse ?? null,
    },
    salarie: {
      nom: sem.salarie.nom,
      prenom: sem.salarie.prenom,
      matricule: sem.salarie.matricule,
      contratHeuresHebdo: sem.salarie.contratHeuresHebdo,
    },
    annee: r.annee,
    semaine: r.semaineIso,
    jours: detailJours,
    notes,
    totalMinutes: sem.resultat.totalMinutes,
    heuresSup: sem.resultat.heuresSup,
    dureeHebdoReference: params.dureeHebdoReference,
    timezone: params.timezone,
    genereLe: maintenant,
    validePar: `${u.prenom} ${u.nom} (${u.email})`,
    correctionsCount: corrections.length,
    horsLigneCount: Number(nbHorsLigne?.n ?? 0),
    annulesCount,
    anomaliesCount: anomalies.filter((a) => a.statut !== "IGNOREE").length,
  });

  const hash = sha256HexBytes(pdf);
  const cle = cleArchiveRecap(organisationId, r.annee, r.semaineIso, r.salarieId, r.id);
  await archiverPdf(cle, pdf, hash);

  const [valide] = await tx
    .update(recapHebdo)
    .set({
      totalMinutes: sem.resultat.totalMinutes,
      heuresSup25: minutesAuTaux(sem.resultat.heuresSup, 25),
      heuresSup50: minutesAuTaux(sem.resultat.heuresSup, 50),
      heuresSupDetail: sem.resultat.heuresSup,
      detailJours,
      pdfObjectKey: cle,
      hashSha256: hash,
      valideLe: maintenant,
      valideParId: u.id,
    })
    .where(and(eq(recapHebdo.id, r.id), sql`${recapHebdo.valideLe} is null`))
    .returning();
  if (!valide) throw new HttpError(409, "RECAP_DEJA_VALIDE");

  await journaliserAcces(tx, {
    organisationId,
    utilisateurId: u.id,
    salarieId: r.salarieId,
    action: "recap.valider",
    detail: { recapId: r.id, semaine: `${r.annee}-W${r.semaineIso}`, reference, hash, cle },
  });
  return valide;
}

const LIBELLES_ANOMALIE_PDF: Record<string, string> = {
  OUBLI_SORTIE: "oubli de sortie",
  DOUBLE_SCAN: "double scan",
  HORS_PLAGE: "pointage incohérent",
  REPOS_11H: "repos quotidien inférieur à 11 h",
  REPOS_HEBDO: "repos hebdomadaire inférieur à 35 h",
  PAUSE_MANQUANTE: "pause manquante après 6 h de travail continu",
  AMPLITUDE: "amplitude quotidienne supérieure à 13 h",
  PIN_VERROUILLE: "badge verrouillé après cinq codes erronés",
  POINTAGE_HORS_LIGNE: "pointage enregistré hors ligne",
};
