import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { justificatif, notification } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { TAILLE_MAX_JUSTIFICATIF, avecJustificatifs, deposerJustificatif, lireJustificatif, nettoyerNom, retirerJustificatif, typeDuFichier } from "@/lib/conges/justificatifs";
import { creerConge, supprimerConge } from "@/lib/conges/service";
import { creerFixture, creerOrganisation, dansOrg, type Fixture } from "./helpers/db";

const PDF = new TextEncoder().encode("%PDF-1.4\n% arrêt de travail fictif\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

let fx: Fixture;
let congeId: string;
beforeAll(async () => {
  fx = await creerFixture();
  const c = await dansOrg(fx, (tx) =>
    creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: false, saisie: { salarieId: fx.salaries[0]!.id, type: "MALADIE", dateDebut: "2026-11-16", dateFin: "2026-11-20" } }),
  );
  congeId = c.id;
});
afterAll(() => fx.fermer());

const deposer = (octets: Uint8Array, nom: string, salarieId = fx.salaries[0]!.id) =>
  dansOrg(fx, (tx) => deposerJustificatif(tx, { organisationId: fx.organisation.id, congeId, auteurId: fx.admin.id, parAdmin: false, salarieId, nom, octets }));

describe("justificatifs d'absence", () => {
  it("reconnaît le format au contenu, pas au nom", () => {
    expect(typeDuFichier(PDF)).toBe("application/pdf");
    expect(typeDuFichier(JPEG)).toBe("image/jpeg");
    expect(typeDuFichier(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(typeDuFichier(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(typeDuFichier(new TextEncoder().encode("MZ exécutable"))).toBeNull();
    expect(nettoyerNom("C:\\Users\\moi\\arrêt <1>.pdf")).toBe("arrêt 1.pdf");
    expect(nettoyerNom("../../etc/passwd")).toBe("passwd");
    expect(nettoyerNom("")).toBe("justificatif");
  });

  it("enregistre le dépôt du salarié et prévient l'administrateur", async () => {
    const j = await deposer(PDF, "arret-novembre.pdf");
    expect(j).toMatchObject({ nom: "arret-novembre.pdf", taille: PDF.length });
    const admin = await dansOrg(fx, (tx) => tx.select().from(notification).where(isNull(notification.destinataireSalarieId)));
    expect(admin.map((n) => n.type)).toContain("JUSTIFICATIF_DEPOSE");
    const lu = await dansOrg(fx, (tx) => lireJustificatif(tx, j.id, { parAdmin: false, salarieId: fx.salaries[0]!.id }));
    expect(lu).toMatchObject({ typeMime: "application/pdf", nom: "arret-novembre.pdf" });
    expect(Buffer.from(lu!.contenu).equals(Buffer.from(PDF))).toBe(true);
  });

  it("refuse un format déguisé, un fichier vide ou trop volumineux", async () => {
    await expect(deposer(new TextEncoder().encode("<script>"), "arret.pdf")).rejects.toThrow("Format non accepté");
    await expect(deposer(new Uint8Array(0), "vide.pdf")).rejects.toThrow("vide");
    const gros = new Uint8Array(TAILLE_MAX_JUSTIFICATIF + 1);
    gros.set(PDF);
    await expect(deposer(gros, "gros.pdf")).rejects.toThrow("4 Mo");
  });

  it("ne laisse ni déposer ni lire sur l'absence d'un collègue", async () => {
    const collegue = fx.salaries[1]!.id;
    await expect(deposer(PDF, "intrus.pdf", collegue)).rejects.toThrow("Absence introuvable");
    const [j] = await dansOrg(fx, (tx) => tx.select({ id: justificatif.id }).from(justificatif));
    expect(await dansOrg(fx, (tx) => lireJustificatif(tx, j!.id, { parAdmin: false, salarieId: collegue }))).toBeNull();
    await expect(dansOrg(fx, (tx) => retirerJustificatif(tx, j!.id, { parAdmin: false, salarieId: collegue }))).rejects.toThrow("introuvable");
    // L'administrateur de l'entreprise, lui, le lit.
    expect(await dansOrg(fx, (tx) => lireJustificatif(tx, j!.id, { parAdmin: true, salarieId: null }))).not.toBeNull();
  });

  it("reste invisible d'une autre entreprise cliente, administrateur compris", async () => {
    const autre = await creerOrganisation(fx.db, { raisonSociale: "Autre client", numeroSerie: "AUTRE00002", nbSalaries: 1 });
    const [j] = await dansOrg(fx, (tx) => tx.select({ id: justificatif.id }).from(justificatif));
    expect(await withTenant(fx.db, autre.org.id, (tx) => lireJustificatif(tx, j!.id, { parAdmin: true, salarieId: null }))).toBeNull();
    expect(await withTenant(fx.db, autre.org.id, (tx) => tx.select({ id: justificatif.id }).from(justificatif))).toHaveLength(0);
  });

  it("limite le nombre de fichiers, les liste sans leur contenu, et les supprime avec l'absence", async () => {
    for (let i = 0; i < 4; i++) await deposer(JPEG, `photo-${i}.jpg`);
    await expect(deposer(JPEG, "de-trop.jpg")).rejects.toThrow("au plus par absence");
    const [c] = await dansOrg(fx, async (tx) => avecJustificatifs(tx, await tx.query.congeAbsence.findMany({ where: (t, { eq: egal }) => egal(t.id, congeId) })));
    expect(c!.justificatifs).toHaveLength(5);
    expect(Object.keys(c!.justificatifs[0]!).sort()).toEqual(["id", "nom", "taille"]);
    await dansOrg(fx, (tx) => retirerJustificatif(tx, c!.justificatifs[0]!.id, { parAdmin: false, salarieId: fx.salaries[0]!.id }));
    await dansOrg(fx, (tx) => supprimerConge(tx, { id: congeId, parAdmin: true }));
    expect(await dansOrg(fx, (tx) => tx.select({ id: justificatif.id }).from(justificatif).where(eq(justificatif.congeId, congeId)))).toHaveLength(0);
  });
});
