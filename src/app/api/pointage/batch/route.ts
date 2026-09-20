import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { terminal } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { contexteTerminal } from "@/lib/auth/terminal";
import { json, lireJson, route } from "@/lib/http";
import { corpsResultat } from "@/lib/pointage/reponse";
import { traiterLot } from "@/lib/pointage/service";
import { pointageBatchSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/pointage/batch { pointages: [...] } → resynchronisation de la file hors ligne (une transaction par pointage). */
export const POST = route(async (req) => {
  const ctx = await contexteTerminal(req);
  const corps = await lireJson(req, pointageBatchSchema);
  const maintenant = new Date();
  const db = getDb();

  const resultats = await traiterLot(
    db,
    ctx,
    corps.pointages.map((p) => ({
      badgeUuid: p.badge_uuid,
      pin: p.pin,
      idempotencyKey: p.idempotency_key,
      horodatageTerminal: new Date(p.horodatage_terminal),
      offsetHorlogeMs: p.offset_horloge_ms ?? null,
      horsLigne: true,
    })),
    maintenant,
  );

  await withTenant(db, ctx.organisation.id, async (tx) => {
    await tx
      .update(terminal)
      .set({ derniereSynchro: maintenant, ...(corps.version_app ? { versionApp: corps.version_app } : {}) })
      .where(eq(terminal.id, ctx.terminal.id));
  });

  return json({
    resultats: resultats.map((r) => ({ idempotency_key: r.idempotencyKey, ...corpsResultat(r, maintenant) })),
    horloge_serveur: maintenant.toISOString(),
  });
});
