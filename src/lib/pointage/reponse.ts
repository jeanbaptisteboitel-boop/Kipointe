import { NextResponse } from "next/server";
import type { ResultatPointage } from "./service";

/** Sérialisation d'un résultat de pointage vers l'API (snake_case, comme le brief). */
export function corpsResultat(res: ResultatPointage, maintenant: Date) {
  if (res.ok) {
    return {
      statut: res.statut,
      pointage: res.pointage,
      salarie: { id: res.salarie.id, prenom: res.salarie.prenom, badge_uuid: res.salarie.badgeUuid, pin_version: res.salarie.pinVersion },
      total_jour_minutes: res.totalJourMinutes,
      verificateur_hors_ligne: res.verificateurHorsLigne,
      derive_horloge_ms: res.deriveHorlogeMs,
      horloge_serveur: maintenant.toISOString(),
    };
  }
  return {
    statut: "ERREUR" as const,
    erreur: { code: res.code, message: res.message, detail: res.detail ?? null },
    prenom: res.prenom ?? null,
    horloge_serveur: maintenant.toISOString(),
  };
}

export function reponseResultat(res: ResultatPointage, maintenant: Date): NextResponse {
  return NextResponse.json(corpsResultat(res, maintenant), { status: res.ok ? 200 : res.status });
}
