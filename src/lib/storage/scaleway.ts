/**
 * Scaleway Object Storage (S3-compatible, région fr-par).
 *  - Bucket privé, jamais public : accès uniquement par URL présignée (15 min).
 *  - Récaps validés sous `archives/` avec Object Lock en mode gouvernance : non modifiables
 *    pendant la durée de rétention, ce qui fonde leur valeur probante.
 */
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "@/lib/http";

export const DUREE_URL_PRESIGNEE_S = 15 * 60;

export type ConfigScaleway = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint: string;
  retentionAnnees: number;
};

export function configScaleway(): ConfigScaleway | null {
  const accessKeyId = process.env.SCALEWAY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SCALEWAY_SECRET_ACCESS_KEY;
  const bucket = process.env.SCALEWAY_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) return null;
  const region = process.env.SCALEWAY_REGION ?? "fr-par";
  return {
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
    endpoint: process.env.SCALEWAY_ENDPOINT ?? `https://s3.${region}.scw.cloud`,
    retentionAnnees: Number(process.env.ARCHIVE_RETENTION_YEARS ?? "5") || 5,
  };
}

let client: S3Client | null = null;

export function clientScaleway(cfg: ConfigScaleway): S3Client {
  if (!client) {
    client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: false,
      // Scaleway ne supporte pas les checksums CRC envoyés par défaut par les SDK récents.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

export function exigerStockage(): ConfigScaleway {
  const cfg = configScaleway();
  if (!cfg) throw new HttpError(503, "STOCKAGE_NON_CONFIGURE", "Variables SCALEWAY_* manquantes.");
  return cfg;
}

export function cleArchiveRecap(organisationId: string, annee: number, semaine: number, salarieId: string, recapId: string): string {
  return `archives/${organisationId}/${annee}/S${String(semaine).padStart(2, "0")}/${salarieId}-${recapId}.pdf`;
}

/** Dépose un PDF archivé et verrouillé (gouvernance) jusqu'à la fin de la durée de rétention. */
export async function archiverPdf(cle: string, contenu: Uint8Array, sha256Hex: string): Promise<{ retainUntil: Date }> {
  const cfg = exigerStockage();
  const retainUntil = new Date();
  retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + cfg.retentionAnnees);
  await clientScaleway(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: cle,
      Body: contenu,
      ContentType: "application/pdf",
      ContentLength: contenu.byteLength,
      ObjectLockMode: "GOVERNANCE",
      ObjectLockRetainUntilDate: retainUntil,
      Metadata: { "sha256": sha256Hex, "application": "kipointe" },
    }),
  );
  return { retainUntil };
}

export async function urlPresigneeLecture(cle: string): Promise<{ url: string; expireLe: Date }> {
  const cfg = exigerStockage();
  const url = await getSignedUrl(clientScaleway(cfg), new GetObjectCommand({ Bucket: cfg.bucket, Key: cle }), {
    expiresIn: DUREE_URL_PRESIGNEE_S,
  });
  return { url, expireLe: new Date(Date.now() + DUREE_URL_PRESIGNEE_S * 1000) };
}

export async function objetExiste(cle: string): Promise<boolean> {
  const cfg = exigerStockage();
  try {
    await clientScaleway(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: cle }));
    return true;
  } catch {
    return false;
  }
}
