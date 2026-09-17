/**
 * Moteur de calcul hebdomadaire (brief §8).
 *
 * - Semaine ISO du lundi au dimanche, journées rattachées à `journeeDebutHeure`.
 * - Temps effectif = somme des intervalles entrée → sortie (les pauses sont hors intervalle).
 * - Heures supplémentaires par paliers paramétrables (légal : +25 % 36e-43e, +50 % au-delà ; HCR différent).
 * - Alertes générées, jamais bloquantes : repos quotidien, repos hebdomadaire, pause obligatoire, amplitude.
 */
import type { Organisation, PalierHeuresSup, TypeAnomalie, DetailJourRecap, DetailHeuresSup } from "@/db/schema";
import { PALIERS_HEURES_SUP_DEFAUT } from "@/db/schema";
import type { PointageEffectif } from "./effectifs";
import { bornesSemaine, dateJournee, type ParametresJournee } from "@/lib/temps/journee";

export type ParametresCalcul = ParametresJournee & {
  dureeHebdoReference: number;
  paliersHeuresSup: PalierHeuresSup[];
  reposQuotidienMin: number;
  reposHebdoMin: number;
  pauseObligatoireApres: number;
  pauseDureeMin: number;
  amplitudeMax: number;
};

export function parametresDepuis(org: Organisation, timezone: string): ParametresCalcul {
  const paliers =
    org.paliersHeuresSup && org.paliersHeuresSup.length > 0
      ? org.paliersHeuresSup
      : PALIERS_HEURES_SUP_DEFAUT.map((p, i) => (i === 0 ? { ...p, seuilHeures: org.dureeHebdoReference / 60 } : p));
  return {
    timezone,
    journeeDebutHeure: org.journeeDebutHeure,
    dureeHebdoReference: org.dureeHebdoReference,
    paliersHeuresSup: paliers,
    reposQuotidienMin: org.reposQuotidienMin,
    reposHebdoMin: org.reposHebdoMin,
    pauseObligatoireApres: org.pauseObligatoireApres,
    pauseDureeMin: org.pauseDureeMin,
    amplitudeMax: org.amplitudeMax,
  };
}

export type Intervalle = {
  debut: Date;
  fin: Date | null;
  minutes: number;
  /** Fermé par un DEBUT_PAUSE (pause explicite) plutôt qu'une SORTIE. */
  pause: boolean;
  debutId: string;
  finId: string | null;
  /** Ouvert et toujours en cours au moment du calcul (pas une anomalie). */
  enCours: boolean;
};

export type AnomalieDetectee = { type: TypeAnomalie; dateJour: string; detail: Record<string, unknown> };

export type Journee = {
  date: string;
  intervalles: Intervalle[];
  minutes: number;
  amplitudeMinutes: number;
  anomalies: AnomalieDetectee[];
  enCours: boolean;
};

export type ResultatSemaine = {
  annee: number;
  semaine: number;
  debut: Date;
  fin: Date;
  jours: Journee[];
  totalMinutes: number;
  heuresSup: DetailHeuresSup;
  anomalies: AnomalieDetectee[];
  /** La semaine est-elle terminée au moment du calcul ? */
  terminee: boolean;
};

const MINUTE = 60_000;
/** Les pointages fournis au moteur doivent commencer 2 jours avant la semaine (repos, intervalles à cheval). */
export const MARGE_DONNEES_AVANT_MS = 2 * 24 * 3600 * 1000;
/** … et se terminer 1 jour après (sortie d'un service de nuit du dimanche). */
export const MARGE_DONNEES_APRES_MS = 24 * 3600 * 1000;

function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MINUTE);
}

/**
 * Transforme une suite chronologique de pointages en intervalles de travail.
 * Un intervalle ouvert depuis plus de `amplitudeMax` est un oubli de sortie.
 */
