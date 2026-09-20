/**
 * Prépare le bucket Scaleway des archives (à exécuter une fois, avec des clés API Scaleway
 * disposant des droits ObjectStorageFullAccess) :
 *   - création du bucket en région fr-par, Object Lock activé (implique le versioning) ;
 *   - blocage de tout accès public ;
 *   - rétention par défaut en mode GOUVERNANCE sur ARCHIVE_RETENTION_YEARS années.
 *
 *   npm run scaleway:setup
 */
import "dotenv/config";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectLockConfigurationCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";

async function main() {
  const accessKeyId = process.env.SCALEWAY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SCALEWAY_SECRET_ACCESS_KEY;
  const bucket = process.env.SCALEWAY_BUCKET;
  const region = process.env.SCALEWAY_REGION ?? "fr-par";
  const endpoint = process.env.SCALEWAY_ENDPOINT ?? `https://s3.${region}.scw.cloud`;
  const retentionAnnees = Number(process.env.ARCHIVE_RETENTION_YEARS ?? "5") || 5;
  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("SCALEWAY_ACCESS_KEY_ID, SCALEWAY_SECRET_ACCESS_KEY et SCALEWAY_BUCKET sont requis.");
  }
  if (region !== "fr-par") {
    console.warn(`[scaleway] attention : région ${region} — le brief impose fr-par (données en France).`);
  }
  const s3 = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  let existe = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    existe = true;
    console.log(`[scaleway] bucket ${bucket} déjà présent.`);
  } catch {
    /* absent */
  }
  if (!existe) {
    await s3.send(new CreateBucketCommand({ Bucket: bucket, ObjectLockEnabledForBucket: true }));
    console.log(`[scaleway] bucket ${bucket} créé en ${region} avec Object Lock.`);
  }

  await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: "Enabled" } }));
  console.log("[scaleway] versioning activé.");

  await s3.send(
    new PutObjectLockConfigurationCommand({
      Bucket: bucket,
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        Rule: { DefaultRetention: { Mode: "GOVERNANCE", Years: retentionAnnees } },
      },
    }),
  );
  console.log(`[scaleway] rétention par défaut : GOUVERNANCE, ${retentionAnnees} an(s).`);

  try {
    await s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
      }),
    );
    console.log("[scaleway] accès public bloqué.");
  } catch (err) {
    console.warn("[scaleway] PutPublicAccessBlock non supporté : vérifiez dans la console que le bucket est privé.", (err as Error).message);
  }
  console.log("[scaleway] terminé. Le bucket ne doit être accessible que par URL présignée (15 min).");
}

main().catch((err) => {
  console.error("[scaleway] échec :", err);
  process.exit(1);
});
