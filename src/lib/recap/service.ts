/**
 * Récap hebdo : brouillon recalculé à chaque consultation, puis figé à la validation
 * (PDF signé par empreinte SHA-256, archivé sur Scaleway avec Object Lock).
 */
import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { correction, pointage, recapHebdo, type RecapHebdo } from "@/db/schema";
import type { UtilisateurConnecte } from "@/lib/auth/session";
import { calculerSemaineSalarie, chargerOrganisation, type SemaineSalarie } from "@/lib/calcul/recap";
import { detailJoursRecap, minutesAuTaux } from "@/lib/calcul/semaine";
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

  const ids = sem.pointages.map((p) => p.id);
  const [nbCorrections] = ids.length
    ? await tx.select({ n: count() }).from(correction).where(inArray(correction.pointageId, ids))
    : [{ n: 0 }];
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
  const pdf = await genererPdfRecap({
    recapId: r.id,
    organisation: { raisonSociale: org.raisonSociale, siret: org.siret, conventionCollective: org.conventionCollective },
    salarie: { nom: sem.salarie.nom, prenom: sem.salarie.prenom, matricule: sem.salarie.matricule, contratHeuresHebdo: sem.salarie.contratHeuresHebdo },
    annee: r.annee,
    semaine: r.semaineIso,
    jours: detailJours,
    totalMinutes: sem.resultat.totalMinutes,
    heuresSup: sem.resultat.heuresSup,
    dureeHebdoReference: sem.parametres.dureeHebdoReference,
    timezone: sem.parametres.timezone,
    genereLe: maintenant,
    validePar: `${u.prenom} ${u.nom}`,
    correctionsCount: Number(nbCorrections?.n ?? 0),
    horsLigneCount: Number(nbHorsLigne?.n ?? 0),
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
    detail: { recapId: r.id, semaine: `${r.annee}-W${r.semaineIso}`, hash, cle },
  });
  return valide;
}