export function construireIntervalles(
  pointages: PointageEffectif[],
  p: ParametresCalcul,
  maintenant: Date,
): { intervalles: Intervalle[]; anomalies: AnomalieDetectee[] } {
  const intervalles: Intervalle[] = [];
  const anomalies: AnomalieDetectee[] = [];
  let ouvert: { debut: Date; id: string } | null = null;

  const fermerEnOubli = (o: { debut: Date; id: string }) => {
    intervalles.push({ debut: o.debut, fin: null, minutes: 0, pause: false, debutId: o.id, finId: null, enCours: false });
    anomalies.push({
      type: "OUBLI_SORTIE",
      dateJour: dateJournee(o.debut, p),
      detail: { pointageId: o.id, horodatage: o.debut.toISOString() },
    });
  };

  for (const pt of pointages) {
    const estEntree = pt.type === "ENTREE" || pt.type === "FIN_PAUSE";
    if (estEntree) {
      if (ouvert) {
        if (diffMinutes(ouvert.debut, pt.horodatage) > p.amplitudeMax) {
          fermerEnOubli(ouvert);
          ouvert = { debut: pt.horodatage, id: pt.id };
        } else {
          anomalies.push({
            type: "HORS_PLAGE",
            dateJour: dateJournee(pt.horodatage, p),
            detail: { motif: "double_entree", pointageId: pt.id, horodatage: pt.horodatage.toISOString() },
          });
        }
      } else {
        ouvert = { debut: pt.horodatage, id: pt.id };
      }
    } else {
      if (ouvert) {
        if (diffMinutes(ouvert.debut, pt.horodatage) > p.amplitudeMax) {
          fermerEnOubli(ouvert);
          ouvert = null;
          anomalies.push({
            type: "HORS_PLAGE",
            dateJour: dateJournee(pt.horodatage, p),
            detail: { motif: "sortie_sans_entree", pointageId: pt.id, horodatage: pt.horodatage.toISOString() },
          });
        } else {
          intervalles.push({
            debut: ouvert.debut,
            fin: pt.horodatage,
            minutes: diffMinutes(ouvert.debut, pt.horodatage),
            pause: pt.type === "DEBUT_PAUSE",
            debutId: ouvert.id,
            finId: pt.id,
            enCours: false,
          });
          ouvert = null;
        }
      } else {
        anomalies.push({
          type: "HORS_PLAGE",
          dateJour: dateJournee(pt.horodatage, p),
          detail: { motif: "sortie_sans_entree", pointageId: pt.id, horodatage: pt.horodatage.toISOString() },
        });
      }
    }
  }

  if (ouvert) {
    if (diffMinutes(ouvert.debut, maintenant) > p.amplitudeMax) {
      fermerEnOubli(ouvert);
    } else {
      intervalles.push({ debut: ouvert.debut, fin: null, minutes: 0, pause: false, debutId: ouvert.id, finId: null, enCours: true });
    }
  }

  return { intervalles, anomalies };
}

/** Regroupe les intervalles par journée de pointage (journée du début de l'intervalle). */
export function calculerJournees(intervalles: Intervalle[], p: ParametresCalcul): Map<string, Journee> {
  const journees = new Map<string, Journee>();
  for (const it of intervalles) {
    const date = dateJournee(it.debut, p);
    let j = journees.get(date);
    if (!j) {
      j = { date, intervalles: [], minutes: 0, amplitudeMinutes: 0, anomalies: [], enCours: false };
      journees.set(date, j);
    }
    j.intervalles.push(it);
  }

  for (const j of journees.values()) {
    j.minutes = j.intervalles.reduce((s, it) => s + it.minutes, 0);
    j.enCours = j.intervalles.some((it) => it.enCours);
    const premier = j.intervalles[0]!;
    const dernier = j.intervalles[j.intervalles.length - 1]!;
    const finDerniere = dernier.fin ?? dernier.debut;
    j.amplitudeMinutes = diffMinutes(premier.debut, finDerniere);

    const fermes = j.intervalles.filter((it) => it.fin !== null);
    if (fermes.length === j.intervalles.length && j.amplitudeMinutes > p.amplitudeMax) {
      j.anomalies.push({
        type: "AMPLITUDE",
        dateJour: j.date,
        detail: { amplitudeMinutes: j.amplitudeMinutes, maxMinutes: p.amplitudeMax },
      });
    }

    // Pause obligatoire : on fusionne les intervalles séparés par moins de `pauseDureeMin`
    // en blocs de travail continu, et on alerte si un bloc dépasse `pauseObligatoireApres`.
    let blocDebut: Date | null = null;
    let blocFin: Date | null = null;
    let alerte: { blocMinutes: number } | null = null;
    for (const it of fermes) {
      if (blocFin && diffMinutes(blocFin, it.debut) >= p.pauseDureeMin) {
        blocDebut = null;
        blocFin = null;
      }
      if (!blocDebut) blocDebut = it.debut;
      blocFin = it.fin!;
      const blocMinutes = diffMinutes(blocDebut, blocFin);
      if (blocMinutes > p.pauseObligatoireApres && (!alerte || blocMinutes > alerte.blocMinutes)) {
        alerte = { blocMinutes };
      }
    }
    if (alerte) {
      j.anomalies.push({
        type: "PAUSE_MANQUANTE",
        dateJour: j.date,
        detail: { travailContinuMinutes: alerte.blocMinutes, seuilMinutes: p.pauseObligatoireApres, pauseMinimaleMinutes: p.pauseDureeMin },
      });
    }
  }
  return journees;
}

/** Ventilation d'un total hebdomadaire en paliers de majoration. */
export function calculerHeuresSup(totalMinutes: number, paliers: PalierHeuresSup[]): DetailHeuresSup {
  const tri = [...paliers].sort((a, b) => a.seuilHeures - b.seuilHeures);
  return tri.map((palier, i) => {
    const debut = palier.seuilHeures * 60;
    const suivant = tri[i + 1];
    const fin = suivant ? suivant.seuilHeures * 60 : Number.POSITIVE_INFINITY;
    return { taux: palier.taux, minutes: Math.max(0, Math.min(totalMinutes, fin) - debut) };
  });
}

