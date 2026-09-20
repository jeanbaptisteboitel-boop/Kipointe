import { asc, eq } from "drizzle-orm";
import { etablissement, terminal } from "@/db/schema";
import { avecGerant } from "@/lib/api/admin";
import { terminalVersApi } from "@/lib/api/serialiser";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { terminalCreationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = route(async () => {
  return avecGerant(async (tx, u) => {
    const rows = await tx.select().from(terminal).where(eq(terminal.organisationId, u.organisationId)).orderBy(asc(terminal.libelle));
    return json({ terminaux: rows.map(terminalVersApi) });
  });
});

export const POST = route(async (req) => {
  const corps = await lireJson(req, terminalCreationSchema);
  return avecGerant(async (tx, u) => {
    const etab = await tx.query.etablissement.findFirst({ where: eq(etablissement.id, corps.etablissement_id) });
    if (!etab || etab.organisationId !== u.organisationId) throw new HttpError(404, "ETABLISSEMENT_INTROUVABLE");
    const [cree] = await tx.insert(terminal).values({ organisationId: u.organisationId, etablissementId: etab.id, libelle: corps.libelle }).returning();
    return json({ terminal: terminalVersApi(cree!) }, { status: 201 });
  });
});
