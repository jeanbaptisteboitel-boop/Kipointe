import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { creerFixture } from "./helpers/db";

/**
 * PGlite tourne en superutilisateur (qui ignore toujours la RLS) : on bascule sur un rôle
 * applicatif pour vérifier l'isolation des tenants.
 */
describe("Row Level Security", () => {
  it("n'expose aucune ligne sans tenant, et seulement celles du tenant courant sinon", async () => {
    const fx = await creerFixture({ nbSalaries: 1 });
    try {
      const autreOrg = await withBypass(fx.db, async (tx) => {
        const [o] = await tx.insert(schema.organisation).values({ raisonSociale: "Autre" }).returning();
        await tx.insert(schema.etablissement).values({ organisationId: o!.id, libelle: "Ailleurs" });
        return o!;
      });

      let roleDisponible = true;
      try {
        await fx.client.exec(`
          CREATE ROLE appli_test LOGIN;
          GRANT USAGE ON SCHEMA public TO appli_test;
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appli_test;
        `);
      } catch {
        roleDisponible = false;
      }
      if (!roleDisponible) {
        console.warn("PGlite sans support des rôles : test RLS ignoré.");
        return;
      }

      // Sans set_config : rien.
      const sansTenant = await fx.db.transaction(async (tx) => {
        await tx.execute(sql`set local role appli_test`);
        return tx.select().from(schema.etablissement);
      });
      expect(sansTenant).toHaveLength(0);

      // Avec le tenant : uniquement ses lignes.
      const avecTenant = await withTenant(fx.db, fx.organisation.id, async (tx) => {
        await tx.execute(sql`set local role appli_test`);
        return tx.select().from(schema.etablissement);
      });
      expect(avecTenant.map((e) => e.organisationId)).toEqual([fx.organisation.id]);

      // Insertion dans une autre organisation refusée par WITH CHECK.
      await expect(
        withTenant(fx.db, fx.organisation.id, async (tx) => {
          await tx.execute(sql`set local role appli_test`);
          await tx.insert(schema.etablissement).values({ organisationId: autreOrg.id, libelle: "Intrusion" });
        }),
      ).rejects.toThrow();

      // Le bypass (auth, exploitation) voit tout.
      const tout = await withBypass(fx.db, async (tx) => {
        await tx.execute(sql`set local role appli_test`);
        return tx.select().from(schema.etablissement);
      });
      expect(tout).toHaveLength(2);
    } finally {
      await fx.fermer();
    }
  });
});
