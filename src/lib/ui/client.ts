"use client";

/** Appel d'une route API interne avec gestion homogène des erreurs `{ erreur: { code, detail } }`. */
export class ErreurApi extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: unknown,
  ) {
    super(MESSAGES[code] ?? code);
  }
}

const MESSAGES: Record<string, string> = {
  NON_CONNECTE: "Session expirée : reconnectez-vous.",
  IDENTIFIANTS_INVALIDES: "Adresse e-mail ou mot de passe incorrect.",
  TROP_DE_TENTATIVES: "Trop de tentatives : réessayez dans un quart d'heure.",
  DONNEES_INVALIDES: "Données invalides.",
  ERREUR_INTERNE: "Erreur interne, réessayez.",
};

export async function appelApi<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...reste } = init;
  const reponse = await fetch(url, {
    ...reste,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(reste.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : reste.body,
    credentials: "same-origin",
  });
  if (reponse.status === 204) return undefined as T;
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    const code = corps?.erreur?.code ?? `HTTP_${reponse.status}`;
    throw new ErreurApi(reponse.status, code, corps?.erreur?.detail);
  }
  return corps as T;
}
