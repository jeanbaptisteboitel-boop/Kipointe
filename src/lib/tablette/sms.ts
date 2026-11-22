/**
 * TABLETTE — pointage par SMS (option payante, ouverte par l'éditeur puis par l'entreprise).
 *
 * Le salarié touche son nom sur la tablette, reçoit un code à 6 chiffres sur son mobile et le tape
 * au clavier. Le code vaut cinq minutes, une seule fois, sur la tablette qui l'a demandé.
 *
 * Chaque ligne de `sms_pointage` est un SMS réellement parti : c'est la base de la facturation.
 * Garde-fous contre l'abus (un SMS coûte) : un envoi par minute et dix par jour pour un salarié,
 * trente par heure pour une tablette.
 */
import { and, asc, count, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { salarie, smsPointage } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { hacherTokenSession } from "@/lib/crypto";
import { envoyerSms, masquerMobile, smsConfigure, type EnvoiSms } from "@/lib/sms/ovh";
import { codeAleatoire } from "@/lib/tablette/jeton";
import type { TabletteConnue } from "@/lib/tablette/service";
import { horodatageLocal } from "@/lib/temps/zone";

export const VALIDITE_CODE_SMS_MS = 5 * 60_000;
const DELAI_ENTRE_ENVOIS_MS = 60_000;
const MAX_PAR_JOUR_SALARIE = 10;
const MAX_PAR_HEURE_TABLETTE = 30;

export function hacherCodeSms(organisationId: string, code: string): string {
  return hacherTokenSession(`code-sms:${organisationId}:${code}`);
}

/** Salariés qui peuvent recevoir un code : en poste, avec un mobile. Affichés « Prénom N. » sur la tablette. */
export async function destinatairesSms(tx: Tx, organisationId: string, aujourdhui: string): Promise<{ id: string; nom: string }[]> {
  const fiches = await tx
    .select({ id: salarie.id, prenom: salarie.prenom, nom: salarie.nom, dateSortie: salarie.dateSortie })
    .from(salarie)
    .where(and(eq(salarie.organisationId, organisationId), eq(salarie.actif, true), isNotNull(salarie.telephone)))
    .orderBy(asc(salarie.prenom), asc(salarie.nom));
  return fiches.filter((f) => !f.dateSortie || f.dateSortie >= aujourdhui).map((f) => ({ id: f.id, nom: `${f.prenom} ${f.nom.slice(0, 1).toUpperCase()}.` }));
}

export type ResultatDemandeSms = { ok: true; mobile: string } | { ok: false; raison: "MODE_FERME" | "SERVICE_ABSENT" | "SALARIE_INCONNU" | "PATIENTEZ" | "TROP_DE_SMS" | "ENVOI_IMPOSSIBLE" };

/** Envoie un code de pointage au salarié choisi sur la tablette. */
export async function demanderCodeSms(db: Db, t: TabletteConnue, salarieId: string, maintenant = new Date(), envoyer: EnvoiSms = envoyerSms, configure = smsConfigure()): Promise<ResultatDemandeSms> {
  if (!t.modeSms) return { ok: false, raison: "MODE_FERME" };
  if (!configure) return { ok: false, raison: "SERVICE_ABSENT" };
  const prepare = await withTenant(db, t.organisationId, async (tx) => {
    const [fiche] = await tx.select({ id: salarie.id, telephone: salarie.telephone, actif: salarie.actif, dateSortie: salarie.dateSortie }).from(salarie).where(eq(salarie.id, salarieId));
    const aujourdhui = horodatageLocal(maintenant, t.fuseau).date;
    if (!fiche?.telephone || !fiche.actif || (fiche.dateSortie && fiche.dateSortie < aujourdhui)) return { ok: false, raison: "SALARIE_INCONNU" } as const;
    const depuis = (ms: number) => new Date(maintenant.getTime() - ms);
    const compter = async (...filtres: Parameters<typeof and>) => (await tx.select({ n: count() }).from(smsPointage).where(and(eq(smsPointage.organisationId, t.organisationId), ...filtres)))[0]?.n ?? 0;
    if ((await compter(eq(smsPointage.salarieId, fiche.id), gt(smsPointage.createdAt, depuis(DELAI_ENTRE_ENVOIS_MS)))) > 0) return { ok: false, raison: "PATIENTEZ" } as const;
    if ((await compter(eq(smsPointage.salarieId, fiche.id), gt(smsPointage.createdAt, depuis(24 * 3600_000)))) >= MAX_PAR_JOUR_SALARIE) return { ok: false, raison: "TROP_DE_SMS" } as const;
    if ((await compter(eq(smsPointage.tabletteId, t.id), gt(smsPointage.createdAt, depuis(3600_000)))) >= MAX_PAR_HEURE_TABLETTE) return { ok: false, raison: "TROP_DE_SMS" } as const;
    const code = codeAleatoire(6);
    // La ligne est écrite avant l'envoi : deux demandes simultanées ne font pas partir deux SMS.
    const [ligne] = await tx
      .insert(smsPointage)
      .values({ organisationId: t.organisationId, salarieId: fiche.id, tabletteId: t.id, codeHash: hacherCodeSms(t.organisationId, code), expireLe: new Date(maintenant.getTime() + VALIDITE_CODE_SMS_MS), createdAt: maintenant })
      .returning({ id: smsPointage.id });
    return { ok: true, id: ligne!.id, code, telephone: fiche.telephone } as const;
  });
  if (!prepare.ok) return prepare;
  const parti = await envoyer(prepare.telephone, `Kipointe : votre code de pointage est ${prepare.code}. Valable 5 minutes.`);
  if (!parti) {
    // Rien n'est parti : la ligne ne doit ni être facturée ni bloquer un nouvel essai.
    await withTenant(db, t.organisationId, (tx) => tx.delete(smsPointage).where(eq(smsPointage.id, prepare.id)));
    return { ok: false, raison: "ENVOI_IMPOSSIBLE" };
  }
  return { ok: true, mobile: masquerMobile(prepare.telephone) };
}

/** DANS la transaction du pointage : consomme le code reçu par SMS et rend le salarié, ou null. */
export async function consommerCodeSms(tx: Tx, t: Pick<TabletteConnue, "id" | "organisationId">, code: string, maintenant: Date): Promise<string | null> {
  const pris = await tx
    .update(smsPointage)
    .set({ utiliseLe: maintenant })
    .where(and(eq(smsPointage.organisationId, t.organisationId), eq(smsPointage.tabletteId, t.id), eq(smsPointage.codeHash, hacherCodeSms(t.organisationId, code)), isNull(smsPointage.utiliseLe), gt(smsPointage.expireLe, maintenant)))
    .returning({ salarieId: smsPointage.salarieId });
  return pris[0]?.salarieId ?? null;
}
