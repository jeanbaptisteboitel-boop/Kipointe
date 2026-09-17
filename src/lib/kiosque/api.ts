import type { ElementFile, ReponsePointage, SalarieCache } from "./types";

export class ErreurReseau extends Error {}

async function requete<T>(chemin: string, init: RequestInit, token: string | null, timeoutMs = 8000): Promise<{ status: number; corps: T }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let reponse: Response;
  try {
    reponse = await fetch(chemin, {
      ...init,
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
  } catch (err) {
    throw new ErreurReseau((err as Error).message);
  } finally {
    clearTimeout(timer);
  }
  if (reponse.status >= 500) throw new ErreurReseau(`HTTP ${reponse.status}`);
  const corps = (await reponse.json().catch(() => ({}))) as T;
  return { status: reponse.status, corps };
}

export const api = {
  appairer(code: string, identifiantMateriel: string | null, versionApp: string | null) {
    return requete<Record<string, unknown>>("/api/terminal/appairage", { method: "POST", body: JSON.stringify({ code_appairage: code, identifiant_materiel: identifiantMateriel ?? undefined, version_app: versionApp ?? undefined }) }, null);
  },
  pointer(token: string, item: Pick<ElementFile, "badge_uuid" | "pin" | "idempotency_key" | "horodatage_terminal" | "offset_horloge_ms">) {
    return requete<ReponsePointage>("/api/pointage", { method: "POST", body: JSON.stringify(item) }, token);
  },
  lot(token: string, items: ElementFile[], versionApp: string | null) {
    const pointages = items.map(({ badge_uuid, pin, idempotency_key, horodatage_terminal, offset_horloge_ms }) => ({ badge_uuid, pin, idempotency_key, horodatage_terminal, offset_horloge_ms }));
    return requete<{ resultats: ({ idempotency_key: string } & ReponsePointage)[]; horloge_serveur: string }>(
      "/api/pointage/batch",
      { method: "POST", body: JSON.stringify({ pointages, version_app: versionApp ?? undefined }) },
      token,
      30_000,
    );
  },
  heartbeat(token: string, versionApp: string | null) {
    const q = versionApp ? `?version_app=${encodeURIComponent(versionApp)}` : "";
    return requete<{ horloge_serveur: string; version_app_attendue: string | null }>(`/api/terminal/heartbeat${q}`, { method: "GET" }, token);
  },
  salaries(token: string) {
    return requete<{ salaries: SalarieCache[] }>("/api/terminal/salaries", { method: "GET" }, token);
  },
};
