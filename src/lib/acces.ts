import { getDb, type Tx } from "@/db";
import { withTenant } from "@/db/tenant";
import type { UtilisateurConnecte } from "@/lib/auth/session";

/** Lecture d'une page : transaction limitée à l'organisation de l'utilisateur (RLS). */
export function lire<T>(u: Pick<UtilisateurConnecte, "organisationId">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(getDb(), u.organisationId, fn);
}
