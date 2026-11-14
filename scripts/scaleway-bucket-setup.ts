/**
 * Prépare et vérifie le bucket Scaleway des JUSTIFICATIFS (arrêts de travail, actes…).
 *
 *   npm run scaleway:setup       # crée et configure le bucket (idempotent)
 *   npm run scaleway:verifier    # audit en lecture seule, ne modifie rien
 *
 * Clés API requises : application Scaleway avec `ObjectStorageFullAccess` (ou limitée au bucket).
 *
 * Ce que le script garantit :
 *   - bucket en région fr-par, PRIVÉ (aucun accès public) ;
 *   - SANS Object Lock : un justificatif doit pouvoir être supprimé avec l'absence (droit à
 *     l'effacement) — un bucket verrouillé est refusé ;
 *   - règle CORS : le navigateur envoie le fichier directement au bucket, depuis l'adresse du
 *     service seulement (NEXT_PUBLIC_APP_URL, plus SCALEWAY_CORS_ORIGINES si besoin) ;
 *   - relecture de la configuration après écriture : on ne se fie pas au code de retour.
 */
import "dotenv/config";
import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  GetObjectLockConfigurationCommand,
  GetPublicAccessBlockCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutPublicAccessBlockCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { clientS3, configStockage } from "../src/lib/stockage";

const statut = (e: unknown) => (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
const code = (e: unknown) => (e as { name?: string })?.name ?? "";

/** Origines autorisées à envoyer un fichier : l'adresse du service, et celles ajoutées à la main. */
function origines(): string[] {
  const brutes = [process.env.NEXT_PUBLIC_APP_URL ?? "", ...(process.env.SCALEWAY_CORS_ORIGINES ?? "").split(",")];
  const propres = brutes.map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  for (const o of propres) {
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o) && !/^http:\/\/localhost(:\d+)?$/.test(o)) throw new Error(`Origine « ${o} » invalide : attendu https://domaine, sans chemin.`);
  }
  if (!propres.length) throw new Error("NEXT_PUBLIC_APP_URL est requise : c'est l'adresse depuis laquelle les fichiers sont envoyés au bucket.");
  return [...new Set(propres)];
}

async function existe(s3: S3Client, bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (e) {
    if (statut(e) === 404) return false;
    if (statut(e) === 403) throw new Error(`Accès refusé sur ${bucket} : la clé API n'a pas les droits, ou le bucket appartient à un autre projet Scaleway.`);
    throw e;
  }
}

async function verrouille(s3: S3Client, bucket: string): Promise<boolean> {
  try {
    const r = await s3.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }));
    return r.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled";
  } catch {
    return false; // pas de configuration de verrou : c'est ce qu'on veut
  }
}

async function main() {
  const cfg = configStockage();
  if (!cfg) throw new Error("SCALEWAY_ACCESS_KEY_ID, SCALEWAY_SECRET_ACCESS_KEY et SCALEWAY_BUCKET sont requis (voir .env.example).");
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cfg.bucket) || cfg.bucket.length < 3 || cfg.bucket.length > 63) {
    throw new Error(`SCALEWAY_BUCKET « ${cfg.bucket} » invalide : 3 à 63 caractères, minuscules, chiffres et tirets. Un point casserait le certificat TLS.`);
  }
  if (cfg.region !== "fr-par" && !process.argv.includes("--hors-france")) {
    throw new Error(`Région ${cfg.region} : le projet impose fr-par (documents conservés en France). Passez --hors-france en connaissance de cause.`);
  }
  const verifier = process.argv.includes("--verifier");
  const attendues = origines();
  const s3 = clientS3(cfg);
  const journal = (m: string) => console.log(`[scaleway] ${m}`);
  journal(`bucket « ${cfg.bucket} » — région ${cfg.region} — ${cfg.endpoint}`);
  if (verifier) journal("mode --verifier : aucune modification ne sera écrite.");

  if (await existe(s3, cfg.bucket)) {
    journal("bucket déjà présent.");
  } else if (verifier) {
    throw new Error(`Le bucket ${cfg.bucket} n'existe pas. Lancez « npm run scaleway:setup » pour le créer.`);
  } else {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
      journal(`bucket créé en ${cfg.region}.`);
    } catch (e) {
      if (code(e) === "BucketAlreadyExists") throw new Error(`Le nom « ${cfg.bucket} » est déjà pris par un autre compte : les noms de buckets sont globaux. Choisissez-en un autre.`);
      if (code(e) !== "BucketAlreadyOwnedByYou") throw e;
    }
  }

  if (await verrouille(s3, cfg.bucket)) {
    throw new Error(
      `Le bucket ${cfg.bucket} a Object Lock activé : les justificatifs n'y seraient pas supprimables,\n` +
        "  ce qui contredit le droit à l'effacement. Object Lock ne se retire pas : utilisez un autre bucket.",
    );
  }
  journal("pas d'Object Lock : les justificatifs sont supprimables.");

  if (!verifier) {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: cfg.bucket,
        CORSConfiguration: { CORSRules: [{ AllowedMethods: ["PUT"], AllowedOrigins: attendues, AllowedHeaders: ["content-type"], MaxAgeSeconds: 3600 }] },
      }),
    );
    try {
      await s3.send(
        new PutPublicAccessBlockCommand({
          Bucket: cfg.bucket,
          PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
        }),
      );
    } catch (e) {
      journal(`blocage d'accès public refusé par l'API (${(e as Error).message}) : vérifiez dans la console que le bucket est privé.`);
    }
  }

  const anomalies: string[] = [];
  try {
    const cors = await s3.send(new GetBucketCorsCommand({ Bucket: cfg.bucket }));
    const regles = cors.CORSRules ?? [];
    const autorisees = new Set(regles.filter((r) => r.AllowedMethods?.includes("PUT")).flatMap((r) => r.AllowedOrigins ?? []));
    const manquantes = attendues.filter((o) => !autorisees.has(o));
    if (autorisees.has("*")) anomalies.push("la règle CORS autorise toutes les origines (*) : restreignez-la à l'adresse du service.");
    else if (manquantes.length) anomalies.push(`origine(s) absente(s) de la règle CORS : ${manquantes.join(", ")} — l'envoi d'un justificatif y échouerait.`);
    else journal(`envoi autorisé depuis : ${attendues.join(", ")}.`);
  } catch {
    anomalies.push("aucune règle CORS : le navigateur ne pourra pas envoyer de fichier au bucket.");
  }
  try {
    const c = (await s3.send(new GetPublicAccessBlockCommand({ Bucket: cfg.bucket }))).PublicAccessBlockConfiguration;
    if (c?.BlockPublicAcls && c.IgnorePublicAcls && c.BlockPublicPolicy && c.RestrictPublicBuckets) journal("accès public bloqué.");
    else anomalies.push("le blocage d'accès public n'est pas complet — vérifiez dans la console que le bucket est privé.");
  } catch {
    journal("blocage d'accès public non lisible via l'API : vérifiez dans la console que le bucket est privé.");
  }

  if (anomalies.length) {
    console.error("");
    for (const a of anomalies) console.error(`[scaleway] ANOMALIE : ${a}`);
    process.exit(1);
  }
  journal(`terminé — ${verifier ? "configuration conforme" : "bucket prêt"}.`);
}

main().catch((e) => {
  console.error(`[scaleway] échec : ${(e as Error).message}`);
  process.exit(1);
});
