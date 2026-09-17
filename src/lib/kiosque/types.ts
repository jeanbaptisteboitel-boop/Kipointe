export type ConfigTerminal = {
  token: string;
  terminal: { id: string; libelle: string };
  etablissement: { id: string; libelle: string; timezone: string };
  organisation: { id: string; raison_sociale: string; anti_doublon_secondes: number };
  appaire_le: string;
};

export type ElementFile = {
  idempotency_key: string;
  badge_uuid: string;
  pin: string;
  horodatage_terminal: string;
  offset_horloge_ms: number;
  prenom: string | null;
  type_estime: TypePointage | null;
  cree_le: string;
  tentatives: number;
};

export type TypePointage = "ENTREE" | "SORTIE" | "DEBUT_PAUSE" | "FIN_PAUSE";

export type SalarieCache = { badge_uuid: string; prenom: string; pin_version: number };
export type VerificateurCache = { badge_uuid: string; pin_version: number; verificateur: string };
export type DernierPointageCache = { badge_uuid: string; type: TypePointage; horodatage: string };

export type ReponsePointage =
  | {
      statut: "OK" | "REJOUE";
      pointage: { id: string; type: TypePointage; horodatage: string; source: string };
      salarie: { id: string; prenom: string; badge_uuid: string; pin_version: number };
      total_jour_minutes: number;
      verificateur_hors_ligne: string | null;
      horloge_serveur: string;
    }
  | {
      statut: "ERREUR";
      erreur: { code: string; message: string; detail: Record<string, unknown> | null };
      prenom: string | null;
      horloge_serveur: string;
    };

export type ResultatLocal =
  | { ok: true; type: TypePointage | null; horodatage: Date; totalJourMinutes: number | null; horsLigne: boolean; prenom: string | null }
  | { ok: false; code: string; message: string; detail?: Record<string, unknown> | null; conserverBadge: boolean };

export type EtatReseau = {
  enLigne: boolean;
  enAttente: number;
  derniereSynchro: string | null;
  offsetMs: number;
  synchroEnCours: boolean;
};

export const LIBELLES_TYPE: Record<TypePointage, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  DEBUT_PAUSE: "Début de pause",
  FIN_PAUSE: "Fin de pause",
};

export const TYPE_SUIVANT: Record<TypePointage, TypePointage> = {
  ENTREE: "SORTIE",
  SORTIE: "ENTREE",
  DEBUT_PAUSE: "FIN_PAUSE",
  FIN_PAUSE: "SORTIE",
};
