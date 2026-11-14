/**
 * Conversion des photos HEIC / HEIF en JPEG.
 *
 * Un iPhone enregistre ses photos en HEIC, que seul Safari sait afficher : l'employeur sous
 * Windows ne pourrait pas ouvrir le justificatif. La photo est donc convertie à l'arrivée.
 * Décodage en JavaScript pur (libheif compilé) : aucun binaire natif, compatible avec l'hébergeur.
 */
import decode from "heic-decode";
import { encode } from "jpeg-js";

/** Au-delà, l'image n'est pas décodée : un fichier de quelques Ko peut annoncer des dimensions démesurées. */
export const PIXELS_MAX = 60_000_000;
const QUALITE_JPEG = 85;

export class ImageTropGrande extends Error {}

/** Octets JPEG de la première image d'un fichier HEIC / HEIF. Lève une erreur s'il est illisible. */
export async function convertirHeicEnJpeg(octets: Uint8Array): Promise<Uint8Array> {
  const images = await decode.all({ buffer: octets });
  try {
    const premiere = images[0];
    if (!premiere) throw new Error("fichier HEIC sans image");
    // Dimensions lues AVANT le décodage, qui alloue largeur × hauteur × 4 octets.
    if (premiere.width * premiere.height > PIXELS_MAX) throw new ImageTropGrande(`${premiere.width} × ${premiere.height}`);
    const { width, height, data } = await premiere.decode();
    return new Uint8Array(encode({ width, height, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength) }, QUALITE_JPEG).data);
  } finally {
    images.dispose?.();
  }
}

/** « IMG_0042.HEIC » → « IMG_0042.jpg ». */
export function nomEnJpeg(nom: string): string {
  return `${nom.replace(/\.(heic|heif)$/i, "")}.jpg`;
}
