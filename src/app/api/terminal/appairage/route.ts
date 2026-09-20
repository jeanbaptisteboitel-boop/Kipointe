import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { terminal } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { normaliserCodeAppairage, sha256Hex, tokenAleatoire } from "@/lib/crypto";
import { HttpError, json, lireJson, route } from "@/lib/http";
import { appairageSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/terminal/appairage { code_appairage } → token terminal (à usage unique, 15 min). */
export const POST = route(async (req) => {
  const corps = await lireJson(req, appairageSchema);
  const code = normaliserCodeAppairage(corps.code_appairage);
  if (code.length !== 8) throw new HttpError(400, "CODE_INVALIDE");
  const maintenant = new Date();

  const resultat = await withBypass(getDb(), async (tx) => {
    const t = await tx.query.terminal.findFirst({
      where: and(eq(terminal.codeAppairageHash, sha256Hex(code)), gt(terminal.codeAppairageExpireLe, maintenant), eq(terminal.actif, true)),
      with: { etablissement: true, organisation: true },
    });
    if (!t) return null;
    const token = tokenAleatoire(32);
    await tx
      .update(terminal)
      .set({
        tokenHash: sha256Hex(token),
        codeAppairageHash: null,
        codeAppairageExpireLe: null,
        appaireLe: maintenant,
        derniereSynchro: maintenant,
        identifiantMateriel: corps.identifiant_materiel ?? null,
        versionApp: corps.version_app ?? null,
      })
      .where(eq(terminal.id, t.id));
    return { t, token };
  });

  if (!resultat) throw new HttpError(404, "CODE_INCONNU_OU_EXPIRE");
  const { t, token } = resultat;
  return json({
    token,
    terminal: { id: t.id, libelle: t.libelle },
    etablissement: { id: t.etablissement.id, libelle: t.etablissement.libelle, timezone: t.etablissement.timezone },
    organisation: { id: t.organisation.id, raison_sociale: t.organisation.raisonSociale, anti_doublon_secondes: t.organisation.antiDoublonSecondes },
    horloge_serveur: maintenant.toISOString(),
  });
});
