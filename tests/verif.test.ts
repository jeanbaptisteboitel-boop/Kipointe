import { describe, expect, it } from "vitest";
import { verificateurHorsLigne } from "@/lib/crypto";
import { calculerVerificateur } from "@/lib/kiosque/verif";

describe("vérificateur de PIN hors ligne", () => {
  it("donne le même résultat côté serveur (node:crypto) et côté tablette (WebCrypto)", async () => {
    const token = "token-de-test-abc";
    const badge = "5c0c3c2e-6b7c-4d2a-9d5b-1a2b3c4d5e6f";
    const serveur = verificateurHorsLigne(token, badge, 3, "4711");
    const tablette = await calculerVerificateur(token, badge, 3, "4711");
    expect(tablette).toBe(serveur);
    expect(await calculerVerificateur(token, badge, 3, "4712")).not.toBe(serveur);
    expect(await calculerVerificateur(token, badge, 4, "4711")).not.toBe(serveur);
  });
});
