import { inflateSync } from "node:zlib";

/**
 * Décompresse les flux d'un PDF et renvoie le texte réellement dessiné.
 * Sert à vérifier que le document se lit sans l'application — c'est la pièce
 * que l'inspection du travail demandera.
 *
 * pdf-lib écrit les chaînes en hexadécimal (`<48656C6C6F> Tj`) ; on gère aussi
 * la forme littérale `(Hello) Tj` au cas où.
 */
export function texteDuPdf(pdf: Uint8Array): string {
  const brut = Buffer.from(pdf);
  let flux = "";
  let i = 0;
  for (;;) {
    const debut = brut.indexOf("stream", i);
    if (debut < 0) break;
    const fin = brut.indexOf("endstream", debut);
    if (fin < 0) break;
    let d = debut + "stream".length;
    while (brut[d] === 0x0d || brut[d] === 0x0a) d++;
    try {
      flux += inflateSync(brut.subarray(d, fin)).toString("latin1");
    } catch {
      /* flux non compressé ou non textuel */
    }
    i = fin + 1;
  }

  const lignes: string[] = [];
  for (const m of flux.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
    lignes.push(Buffer.from(m[1]!.replace(/\s/g, ""), "hex").toString("latin1"));
  }
  for (const m of flux.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
    lignes.push(m[1]!.replace(/\\([()\\])/g, "$1"));
  }
  return lignes.join("\n");
}
