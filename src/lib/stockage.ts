/**
 * STOCKAGE DES JUSTIFICATIFS — bucket Scaleway Object Storage (S3, région fr-par), PRIVÉ.
 *
 * Le navigateur envoie le fichier DIRECTEMENT au bucket, par une URL présignée à durée courte :
 * il ne traverse pas l'application, dont l'hébergeur plafonne les requêtes à 4,5 Mo. Le serveur
 * vérifie ensuite ce qui a réellement été déposé (taille, premiers octets) avant de le rendre
 * consultable. La lecture passe elle aussi par une URL présignée, émise après contrôle d'accès.
 *
 * Le bucket n'a PAS d'Object Lock : un justificatif doit pouvoir être supprimé avec l'absence.
 */
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Durée de validité d'une URL d'envoi (secondes) : le temps d'un envoi sur une connexion lente. */
export const DUREE_URL_DEPOT_S = 15 * 60;
/** Durée de validité d'une URL de lecture (secondes) : le temps d'ouvrir le document. */
export const DUREE_URL_LECTURE_S = 60;

export interface Stockage {
  /** URL présignée d'envoi (PUT) d'un objet, pour ce type et cette taille exacts. */
  urlDepot(cle: string, typeMime: string, taille: number): Promise<string>;
  /** Taille réelle de l'objet et ses premiers octets ; null s'il n'existe pas. */
  lireDebut(cle: string, octets: number): Promise<{ taille: number; debut: Uint8Array } | null>;
  /** URL présignée de lecture, servie avec le type vérifié et le nom d'origine. */
  urlLecture(cle: string, nom: string, typeMime: string): Promise<string>;
  supprimer(cles: string[]): Promise<void>;
  /** Contenu entier d'un objet (conversion d'une photo) ; null s'il n'existe pas. */
  lire(cle: string): Promise<Uint8Array | null>;
  /** Dépôt d'un objet par le serveur lui-même. */
  ecrire(cle: string, octets: Uint8Array, typeMime: string): Promise<void>;
}

export interface ConfigStockage {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
}

export function configStockage(env: Record<string, string | undefined> = process.env): ConfigStockage | null {
  const accessKeyId = env.SCALEWAY_ACCESS_KEY_ID;
  const secretAccessKey = env.SCALEWAY_SECRET_ACCESS_KEY;
  const bucket = env.SCALEWAY_BUCKET;
  if (!accessKeyId || !secretAccessKey || !bucket) return null;
  const region = env.SCALEWAY_REGION ?? "fr-par";
  return { accessKeyId, secretAccessKey, bucket, region, endpoint: env.SCALEWAY_ENDPOINT ?? `https://s3.${region}.scw.cloud` };
}

export function clientS3(cfg: ConfigStockage): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // Un serveur S3 local de test se joint par chemin ; Scaleway par sous-domaine.
    forcePathStyle: process.env.SCALEWAY_PATH_STYLE === "1",
    // Scaleway n'accepte pas les sommes de contrôle CRC que les SDK récents ajoutent par défaut.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function stockageS3(cfg: ConfigStockage): Stockage {
  const s3 = clientS3(cfg);
  return {
    urlDepot(cle, typeMime, taille) {
      return getSignedUrl(s3, new PutObjectCommand({ Bucket: cfg.bucket, Key: cle, ContentType: typeMime, ContentLength: taille }), {
        expiresIn: DUREE_URL_DEPOT_S,
        // Type et taille font partie de la signature : l'URL ne sert qu'à l'envoi annoncé.
        signableHeaders: new Set(["content-type", "content-length"]),
      });
    },
    async lireDebut(cle, octets) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: cle, Range: `bytes=0-${octets - 1}` }));
        const debut = r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
        const total = /\/(\d+)$/.exec(r.ContentRange ?? "")?.[1];
        return { taille: total ? Number(total) : (r.ContentLength ?? debut.length), debut };
      } catch (e) {
        const statut = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
        if (statut === 404 || statut === 416) return null;
        throw e;
      }
    },
    urlLecture(cle, nom, typeMime) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: cle,
          ResponseContentType: typeMime,
          ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(nom)}`,
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: DUREE_URL_LECTURE_S },
      );
    },
    async lire(cle) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: cle }));
        return r.Body ? await r.Body.transformToByteArray() : null;
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async ecrire(cle, octets, typeMime) {
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: cle, Body: octets, ContentType: typeMime, ContentLength: octets.length }));
    },
    async supprimer(cles) {
      for (let i = 0; i < cles.length; i += 500) {
        await s3.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: cles.slice(i, i + 500).map((Key) => ({ Key })), Quiet: true } }));
      }
    },
  };
}

let instance: Stockage | null | undefined;

/** Le stockage configuré par l'environnement, ou null s'il ne l'est pas. */
export function stockage(): Stockage | null {
  if (instance === undefined) {
    const cfg = configStockage();
    instance = cfg ? stockageS3(cfg) : null;
  }
  return instance;
}
