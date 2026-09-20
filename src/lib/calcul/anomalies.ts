/**
 * Synchronisation des anomalies calculées (moteur hebdo) avec la table `anomalie`.
 * Les anomalies « événementielles » (PIN_VERROUILLE, POINTAGE_HORS_LIGNE, DOUBLE_SCAN) sont
 * créées au fil de l'eau par le service de pointage et ne sont jamais supprimées ici.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { anomalie, type TypeAnomalie } from "@/db/schema";
import type { AnomalieDetectee } from "./semaine";

export const TYPES_ANOMALIE_CALCULES: TypeAnomalie[] = [
  "OUBLI_SORTIE",
  "HORS_PLAGE",
  "REPOS_11H",
  "REPOS_HEBDO",
  "PAUSE_MANQUANTE",
  "AMPLITUDE",
];

export async function synchroniserAnomalies(
  tx: Tx,
  organisationId: string,
  salarieId: string,
  jours: string[],
  detectees: AnomalieDetectee[],
): Promise<void> {
  const dansPlage = detectees.filter((a) => jours.includes(a.dateJour) && TYPES_ANOMALIE_CALCULES.includes(a.type));

  // Dédoublonnage (org, salarié, jour, type) : on fusionne les détails.
  const parCle = new Map<string, AnomalieDetectee>();
  for (const a of dansPlage) {
    const cle = `${a.dateJour}|${a.type}`;
    const existante = parCle.get(cle);
    if (existante) {
      existante.detail = { ...existante.detail, autres: [...((existante.detail.autres as unknown[]) ?? []), a.detail] };
    } else {
      parCle.set(cle, { ...a, detail: { ...a.detail } });
    }
  }
  const aConserver = [...parCle.values()];

  if (aConserver.length > 0) {
    await tx
      .insert(anomalie)
      .values(
        aConserver.map((a) => ({
          organisationId,
          salarieId,
          dateJour: a.dateJour,
          type: a.type,
          detail: a.detail,
        })),
      )
      .onConflictDoUpdate({
        target: [anomalie.organisationId, anomalie.salarieId, anomalie.dateJour, anomalie.type],
        set: { detail: sql`excluded.detail` },
      });
  }

  // Les anomalies calculées encore OUVERTES qui ne sont plus détectées (après correction) disparaissent.
  const clesConservees = aConserver.map((a) => `${a.dateJour}|${a.type}`);
  const existantes = await tx
    .select({ id: anomalie.id, dateJour: anomalie.dateJour, type: anomalie.type })
    .from(anomalie)
    .where(
      and(
        eq(anomalie.organisationId, organisationId),
        eq(anomalie.salarieId, salarieId),
        eq(anomalie.statut, "OUVERTE"),
        inArray(anomalie.dateJour, jours),
        inArray(anomalie.type, TYPES_ANOMALIE_CALCULES),
      ),
    );
  const aSupprimer = existantes.filter((e) => !clesConservees.includes(`${e.dateJour}|${e.type}`)).map((e) => e.id);
  if (aSupprimer.length > 0) {
    await tx.delete(anomalie).where(and(inArray(anomalie.id, aSupprimer), notInArray(anomalie.statut, ["TRAITEE", "IGNOREE"])));
  }
}
