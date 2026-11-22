/**
 * Envoi de SMS par l'API d'OVHcloud (option payante).
 *
 * Variables : OVH_SMS_APP_KEY, OVH_SMS_APP_SECRET, OVH_SMS_CONSUMER_KEY (jeton d'API OVH limité à
 * « POST /sms/<compte>/jobs »), OVH_SMS_COMPTE (nom du compte SMS, « sms-xx12345-1 ») et
 * OVH_SMS_EXPEDITEUR (expéditeur déclaré chez OVH, 11 caractères au plus). Sans elles, aucun SMS
 * ne part et le pointage par SMS est refusé proprement.
 *
 * Signature d'une requête OVH : préfixe « dollar-un-dollar », puis SHA-1 de
 * secret+jeton+MÉTHODE+adresse+corps+horodatage (séparés par « + »).
 */
import { createHash } from "node:crypto";

const HOTE = "https://eu.api.ovh.com/1.0";
const PREFIXE_SIGNATURE = ["$", "1", "$"].join("");

export function smsConfigure(): boolean {
  const e = process.env;
  return !!(e.OVH_SMS_APP_KEY && e.OVH_SMS_APP_SECRET && e.OVH_SMS_CONSUMER_KEY && e.OVH_SMS_COMPTE && e.OVH_SMS_EXPEDITEUR);
}

/** Mobile au format international, ou null. « 06 12 34 56 78 » → « +33612345678 ». */
export function normaliserMobile(brut: unknown): string | null {
  let n = String(brut ?? "").replace(/[\s.\-()]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (/^0[67]\d{8}$/.test(n)) n = `+33${n.slice(1)}`;
  if (/^\+33[67]\d{8}$/.test(n)) return n;
  // Autre pays : indicatif explicite exigé.
  return /^\+(?!33)\d{8,15}$/.test(n) ? n : null;
}

/** « +33612345678 » → « 06 •• •• •• 78 » : assez pour se reconnaître, pas pour lire le numéro d'un collègue. */
export function masquerMobile(numero: string): string {
  const fin = numero.slice(-2);
  return numero.startsWith("+33") ? `0${numero[3]} •• •• •• ${fin}` : `${numero.slice(0, 4)} •••• ${fin}`;
}

export function signatureOvh(secret: string, jeton: string, methode: string, adresse: string, corps: string, horodatage: number): string {
  return PREFIXE_SIGNATURE + createHash("sha1").update([secret, jeton, methode, adresse, corps, horodatage].join("+")).digest("hex");
}

export type EnvoiSms = (numero: string, message: string) => Promise<boolean>;

export const envoyerSms: EnvoiSms = async (numero, message) => {
  if (!smsConfigure()) return false;
  const e = process.env;
  const adresse = `${HOTE}/sms/${encodeURIComponent(e.OVH_SMS_COMPTE!)}/jobs`;
  const corps = JSON.stringify({ message, receivers: [numero], sender: e.OVH_SMS_EXPEDITEUR, noStopClause: true, priority: "high", charset: "UTF-8", coding: "7bit", senderForResponse: false });
  const horodatage = Math.round(Date.now() / 1000);
  try {
    const r = await fetch(adresse, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ovh-Application": e.OVH_SMS_APP_KEY!,
        "X-Ovh-Consumer": e.OVH_SMS_CONSUMER_KEY!,
        "X-Ovh-Timestamp": String(horodatage),
        "X-Ovh-Signature": signatureOvh(e.OVH_SMS_APP_SECRET!, e.OVH_SMS_CONSUMER_KEY!, "POST", adresse, corps, horodatage),
      },
      body: corps,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error(`[sms] refus d'OVH (${r.status}) : ${(await r.text().catch(() => "")).slice(0, 300)}`);
      return false;
    }
    const rep = (await r.json().catch(() => null)) as { invalidReceivers?: string[] } | null;
    if (rep?.invalidReceivers?.length) {
      console.error("[sms] numéro refusé par OVH");
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sms] envoi impossible", err);
    return false;
  }
};
