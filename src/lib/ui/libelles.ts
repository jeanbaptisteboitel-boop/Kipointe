import type { TypeAnomalie } from "@/db/schema";

export const LIBELLES_ANOMALIE: Record<TypeAnomalie, string> = {
  OUBLI_SORTIE: "Oubli de sortie",
  DOUBLE_SCAN: "Double scan",
  HORS_PLAGE: "Pointage incohérent",
  REPOS_11H: "Repos quotidien < 11 h",
  REPOS_HEBDO: "Repos hebdomadaire < 35 h",
  PAUSE_MANQUANTE: "Pause manquante",
  AMPLITUDE: "Amplitude > 13 h",
  PIN_VERROUILLE: "PIN verrouillé",
  POINTAGE_HORS_LIGNE: "Pointage hors ligne",
};

export const LIBELLES_SOURCE: Record<string, string> = {
  KIOSQUE: "Tablette",
  KIOSQUE_HORS_LIGNE: "Tablette (hors ligne)",
  SAISIE_MANUELLE: "Saisie manuelle",
};

export const LIBELLES_ACTION: Record<string, string> = {
  "salarie.creer": "Création d'un salarié",
  "salarie.consulter": "Consultation d'une fiche salarié",
  "salarie.modifier": "Modification d'un salarié",
  "badge.regenerer": "Régénération d'un badge",
  "badge.deverrouiller": "Déverrouillage d'un badge",
  "pin.reinitialiser": "Réinitialisation d'un PIN",
  "recap.consulter": "Consultation des pointages",
  "recap.valider": "Validation d'un récap hebdo",
  "recap.pdf": "Téléchargement d'un récap PDF",
  "pointage.corriger": "Correction d'un pointage",
  "pointage.saisie_manuelle": "Saisie manuelle d'un pointage",
  "pointages.consulter": "Consultation des pointages",
  "pointages.export": "Export CSV des pointages",
  "anomalie.statut": "Traitement d'une anomalie",
  "organisation.parametres": "Modification des paramètres",
};
