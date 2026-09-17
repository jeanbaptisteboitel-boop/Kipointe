/**
 * Connexion base de données.
 *  - Production (Neon) : driver serverless `@neondatabase/serverless` (WebSocket), transactions interactives
 *    nécessaires au verrouillage par salarié et au positionnement du tenant RLS.
 *  - Développement local / CI : PostgreSQL classique via `pg` lorsque l'URL n'est pas un hôte Neon
 *    (ou si DATABASE_DRIVER=pg).
 */
import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Base quel que soit le driver (Neon en production, pg en local, PGlite dans les tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Transaction quel que soit le driver. */
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __kipointeDb: { db: Db; fermer: () => Promise<void> } | undefined;
}

export function utiliserDriverPg(url: string): boolean {
  if (process.env.DATABASE_DRIVER === "pg") return true;
  if (process.env.DATABASE_DRIVER === "neon") return false;
  return !/\.neon\.tech(:\d+)?\//.test(url) && !/neon\.tech$/.test(new URL(url).hostname);
}

function creerDb(): { db: Db; fermer: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL manquante : configurez la chaîne de connexion Neon (pooled).");
  }
  if (utiliserDriverPg(url)) {
    const pool = new PgPool({ connectionString: url, max: 5 });
    return { db: drizzlePg(pool, { schema }) as unknown as Db, fermer: () => pool.end() };
  }
  // Node < 22 n'a pas de WebSocket global ; Vercel (Node 22) en a un.
  if (typeof globalThis.WebSocket === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    neonConfig.webSocketConstructor = require("ws");
  }
  const pool = new NeonPool({ connectionString: url, max: 3 });
  return { db: drizzleNeon(pool, { schema }) as unknown as Db, fermer: () => pool.end() };
}

/** Singleton par instance de fonction (évite d'ouvrir un pool par module en dev). */
export function getDb(): Db {
  if (!globalThis.__kipointeDb) {
    globalThis.__kipointeDb = creerDb();
  }
  return globalThis.__kipointeDb.db;
}

export async function fermerDb(): Promise<void> {
  await globalThis.__kipointeDb?.fermer();
  globalThis.__kipointeDb = undefined;
}

export { schema };
