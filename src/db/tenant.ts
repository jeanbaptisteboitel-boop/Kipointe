/**
 * Positionnement du tenant pour les policies RLS.
 *
 * Chaque transaction métier DOIT appeler `setTenant(tx, organisationId)` avant toute requête :
 * les policies (drizzle/0001_rls.sql) ne laissent passer que les lignes de l'organisation
 * courante. `setBypass` n'est utilisé que pour résoudre l'authentification (on ne connaît
 * pas encore l'organisation) et pour les tâches d'exploitation (purge).
 */
import { sql } from "drizzle-orm";
import type { Db, Tx } from "./index";

export async function setTenant(tx: Tx, organisationId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.organisation_id', ${organisationId}, true)`);
  await tx.execute(sql`select set_config('app.bypass_rls', 'off', true)`);
}

export async function setBypass(tx: Tx): Promise<void> {
  await tx.execute(sql`select set_config('app.bypass_rls', 'on', true)`);
}

/** Exécute `fn` dans une transaction limitée à l'organisation `organisationId`. */
export async function withTenant<T>(db: Db, organisationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenant(tx, organisationId);
    return fn(tx);
  });
}

/** Exécute `fn` sans filtre tenant (authentification, exploitation). À utiliser avec parcimonie. */
export async function withBypass<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setBypass(tx);
    return fn(tx);
  });
}