/**
 * Calcule la semaine ISO `annee`-W`semaine` d'un salarié.
 * `pointages` doit couvrir une plage plus large que la semaine (2 jours avant, 1 jour après)
 * pour évaluer les repos entre journées et les intervalles à cheval sur la borne.
 */
export function calculerSemaine(
  pointages: PointageEffectif[],
  annee: number,
  semaine: number,
  p: ParametresCalcul,
  maintenant: Date = new Date(),
): ResultatSemaine {
  const { debut, fin, jours } = bornesSemaine(annee, semaine, p);
  const { intervalles, anomalies: anomaliesSequence } = construireIntervalles(pointages, p, maintenant);
  const journees = calculerJournees(intervalles, p);

  const joursSemaine: Journee[] = jours.map(
    (date) => journees.get(date) ?? { date, intervalles: [], minutes: 0, amplitudeMinutes: 0, anomalies: [], enCours: false },
  );
  const dansSemaine = new Set(jours);
  const anomalies: AnomalieDetectee[] = [];

  for (const a of anomaliesSequence) if (dansSemaine.has(a.dateJour)) anomalies.push(a);
  for (const j of joursSemaine) anomalies.push(...j.anomalies);

  // Repos quotidien : entre la dernière sortie d'une journée travaillée et la première entrée de la suivante.
  const toutesJournees = [...journees.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < toutesJournees.length; i++) {
    const jour = toutesJournees[i]!;
    if (!dansSemaine.has(jour.date)) continue;
    const precedente = toutesJournees[i - 1]!;
    const derniereFermee = [...precedente.intervalles].reverse().find((it) => it.fin !== null);
    const premiere = jour.intervalles[0];
    if (!derniereFermee || !premiere) continue;
    const repos = diffMinutes(derniereFermee.fin!, premiere.debut);
    if (repos < p.reposQuotidienMin) {
      anomalies.push({
        type: "REPOS_11H",
        dateJour: jour.date,
        detail: { reposMinutes: repos, minimumMinutes: p.reposQuotidienMin, finVeille: derniereFermee.fin!.toISOString(), reprise: premiere.debut.toISOString() },
      });
    }
  }

  const terminee = maintenant.getTime() >= fin.getTime();

  // Repos hebdomadaire : chaque repos est attribué à la semaine où il se termine (reprise du travail).
  // La semaine est en défaut si aucun repos d'au moins `reposHebdoMin` ne précède l'une de ses reprises :
  // le repos du dimanche soir au lundi compte pour la semaine suivante. Les données chargées commencent
  // `MARGE_DONNEES_AVANT_MS` avant la semaine : sans travail connu dans cette marge, le repos est réputé suffisant.
  if (terminee) {
    const fermes = intervalles.filter((it) => it.fin !== null).sort((a, b) => a.debut.getTime() - b.debut.getTime());
    const donneesDebut = new Date(debut.getTime() - MARGE_DONNEES_AVANT_MS);
    let maxRepos = 0;
    let reprises = 0;
    for (let i = 0; i < fermes.length; i++) {
      const courant = fermes[i]!;
      if (courant.debut < debut || courant.debut >= fin) continue;
      reprises++;
      const precedent = fermes[i - 1];
      const repos = precedent ? diffMinutes(precedent.fin!, courant.debut) : diffMinutes(donneesDebut, courant.debut);
      maxRepos = Math.max(maxRepos, repos);
    }
    if (reprises > 0 && maxRepos < p.reposHebdoMin) {
      anomalies.push({
        type: "REPOS_HEBDO",
        dateJour: jours[6]!,
        detail: { reposMaxMinutes: maxRepos, minimumMinutes: p.reposHebdoMin },
      });
    }
  }

  const totalMinutes = joursSemaine.reduce((s, j) => s + j.minutes, 0);
  const heuresSup = calculerHeuresSup(totalMinutes, p.paliersHeuresSup);

  return { annee, semaine, debut, fin, jours: joursSemaine, totalMinutes, heuresSup, anomalies, terminee };
}

/** Sérialisation du détail des jours pour le récap figé. */
export function detailJoursRecap(res: ResultatSemaine): DetailJourRecap[] {
  return res.jours.map((j) => ({
    date: j.date,
    minutes: j.minutes,
    amplitudeMinutes: j.amplitudeMinutes,
    intervalles: j.intervalles.map((it) => ({ debut: it.debut.toISOString(), fin: it.fin?.toISOString() ?? null, minutes: it.minutes })),
    anomalies: res.anomalies.filter((a) => a.dateJour === j.date).map((a) => a.type),
  }));
}

/** Minutes majorées à un taux donné (colonnes `heures_sup_25` / `heures_sup_50`). */
export function minutesAuTaux(heuresSup: DetailHeuresSup, taux: number): number {
  return heuresSup.filter((h) => h.taux === taux).reduce((s, h) => s + h.minutes, 0);
}
