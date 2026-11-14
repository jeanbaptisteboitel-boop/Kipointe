/**
 * POINTEUSE — protocole ADMS / « iClock » (push HTTP des appareils ZKTeco et de leurs dérivés
 * NGTeco). Code PUR : ni base, ni réseau. La route est src/app/iclock/[...chemin]/route.ts,
 * l'enregistrement src/lib/pointeuse/enregistrement.ts, le guide docs/POINTEUSE.md.
 *
 * Échanges (réponses en texte brut) :
 *   - GET  /iclock/cdata?SN=…&options=all  → configuration (« poignée de main ») ;
 *   - POST /iclock/cdata?SN=…&table=ATTLOG&Stamp=…  → lignes de badgeage, séparées par des
 *     tabulations : « PIN  AAAA-MM-JJ HH:MM:SS  état  vérification  … » ; réponse « OK: <n> » ;
 *     les autres tables (OPERLOG, ATTPHOTO…) → « OK » ;
 *   - GET  /iclock/getrequest?SN=…  → « OK » (aucune commande) ;
 *   - POST /iclock/devicecmd?SN=…  → « OK ».
 * Certains micrologiciels ajoutent « .aspx » (cdata.aspx…) : reconnu.
 */
import { decalageMinutes, ecartJours, jourLocal } from "@/lib/temps/zone";
import type { TypePointage } from "@/lib/pointage/paires";

export type ModeStatut = "AUTO" | "ALTERNANCE";
export const MODES_STATUT: readonly ModeStatut[] = ["AUTO", "ALTERNANCE"];

/** Taille maximale du corps d'un envoi de l'appareil (octets). */
export const TAILLE_MAX_CORPS_ADMS = 2 * 1024 * 1024;

/** Bornes d'acceptation d'un badgeage, en jours par rapport à aujourd'hui. */
export const JOURS_MAX_FUTUR = 2;
export const JOURS_MAX_PASSE = 60;

/** Numéro de série : lettres, chiffres, « - » et « _ », 4 à 40 caractères, en majuscules ; sinon null. */
export function normaliserNumeroSerie(brut: unknown): string | null {
  const v = String(Array.isArray(brut) ? brut[0] : (brut ?? ""))
    .trim()
    .toUpperCase();
  return /^[A-Z0-9_-]{4,40}$/.test(v) ? v : null;
}

/** Numéro de série MASQUÉ pour les journaux : « CQ…23 ». */
export function masquerNumeroSerie(sn: string): string {
  const v = String(sn ?? "");
  return v.length >= 6 ? `${v.slice(0, 2)}…${v.slice(-2)}` : "…";
}

/**
 * Numéro d'un salarié dans la pointeuse (PIN), comparable à `pointeuseRef` : espaces retirés,
 * zéros de tête retirés pour un numéro purement numérique (« 0002 » = « 2 »).
 */
export function normaliserPin(brut: unknown): string {
  const v = String(brut ?? "").trim();
  return /^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, "") : v;
}

export type RouteAdms = "cdata" | "getrequest" | "devicecmd" | "autre";

/** Route du protocole d'après le chemin après /iclock/ (« cdata », « cdata.aspx »…). */
export function routeAdms(segments: unknown): RouteAdms {
  const liste = Array.isArray(segments) ? segments : [segments];
  const nom = String(liste[liste.length - 1] ?? "")
    .toLowerCase()
    .replace(/\.aspx$/, "");
  return nom === "cdata" || nom === "getrequest" || nom === "devicecmd" ? nom : "autre";
}

/**
 * Configuration rendue à GET /iclock/cdata?options=all.
 *   - Stamp / ATTLOGStamp : dernier repère reçu (« None » au premier contact : l'appareil envoie
 *     alors son historique ; au-delà de 60 jours, il est ignoré) ;
 *   - OpStamp / OPERLOGStamp = 9999 : le journal des opérations n'est pas demandé ;
 *   - TransFlag=TransData AttLog : seuls les badgeages sont envoyés ;
 *   - Realtime=1 : chaque badgeage part aussitôt ; TransTimes : envois complets programmés
 *     chaque jour (rattrapage après une coupure de réseau) ;
 *   - Encrypt=0 : pas de chiffrement propriétaire (HTTPS ou relais) ;
 *   - TimeZone : décalage du fuseau de l'organisation sur UTC à l'instant de la réponse.
 */
export function texteHandshake(p: { numeroSerie: string; stampAttlog?: string | null; maintenant: Date; fuseau: string }): string {
  const stamp = p.stampAttlog && /^\d{1,20}$/.test(p.stampAttlog) ? p.stampAttlog : "None";
  return [
    `GET OPTION FROM: ${p.numeroSerie}`,
    `Stamp=${stamp}`,
    `ATTLOGStamp=${stamp}`,
    "OpStamp=9999",
    "OPERLOGStamp=9999",
    "ATTPHOTOStamp=None",
    "PhotoStamp=None",
    "ErrorDelay=60",
    "Delay=30",
    "TransTimes=00:00;12:00",
    "TransInterval=1",
    "TransFlag=TransData AttLog",
    `TimeZone=${Math.round(decalageMinutes(p.maintenant, p.fuseau) / 60)}`,
    "Realtime=1",
    "Encrypt=0",
    "",
  ].join("\n");
}

