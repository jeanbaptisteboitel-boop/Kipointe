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
  ROLE_INSUFFISANT: "Accès réservé au gérant.",
  IDENTIFIANTS_INVALIDES: "Email ou mot de passe incorrect.",
  DONNEES_INVALIDES: "Données invalides.",
  SALARIE_INTROUVABLE: "Salarié introuvable.",
  RECAP_DEJA_VALIDE: "Ce récapitulatif est déjà validé.",
  SEMAINE_NON_TERMINEE: "La semaine n'est pas terminée : validation possible à partir du lundi 04:00.",
  STOCKAGE_NON_CONFIGURE: "Stockage Scaleway non configuré (variables SCALEWAY_*).",
  RECAP_NON_VALIDE: "Le PDF n'existe qu'après validation.",
  CORRECTION_VIDE: "Indiquez au moins une modification.",
  HORODATAGE_FUTUR: "L'horodatage est dans le futur.",
  AUCUN_ETABLISSEMENT: "Créez d'abord un établissement.",
  TERMINAL_INTROUVABLE: "Terminal introuvable.",
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
