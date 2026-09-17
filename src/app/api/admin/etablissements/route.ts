import { asc, eq } from "drizzle-orm";
import { etablissement } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { etablissementVersApi } from "@/lib/api/serialiser";
import { json, lireJson, route } from "@/lib/http";
import { etablissementCreationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = route(async () => {
  return avecGerant(async (tx, u) => {
    const rows = await tx.select().from(etablissement).where(eq(etablissement.organisationId, u.organisationId)).orderBy(asc(etablissement.libelle));
    return json({ etablissements: rows.map(etablissementVersApi) });
  });
});

export const POST = route(async (req) => {
  const corps = await lireJson(req, etablissementCreationSchema);
  return avecGerant(async (tx, u) => {
    const [cree] = await tx
      .insert(etablissement)
      .values({ organisationId: u.organisationId, libelle: corps.libelle, adresse: corps.adresse ?? null, timezone: corps.timezone })
      .returning();
    return json({ etablissement: etablissementVersApi(cree!) }, { status: 201 });
  });
});