export interface LigneAttlog {
  /** PIN normalisé. */
  pin: string;
  /** « AAAA-MM-JJ HH:MM:SS », heure locale de l'appareil. */
  horodatageLocal: string;
  date: string;
  /** « HH:MM » (les secondes ne sont pas reportées sur la semaine). */
  heure: string;
  /** Code d'état (0 entrée, 1 sortie, 2 début de pause, 3 fin de pause, 4/5 heures sup.) ; null si absent. */
  statut: number | null;
  /** Mode de vérification (badge, code…) ; null si absent. */
  verification: number | null;
}

function entierOuNull(v: string | undefined): number | null {
  const t = String(v ?? "").trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}

/**
 * Lit le corps d'un envoi ATTLOG : une ligne par badgeage (LF, CRLF ou CR), champs séparés par
 * des tabulations — ou, à défaut, par des espaces (micrologiciels anciens). Date et heure
 * contrôlées. Lignes illisibles comptées dans `invalides`.
 */
export function parserAttlog(texte: string): { lignes: LigneAttlog[]; invalides: number } {
  const lignes: LigneAttlog[] = [];
  let invalides = 0;
  for (const brute of String(texte ?? "").split(/\r\n|\n|\r/)) {
    const l = brute.replace(/^﻿/, "");
    if (!l.trim()) continue;
    let pin: string | undefined;
    let dt: string;
    let statut: string | undefined;
    let verif: string | undefined;
    if (l.includes("\t")) {
      const champs = l.split("\t");
      [pin, dt, statut, verif] = [champs[0], champs[1] ?? "", champs[2], champs[3]];
    } else {
      const m = /^\s*(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)(?:\s+(\S+))?(?:\s+(\S+))?/.exec(l);
      if (!m) {
        invalides++;
        continue;
      }
      [pin, dt, statut, verif] = [m[1], m[2]!, m[3], m[4]];
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(dt.trim());
    const pinN = normaliserPin(pin);
    if (!m || !pinN || pinN.length > 32) {
      invalides++;
      continue;
    }
    const [, a, mo, j, hh, mi, ss = "00"] = m as unknown as string[];
    const jourOk = new Date(Date.UTC(+a!, +mo! - 1, +j!)).toISOString().slice(0, 10) === `${a}-${mo}-${j}`;
    if (!jourOk || +hh! > 23 || +mi! > 59 || +ss > 59) {
      invalides++;
      continue;
    }
    const h2 = hh!.padStart(2, "0");
    lignes.push({
      pin: pinN,
      horodatageLocal: `${a}-${mo}-${j} ${h2}:${mi}:${ss}`,
      date: `${a}-${mo}-${j}`,
      heure: `${h2}:${mi}`,
      statut: entierOuNull(statut),
      verification: entierOuNull(verif),
    });
  }
  return { lignes, invalides };
}

/**
 * Sens d'un badgeage d'après le code d'état de l'appareil : 0 → arrivée, 1 → départ, 2 → début
 * de pause, 3 → fin de pause, 4 → arrivée (heures sup.), 5 → départ (heures sup.) ; absent, 255
 * ou autre → 'auto' (alternance). Mode ALTERNANCE : toujours 'auto'.
 */
export function typeDepuisStatut(statut: number | null, mode: ModeStatut | string = "AUTO"): TypePointage | "auto" {
  if (mode === "ALTERNANCE") return "auto";
  switch (statut) {
    case 0:
    case 4:
      return "arrivee";
    case 1:
    case 5:
      return "depart";
    case 2:
      return "pause_debut";
    case 3:
      return "pause_fin";
    default:
      return "auto";
  }
}

/**
 * Badgeage hors des bornes acceptées : plus de JOURS_MAX_FUTUR jours dans le futur (horloge de
 * l'appareil déréglée) ou plus de JOURS_MAX_PASSE jours dans le passé (historique ancien renvoyé
 * au premier contact) ; null sinon.
 */
export function horsBornes(date: string, maintenant: Date, fuseau: string): "futur" | "ancien" | null {
  const ecart = ecartJours(jourLocal(maintenant, fuseau), date);
  if (ecart > JOURS_MAX_FUTUR) return "futur";
  if (ecart < -JOURS_MAX_PASSE) return "ancien";
  return null;
}

/**
 * Fenêtre glissante en mémoire (par instance du serveur) : au plus `max` requêtes par
 * `fenetreMs` et par clé. Garde-fou contre un appareil emballé ; pas un quota global.
 */
export class LimiteurDebit {
  private readonly appels = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly fenetreMs: number,
    private readonly cles = 5000,
  ) {}

  autoriser(cle: string, maintenantMs: number = Date.now()): boolean {
    const debut = maintenantMs - this.fenetreMs;
    const liste = (this.appels.get(cle) ?? []).filter((t) => t > debut);
    const ok = liste.length < this.max;
    if (ok) liste.push(maintenantMs);
    this.appels.delete(cle);
    this.appels.set(cle, liste);
    while (this.appels.size > this.cles) {
      this.appels.delete(this.appels.keys().next().value as string);
    }
    return ok;
  }
}
