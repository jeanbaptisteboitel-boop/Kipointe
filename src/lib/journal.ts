import type { Tx } from "@/db";
import { journalAcces } from "@/db/schema";

/** Journalise tout accès admin aux données d'un salarié (exigence RGPD du brief §9). */
export async function journaliserAcces(
  tx: Tx,
  entree: {
    organisationId: string;
    utilisateurId: string | null;
    salarieId?: string | null;
    action: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(journalAcces).values({
    organisationId: entree.organisationId,
    utilisateurId: entree.utilisateurId,
    salarieId: entree.salarieId ?? null,
    action: entree.action,
    detail: entree.detail ?? {},
  });
}
