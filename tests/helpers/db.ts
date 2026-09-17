/**
 * Harnais de test : base PostgreSQL en mémoire (PGlite) migrée avec les fichiers de ./drizzle,
 * et une organisation de test appairée à un terminal.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import type { Db, Tx } from "@/db";
import * as schema from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { hacherSecret } from "@/lib/auth/password";
import type { ContexteTerminal } from "@/lib/auth/terminal";
import { sha256Hex } from "@/lib/crypto";
import { enregistrerPointage, type DemandePointage, type ResultatPointage } from "@/lib/pointage/service";

export const PIN_TEST = "1234";

export type Fixture = {
  db: Db;
  client: PGlite;
  ctx: ContexteTerminal;
  organisation: schema.Organisation;
  etablissement: schema.Etablissement;
  terminal: schema.Terminal;
  salaries: schema.Salarie[];
  gerant: schema.Utilisateur;
  fermer: () => Promise<void>;
};

export async function creerDbTest(): Promise<{ db: Db; client: PGlite }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db: db as unknown as Db, client };
}

export async function creerFixture(options: { nbSalaries?: number; organisation?: Partial<schema.Organisation> } = {}): Promise<Fixture> {
  const { db, client } = await creerDbTest();
  const token = "token-de-test-" + randomUUID();
  const pinHash = await hacherSecret(PIN_TEST);

  const fx = await withBypass(db, async (tx) => {
    const [org] = await tx
      .insert(schema.organisation)
      .values({ raisonSociale: "Restaurant Test", siret: "12345678900012", ...options.organisation })
      .returning();
    const [etab] = await tx
      .insert(schema.etablissement)
      .values({ organisationId: org!.id, libelle: "Salle", timezone: "Europe/Paris" })
      .returning();
    const [term] = await tx
      .insert(schema.terminal)
      .values({ organisationId: org!.id, etablissementId: etab!.id, libelle: "Tablette", tokenHash: sha256Hex(token), appaireLe: new Date() })
      .returning();
    const [gerant] = await tx
      .insert(schema.utilisateur)
      .values({ organisationId: org!.id, email: "gerant@test.fr", nom: "Test", prenom: "Gérant", motDePasseHash: pinHash, role: "GERANT" })
      .returning();
    const salaries: schema.Salarie[] = [];
    for (let i = 0; i < (options.nbSalaries ?? 2); i++) {
      const [s] = await tx
        .insert(schema.salarie)
        .values({ organisationId: org!.id, nom: `Salarie${i + 1}`, prenom: `Prenom${i + 1}`, matricule: String(i + 1), etablissementDefautId: etab!.id, pinHash })
        .returning();
      salaries.push(s!);
    }
    return { org: org!, etab: etab!, term: term!, gerant: gerant!, salaries };
  });

  const ctx: ContexteTerminal = { terminal: fx.term, organisation: fx.org, etablissement: fx.etab, token };
  return {
    db,
    client,
    ctx,
    organisation: fx.org,
    etablissement: fx.etab,
    terminal: fx.term,
    salaries: fx.salaries,
    gerant: fx.gerant,
    fermer: () => client.close(),
  };
}

/** Pointage en ligne, dans sa propre transaction tenant. */
export async function pointer(
  fx: Fixture,
  salarie: schema.Salarie,
  maintenant: Date,
  options: Partial<DemandePointage> & { pin?: string } = {},
): Promise<ResultatPointage> {
  return withTenant(fx.db, fx.organisation.id, (tx) =>
    enregistrerPointage(
      tx,
      fx.ctx,
      {
        badgeUuid: salarie.badgeUuid,
        pin: options.pin ?? PIN_TEST,
        idempotencyKey: options.idempotencyKey ?? randomUUID(),
        horodatageTerminal: options.horodatageTerminal ?? maintenant,
        offsetHorlogeMs: options.offsetHorlogeMs ?? 0,
        horsLigne: options.horsLigne ?? false,
      },
      maintenant,
    ),
  );
}

export function dansTenant<T>(fx: Fixture, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(fx.db, fx.organisation.id, fn);
}

/** Instant UTC pour une heure locale Europe/Paris « YYYY-MM-DD HH:mm ». */
export function paris(local: string): Date {
  const [date, heure] = local.split(" ") as [string, string];
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  const [h, mn] = heure.split(":").map(Number) as [number, number];
  // Recherche du décalage applicable (+1 ou +2) via Intl.
  for (const offset of [1, 2]) {
    const candidat = new Date(Date.UTC(a, m - 1, j, h - offset, mn));
    const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(candidat);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value;
    if (Number(get("year")) === a && Number(get("month")) === m && Number(get("day")) === j && Number(get("hour")) % 24 === h && Number(get("minute")) === mn) {
      return candidat;
    }
  }
  throw new Error(`heure locale invalide : ${local}`);
}
