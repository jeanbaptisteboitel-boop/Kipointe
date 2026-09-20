/**
 * Vue « effective » des pointages : la table `pointage` n'est jamais modifiée ; les corrections
 * (additives) sont appliquées à la lecture, la plus récente l'emportant.
 */
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Tx } from "@/db";
import { correction, pointage, type Correction, type Pointage, type SourcePointage, type TypePointage } from "@/db/schema";

export type PointageEffectif = {
  id: string;
  salarieId: string;
  etablissementId: string;
  terminalId: string | null;
  horodatage: Date;
  type: TypePointage;
  source: SourcePointage;
  corrige: boolean;
  motif: string | null;
  original: { horodatage: Date; type: TypePointage };
};

export function appliquerCorrections(pointages: Pointage[], corrections: Correction[]): PointageEffectif[] {
  const derniere = new Map<string, Correction>();
  for (const c of [...corrections].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    derniere.set(c.pointageId, c);
  }
  const resultat: PointageEffectif[] = [];
  for (const p of pointages) {
    const c = derniere.get(p.id);
    if (c?.nouvelleValeur.annule) continue;
    resultat.push({
      id: p.id,
      salarieId: p.salarieId,
      etablissementId: p.etablissementId,
      terminalId: p.terminalId,
      horodatage: c?.nouvelleValeur.horodatage ? new Date(c.nouvelleValeur.horodatage) : p.horodatageEffectif,
      type: c?.nouvelleValeur.type ?? p.type,
      source: p.source,
      corrige: !!c,
      motif: c?.motif ?? p.motif,
      original: { horodatage: p.horodatageEffectif, type: p.type },
    });
  }
  return resultat.sort((a, b) => a.horodatage.getTime() - b.horodatage.getTime());
}

const MARGE_MS = 2 * 24 * 3600 * 1000;

/** Pointages effectifs d'un salarié sur [de, a), corrections appliquées. */
export async function chargerPointagesEffectifs(
  tx: Tx,
  organisationId: string,
  salarieId: string,
  de: Date,
  a: Date,
): Promise<PointageEffectif[]> {
  const rows = await tx
    .select()
    .from(pointage)
    .where(
      and(
        eq(pointage.organisationId, organisationId),
        eq(pointage.salarieId, salarieId),
        gte(pointage.horodatageEffectif, new Date(de.getTime() - MARGE_MS)),
        lt(pointage.horodatageEffectif, new Date(a.getTime() + MARGE_MS)),
      ),
    )
    .orderBy(asc(pointage.horodatageEffectif));
  const ids = rows.map((r) => r.id);
  const corrections =
    ids.length === 0
      ? []
      : await tx.select().from(correction).where(inArray(correction.pointageId, ids)).orderBy(asc(correction.createdAt));
  return appliquerCorrections(rows, corrections).filter((p) => p.horodatage >= de && p.horodatage < a);
}
