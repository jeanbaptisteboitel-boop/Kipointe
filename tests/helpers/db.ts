/**
 * Harnais de test : base PostgreSQL en mémoire (PGlite) migrée avec les fichiers de ./drizzle,
 * et une organisation cliente avec son administrateur, ses salariés et sa pointeuse.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db, Tx } from "@/db";
import * as schema from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { trouverPointeuse, type PointeuseConnue } from "@/lib/pointeuse/enregistrement";

export type Fixture = {
  db: Db;
  organisation: schema.Organisation;
  admin: schema.Utilisateur;
  salaries: schema.Salarie[];
  pointeuse: PointeuseConnue;
  fermer: () => Promise<void>;
};

export const SN_TEST = "CQUH233560123";

export async function creerDbTest(): Promise<{ db: Db; client: PGlite }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  // PGlite tourne en superutilisateur, qui ignore toujours la RLS : toute la suite s'exécute donc
  // sous un rôle applicatif sans privilège, comme le rôle de l'application en production.
  await client.exec(`
    CREATE ROLE appli_test;
    GRANT USAGE ON SCHEMA public TO appli_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appli_test;
    SET ROLE appli_test;
  `);
  return { db: db as unknown as Db, client };
}

export async function creerOrganisation(db: Db, p: { raisonSociale: string; numeroSerie: string; nbSalaries?: number; email?: string }) {
  return withBypass(db, async (tx) => {
    const [org] = await tx.insert(schema.organisation).values({ raisonSociale: p.raisonSociale }).returning();
    const [admin] = await tx
      .insert(schema.utilisateur)
      .values({ organisationId: org!.id, email: p.email ?? `admin@${p.numeroSerie.toLowerCase()}.test`, nom: "Admin", prenom: "Test", motDePasseHash: "x", role: "ADMIN" })
      .returning();
    const salaries: schema.Salarie[] = [];
    for (let i = 0; i < (p.nbSalaries ?? 2); i++) {
      const [s] = await tx
        .insert(schema.salarie)
        .values({ organisationId: org!.id, nom: `Nom${i + 1}`, prenom: `Prenom${i + 1}`, pointeuseRef: String(i + 1), dateEntree: "2020-01-01" })
        .returning();
      salaries.push(s!);
    }
    await tx.insert(schema.pointeuse).values({ organisationId: org!.id, numeroSerie: p.numeroSerie, nom: "Entrée" });
    return { org: org!, admin: admin!, salaries };
  });
}

export async function creerFixture(options: { nbSalaries?: number } = {}): Promise<Fixture> {
  const { db, client } = await creerDbTest();
  const { org, admin, salaries } = await creerOrganisation(db, { raisonSociale: "Garage Test", numeroSerie: SN_TEST, nbSalaries: options.nbSalaries });
  const pointeuse = (await trouverPointeuse(db, SN_TEST))!;
  return { db, organisation: org, admin, salaries, pointeuse, fermer: () => client.close() };
}

export function dansOrg<T>(fx: Pick<Fixture, "db" | "organisation">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(fx.db, fx.organisation.id, fn);
}

/** Ligne ATTLOG telle que l'appareil l'envoie. */
export function attlog(pin: string, horodatage: string, statut: number | string = 255): string {
  return `${pin}\t${horodatage}\t${statut}\t1\t0\t0`;
}
