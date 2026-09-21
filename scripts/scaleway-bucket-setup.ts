/**
 * Prépare et vérifie le bucket Scaleway des archives (récaps hebdomadaires validés).
 *
 *   npm run scaleway:setup       # crée et configure le bucket (idempotent)
 *   npm run scaleway:verifier    # audit en lecture seule, ne modifie rien
 *
 * Clés API requises : application Scaleway avec `ObjectStorageFullAccess` (ou limitée au bucket).
 *
 * Ce que le script garantit :
 *   - bucket en région fr-par, créé avec Object Lock (donc versionné) ;
 *   - rétention par défaut en mode GOUVERNANCE sur ARCHIVE_RETENTION_YEARS années ;
 *   - aucun accès public ;
 *   - relecture de la configuration après écriture : on ne se fie pas au code de retour.
 *
 * Garde-fou principal : Object Lock ne peut être activé qu'à la création du bucket. Un bucket
 * existant qui en est dépourvu ne peut pas être rattrapé — le script s'arrête au lieu de laisser
 * croire que les archives sont verrouillées alors qu'elles restent effaçables.
 */
import "dotenv/config";
import {
  CreateBucketCommand,
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand,
  GetPublicAccessBlockCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectLockConfigurationCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type Config = {
  bucket: string;
  region: string;
  endpoint: string;
  retentionAnnees: number;
  verifierSeulement: boolean;
};

function codeErreur(err: unknown): string {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name ?? e?.Code ?? "";
}

function statut(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

function lireConfig(): { cfg: Config; s3: S3Client } {
  const accessKeyId = process.env.SCALEWAY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SCALEWAY_SECRET_ACCESS_KEY;
  const bucket = process.env.SCALEWAY_BUCKET;
  const region = process.env.SCALEWAY_REGION ?? "fr-par";
  const endpoint = process.env.SCALEWAY_ENDPOINT ?? `https://s3.${region}.scw.cloud`;
  const retentionAnnees = Number(process.env.ARCHIVE_RETENTION_YEARS ?? "5") || 5;

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("SCALEWAY_ACCESS_KEY_ID, SCALEWAY_SECRET_ACCESS_KEY et SCALEWAY_BUCKET sont requis (voir .env.example).");
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(bucket) || bucket.length < 3 || bucket.length > 63) {
    throw new Error(`SCALEWAY_BUCKET « ${bucket} » invalide : 3 à 63 caractères, minuscules, chiffres et tirets. Un point casserait le certificat TLS.`);
  }
  if (region !== "fr-par" && !process.argv.includes("--hors-france")) {
    throw new Error(`Région ${region} : le projet impose fr-par (archives conservées en France). Passez --hors-france en connaissance de cause.`);
  }

  const s3 = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Scaleway n'accepte pas les checksums CRC envoyés par défaut par les SDK récents.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { cfg: { bucket, region, endpoint, retentionAnnees, verifierSeulement: process.argv.includes("--verifier") }, s3 };
}

async function bucketExiste(s3: S3Client, bucket: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (err) {
    const code = statut(err);
    if (code === 404 || codeErreur(err) === "NotFound" || codeErreur(err) === "NoSuchBucket") return false;
    if (code === 403) {
      throw new Error(`Accès refusé sur ${bucket} : la clé API n'a pas les droits, ou le bucket appartient à un autre projet Scaleway.`);
    }
    throw err;
  }
}

/** Renvoie le mode et la durée de rétention par défaut, ou null si Object Lock n'est pas activé. */
async function lireObjectLock(s3: S3Client, bucket: string): Promise<{ mode?: string; annees?: number; jours?: number } | null> {
  try {
    const res = await s3.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }));
    if (res.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled") return null;
    const regle = res.ObjectLockConfiguration.Rule?.DefaultRetention;
    return { mode: regle?.Mode, annees: regle?.Years, jours: regle?.Days };
  } catch (err) {
    const code = codeErreur(err);
    if (code === "ObjectLockConfigurationNotFoundError" || code === "ObjectLockConfigurationNotFound" || statut(err) === 404) return null;
    throw err;
  }
}

