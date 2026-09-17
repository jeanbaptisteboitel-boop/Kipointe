/**
 * Vérificateur de PIN hors ligne (miroir WebCrypto de src/lib/crypto.ts#verificateurHorsLigne).
 */
function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function calculerVerificateur(token: string, badgeUuid: string, pinVersion: number, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const subtle = globalThis.crypto.subtle;
  const cleBrute = await subtle.digest("SHA-256", enc.encode(`kipointe-verif:${token}`));
  const cle = await subtle.importKey("raw", cleBrute, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await subtle.sign("HMAC", cle, enc.encode(`${badgeUuid}:${pinVersion}:${pin}`));
  return base64url(new Uint8Array(signature));
}
