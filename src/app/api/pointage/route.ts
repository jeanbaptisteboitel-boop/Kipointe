import { avecTerminal } from "@/lib/auth/terminal";
import { extraireBearer, HttpError, lireJson, route } from "@/lib/http";
import { reponseResultat } from "@/lib/pointage/reponse";
import { enregistrerPointage } from "@/lib/pointage/service";
import { pointageSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/pointage { badge_uuid, pin, idempotency_key, horodatage_terminal, offset_horloge_ms } [auth terminal]. */
export const POST = route(async (req) => {
  if (!extraireBearer(req)) throw new HttpError(401, "TOKEN_TERMINAL_MANQUANT");
  const corps = await lireJson(req, pointageSchema);
  const maintenant = new Date();
  const res = await avecTerminal(req, (tx, ctx) =>
    enregistrerPointage(
      tx,
      ctx,
      {
        badgeUuid: corps.badge_uuid,
        pin: corps.pin,
        idempotencyKey: corps.idempotency_key,
        horodatageTerminal: corps.horodatage_terminal ? new Date(corps.horodatage_terminal) : null,
        offsetHorlogeMs: corps.offset_horloge_ms ?? null,
        horsLigne: false,
      },
      maintenant,
    ),
  );
  return reponseResultat(res, maintenant);
});