async function main() {
  const { cfg, s3 } = lireConfig();
  const { bucket, region, endpoint, retentionAnnees, verifierSeulement } = cfg;
  const journal = (m: string) => console.log(`[scaleway] ${m}`);

  journal(`bucket « ${bucket} » — région ${region} — ${endpoint}`);
  if (verifierSeulement) journal("mode --verifier : aucune modification ne sera écrite.");

  let existe = await bucketExiste(s3, bucket);
  if (existe) {
    journal("bucket déjà présent.");
  } else if (verifierSeulement) {
    throw new Error(`Le bucket ${bucket} n'existe pas. Lancez « npm run scaleway:setup » pour le créer.`);
  } else {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }));
      journal(`bucket créé en ${region} avec Object Lock.`);
      existe = true;
    } catch (err) {
      const code = codeErreur(err);
      if (code === "BucketAlreadyOwnedByYou") {
        journal("bucket déjà détenu par ce compte.");
        existe = true;
      } else if (code === "BucketAlreadyExists") {
        throw new Error(`Le nom « ${bucket} » est déjà pris par un autre compte : les noms de buckets sont globaux. Choisissez par exemple « ${bucket}-${Math.floor(Math.random() * 9000) + 1000} ».`);
      } else {
        throw err;
      }
    }
  }

  // Object Lock : non rattrapable après coup, on le contrôle avant toute autre écriture.
  const lock = await lireObjectLock(s3, bucket);
  if (lock === null) {
    throw new Error(
      `Le bucket ${bucket} existe mais Object Lock n'y est PAS activé.\n` +
        "  Object Lock ne peut être activé qu'à la création : les archives déposées ici resteraient effaçables,\n" +
        "  ce qui leur ôte leur valeur probante. Créez un nouveau bucket (ex. « " +
        bucket +
        "-v2 ») et renseignez SCALEWAY_BUCKET en conséquence.",
    );
  }
  journal("Object Lock actif.");

  if (!verifierSeulement) {
    await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: "Enabled" } }));
    await s3.send(
      new PutObjectLockConfigurationCommand({
        Bucket: bucket,
        ObjectLockConfiguration: {
          ObjectLockEnabled: "Enabled",
          Rule: { DefaultRetention: { Mode: "GOVERNANCE", Years: retentionAnnees } },
        },
      }),
    );
    try {
      await s3.send(
        new PutPublicAccessBlockCommand({
          Bucket: bucket,
          PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
        }),
      );
    } catch (err) {
      journal(`PutPublicAccessBlock refusé (${(err as Error).message}) : vérifiez dans la console que le bucket est privé.`);
    }
  }

  // Relecture : c'est l'état constaté qui compte, pas le code de retour des écritures.
  const anomalies: string[] = [];

  const versioning = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  if (versioning.Status === "Enabled") journal("versioning activé.");
  else anomalies.push(`versioning « ${versioning.Status ?? "désactivé"} » au lieu de « Enabled ».`);

  const apres = await lireObjectLock(s3, bucket);
  if (!apres) {
    anomalies.push("Object Lock introuvable à la relecture.");
  } else if (apres.mode !== "GOVERNANCE") {
    anomalies.push(`rétention par défaut en mode « ${apres.mode ?? "aucun"} » au lieu de « GOVERNANCE ».`);
  } else if (apres.annees !== retentionAnnees && apres.jours === undefined) {
    anomalies.push(`rétention par défaut de ${apres.annees ?? "?"} an(s) au lieu de ${retentionAnnees}.`);
  } else {
    const duree = apres.annees !== undefined ? `${apres.annees} an(s)` : `${apres.jours} jour(s)`;
    journal(`rétention par défaut : GOUVERNANCE, ${duree}.`);
  }

  try {
    const blocage = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
    const c = blocage.PublicAccessBlockConfiguration;
    if (c?.BlockPublicAcls && c?.IgnorePublicAcls && c?.BlockPublicPolicy && c?.RestrictPublicBuckets) {
      journal("accès public bloqué.");
    } else {
      anomalies.push("le blocage d'accès public n'est pas complet — vérifiez dans la console que le bucket est privé.");
    }
  } catch {
    journal("blocage d'accès public non lisible via l'API : vérifiez dans la console que le bucket est privé.");
  }

  if (anomalies.length > 0) {
    console.error("");
    for (const a of anomalies) console.error(`[scaleway] ANOMALIE : ${a}`);
    process.exit(1);
  }

  journal(`terminé — ${verifierSeulement ? "configuration conforme" : "bucket prêt"}. Accès uniquement par URL présignée (15 min).`);
}

main().catch((err) => {
  console.error(`[scaleway] échec : ${(err as Error).message}`);
  process.exit(1);
});
