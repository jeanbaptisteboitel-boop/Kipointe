import { eq } from "drizzle-orm";
import { terminal } from "@/db/schema";
import { avecTerminal } from "@/lib/auth/terminal";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";

/** GET /api/terminal/heartbeat → horloge serveur (calcul de l'offset), version attendue, état. Appelé toutes les 5 min. */
export const GET = route(async (req) => {
  const maintenant = new Date();
  const versionApp = new URL(req.url).searchParams.get("version_app");
  return avecTerminal(req, async (tx, ctx) => {
    await tx
      .update(terminal)
      .set({ derniereSynchro: maintenant, ...(versionApp ? { versionApp } : {}) })
      .where(eq(terminal.id, ctx.terminal.id));
    return json({
      horloge_serveur: maintenant.toISOString(),
      version_app_attendue: process.env.KIOSQUE_APK_VERSION ?? null,
      terminal: { id: ctx.terminal.id, libelle: ctx.terminal.libelle },
      etablissement: { id: ctx.etablissement.id, libelle: ctx.etablissement.libelle, timezone: ctx.etablissement.timezone },
      organisation: { id: ctx.organisation.id, raison_sociale: ctx.organisation.raisonSociale, anti_doublon_secondes: ctx.organisation.antiDoublonSecondes },
    });
  });
});
