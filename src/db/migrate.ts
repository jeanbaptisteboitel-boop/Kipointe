/**
 * Applique les migrations SQL du dossier ./drizzle.
 * Utilisé par `npm run build` (Vercel) et `npm run db:migrate`.
 * Sans DATABASE_URL, on n'échoue pas : le build local reste possible.
 */
import "dotenv/config";
import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool as PgPool } from "pg";
import ws from "ws";
import { utiliserDriverPg } from "./index";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL absente : migrations ignorées.");
    return;
  }
  if (process.env.SKIP_MIGRATIONS === "1") {
    console.warn("[migrate] SKIP_MIGRATIONS=1 : migrations ignorées.");
    return;
  }
  console.log("[migrate] application des migrations…");
  if (utiliserDriverPg(url)) {
    const pool = new PgPool({ connectionString: url, max: 1 });
    await migratePg(drizzlePg(pool), { migrationsFolder: "./drizzle" });
    await pool.end();
  } else {
    if (typeof globalThis.WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    const pool = new NeonPool({ connectionString: url, max: 1 });
    await migrateNeon(drizzleNeon(pool), { migrationsFolder: "./drizzle" });
    await pool.end();
  }
  console.log("[migrate] terminé.");
}

main().catch((err) => {
  console.error("[migrate] échec :", err);
  process.exit(1);
});
