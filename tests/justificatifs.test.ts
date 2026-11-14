import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { justificatif, notification } from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import {
  ErreurRefus,
  TAILLE_MAX_JUSTIFICATIF,
  avecJustificatifs,
  clesDeLAbsence,
  confirmerDepot,
  nettoyerNom,
  preparerDepot,
  purgerDepotsAbandonnes,
  retirerJustificatif,
  trouverJustificatif,
  typeDuFichier,
} from "@/lib/conges/justificatifs";
import { creerConge, supprimerConge } from "@/lib/conges/service";
import { configStockage, type Stockage } from "@/lib/stockage";
import { creerFixture, creerOrganisation, dansOrg, type Fixture } from "./helpers/db";

const PDF = new TextEncoder().encode("%PDF-1.4\n% arrêt de travail fictif\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

/** Bucket en mémoire : `objets` est ce qui a réellement été déposé, quoi qu'ait annoncé le client. */
function bucketDeTest() {
  const objets = new Map<string, Uint8Array>();
  const stockage: Stockage = {
    urlDepot: async (cle) => `https://bucket.test/${cle}?signature`,
    lireDebut: async (cle, n) => {
      const o = objets.get(cle);
      return o ? { taille: o.length, debut: o.slice(0, n) } : null;
    },
    urlLecture: async (cle, nom, type) => `https://bucket.test/${cle}?lecture&nom=${encodeURIComponent(nom)}&type=${encodeURIComponent(type)}`,
    supprimer: async (cles) => {
      for (const c of cles) objets.delete(c);
    },
  };
  return { objets, stockage };
}

let fx: Fixture;
let congeId: string;
const { objets, stockage } = bucketDeTest();
const cleDe = (url: string) => new URL(url).pathname.slice(1);

beforeAll(async () => {
  fx = await creerFixture();
  const c = await dansOrg(fx, (tx) =>
    creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: false, saisie: { salarieId: fx.salaries[0]!.id, type: "EVENEMENT_FAMILIAL", dateDebut: "2026-11-16", dateFin: "2026-11-18" } }),
  );
  congeId = c.id;
});
afterAll(() => fx.fermer());

const moi = () => ({ parAdmin: false, salarieId: fx.salaries[0]!.id });
const preparer = (nom: string, taille: number, typeAnnonce = "application/pdf", acteur = moi()) =>
  dansOrg(fx, (tx) => preparerDepot(tx, stockage, { ...acteur, organisationId: fx.organisation.id, congeId, auteurId: fx.admin.id, nom, taille, typeAnnonce }));
const confirmer = (id: string, acteur = moi()) => dansOrg(fx, (tx) => confirmerDepot(tx, stockage, { ...acteur, organisationId: fx.organisation.id, id }));
/** Dépôt complet : annonce, envoi au bucket, confirmation. */
async function deposer(octets: Uint8Array, nom: string, type = "application/pdf") {
  const p = await preparer(nom, octets.length, type);
  objets.set(cleDe(p.url), octets);
  return confirmer(p.id);
}
/** Comme l'action serveur : un refus valide la transaction (la ligne est supprimée), puis rend le message. */
const confirmerOuRefus = (id: string) =>
  dansOrg(fx, async (tx) => {
    try {
      await confirmerDepot(tx, stockage, { ...moi(), organisationId: fx.organisation.id, id });
      return null;
    } catch (e) {
      if (e instanceof ErreurRefus) return e.message;
      throw e;
    }
  });
const lignes = () => dansOrg(fx, (tx) => tx.select().from(justificatif).where(eq(justificatif.congeId, congeId)));

describe("justificatifs d'absence", () => {
  it("reconnaît le format au contenu et nettoie le nom", () => {
    expect(typeDuFichier(PDF)).toBe("application/pdf");
    expect(typeDuFichier(JPEG)).toBe("image/jpeg");
    expect(typeDuFichier(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(typeDuFichier(HTML)).toBeNull();
    // Photos d'iPhone : conteneur « ftyp » + marque HEIC. Une vidéo MP4 ou une image AVIF, non.
    const ftyp = (marque: string) => new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode(`ftyp${marque}`), 0, 0, 0, 0]);
    expect(typeDuFichier(ftyp("heic"))).toBe("image/heic");
    expect(typeDuFichier(ftyp("heix"))).toBe("image/heic");
    expect(typeDuFichier(ftyp("mif1"))).toBe("image/heif");
    expect(typeDuFichier(ftyp("isom"))).toBeNull();
    expect(typeDuFichier(ftyp("mp42"))).toBeNull();
    expect(typeDuFichier(ftyp("avif"))).toBeNull();
    expect(typeDuFichier(new TextEncoder().encode("xxxxftyp"))).toBeNull();
    expect(nettoyerNom("C:\\Users\\moi\\acte <1>.pdf")).toBe("acte 1.pdf");
    expect(nettoyerNom("../../etc/passwd")).toBe("passwd");
    expect(nettoyerNom("")).toBe("justificatif");
  });

  it("range le fichier sous une clé qui ne doit rien au nom fourni", async () => {
    const p = await preparer("../../../acte de naissance.pdf", PDF.length);
    expect(cleDe(p.url)).toMatch(new RegExp(`^justificatifs/${fx.organisation.id}/${congeId}/[0-9a-f-]{36}$`));
    // Tant que le dépôt n'est pas confirmé, il n'est ni listé ni lisible.
    expect(await dansOrg(fx, (tx) => trouverJustificatif(tx, p.id, moi()))).toBeNull();
    objets.set(cleDe(p.url), PDF);
    expect(await confirmer(p.id)).toMatchObject({ nom: "acte de naissance.pdf", taille: PDF.length });
    const lu = await dansOrg(fx, (tx) => trouverJustificatif(tx, p.id, moi()));
    expect(lu).toMatchObject({ typeMime: "application/pdf", nom: "acte de naissance.pdf" });
    const admin = await dansOrg(fx, (tx) => tx.select().from(notification).where(isNull(notification.destinataireSalarieId)));
    expect(admin.map((n) => n.type)).toContain("JUSTIFICATIF_DEPOSE");
  });

  it("refuse à l'annonce un fichier vide, trop volumineux ou d'un type non accepté", async () => {
    await expect(preparer("vide.pdf", 0)).rejects.toThrow("vide");
    await expect(preparer("gros.pdf", TAILLE_MAX_JUSTIFICATIF + 1)).rejects.toThrow("25 Mo");
    await expect(preparer("page.html", 30, "text/html")).rejects.toThrow("Format non accepté");
    expect(await preparer("limite.pdf", TAILLE_MAX_JUSTIFICATIF)).toHaveProperty("url");
  });

  it("vérifie ce qui a réellement été déposé, pas ce qui était annoncé", async () => {
    // Annoncé PDF, déposé HTML.
    const faux = await preparer("arret.pdf", HTML.length);
    objets.set(cleDe(faux.url), HTML);
    expect(await confirmerOuRefus(faux.id)).toContain("Format non accepté");
    expect(objets.has(cleDe(faux.url))).toBe(false);
    // Annoncé petit, déposé énorme.
    const gros = await preparer("petit.pdf", 100);
    const enorme = new Uint8Array(TAILLE_MAX_JUSTIFICATIF + 1);
    enorme.set(PDF);
    objets.set(cleDe(gros.url), enorme);
    expect(await confirmerOuRefus(gros.id)).toContain("25 Mo");
    // Annoncé mais jamais envoyé.
    const absent = await preparer("jamais.pdf", 100);
    expect(await confirmerOuRefus(absent.id)).toContain("pas arrivé");
    // Aucune trace des trois, ni en base ni dans le bucket ; le premier dépôt et « limite.pdf » restent.
    expect((await lignes()).map((l) => l.nom).sort()).toEqual(["acte de naissance.pdf", "limite.pdf"]);
    expect(objets.size).toBe(1);
    // Annoncé JPEG, déposé PDF : accepté, sous son vrai type.
    const j = await deposer(PDF, "scan.jpg", "image/jpeg");
    expect((await dansOrg(fx, (tx) => trouverJustificatif(tx, j.id, moi())))!.typeMime).toBe("application/pdf");
  });

  it("accepte une photo HEIC d'iPhone, et refuse une vidéo annoncée comme telle", async () => {
    const ftyp = (marque: string) => new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode(`ftyp${marque}`), 0, 0, 0, 0, 1, 2, 3, 4]);
    const video = await preparer("IMG_0001.heic", 20, "image/heic");
    objets.set(cleDe(video.url), ftyp("mp42"));
    expect(await confirmerOuRefus(video.id)).toContain("Format non accepté");
    const photo = await preparer("IMG_0002.HEIC", 20, "image/heic");
    objets.set(cleDe(photo.url), ftyp("heic"));
    const j = await confirmer(photo.id);
    expect((await dansOrg(fx, (tx) => trouverJustificatif(tx, j.id, moi())))!.typeMime).toBe("image/heic");
    await dansOrg(fx, (tx) => retirerJustificatif(tx, stockage, j.id, moi()));
  });

  it("ne laisse ni déposer, ni confirmer, ni lire sur l'absence d'un collègue", async () => {
    const collegue = { parAdmin: false, salarieId: fx.salaries[1]!.id };
    await expect(preparer("intrus.pdf", 10, "application/pdf", collegue)).rejects.toThrow("Absence introuvable");
    const [j] = (await lignes()).filter((l) => l.confirmeLe);
    await expect(confirmer(j!.id, collegue)).rejects.toThrow("Absence introuvable");
    expect(await dansOrg(fx, (tx) => trouverJustificatif(tx, j!.id, collegue))).toBeNull();
    await expect(dansOrg(fx, (tx) => retirerJustificatif(tx, stockage, j!.id, collegue))).rejects.toThrow("introuvable");
    expect(await dansOrg(fx, (tx) => trouverJustificatif(tx, j!.id, { parAdmin: true, salarieId: null }))).not.toBeNull();
  });

  it("reste invisible d'une autre entreprise cliente, administrateur compris", async () => {
    const autre = await creerOrganisation(fx.db, { raisonSociale: "Autre client", numeroSerie: "AUTRE00002", nbSalaries: 1 });
    const [j] = (await lignes()).filter((l) => l.confirmeLe);
    expect(await withTenant(fx.db, autre.org.id, (tx) => trouverJustificatif(tx, j!.id, { parAdmin: true, salarieId: null }))).toBeNull();
    expect(await withTenant(fx.db, autre.org.id, (tx) => tx.select({ id: justificatif.id }).from(justificatif))).toHaveLength(0);
  });

  it("purge les envois jamais confirmés, passé le délai", async () => {
    // « limite.pdf » a été annoncé sans jamais être envoyé.
    const maintenant = new Date();
    expect(await withBypass(fx.db, (tx) => purgerDepotsAbandonnes(tx, maintenant))).toHaveLength(0);
    const cles = await withBypass(fx.db, (tx) => purgerDepotsAbandonnes(tx, new Date(maintenant.getTime() + 2 * 3600 * 1000)));
    expect(cles).toHaveLength(1);
    expect((await lignes()).every((l) => l.confirmeLe)).toBe(true);
  });

  it("limite le nombre de fichiers, puis supprime tout avec l'absence", async () => {
    for (let i = 0; i < 3; i++) await deposer(JPEG, `photo-${i}.jpg`, "image/jpeg");
    await expect(preparer("de-trop.jpg", 10, "image/jpeg")).rejects.toThrow("au plus par absence");
    const [c] = await dansOrg(fx, async (tx) => avecJustificatifs(tx, await tx.query.congeAbsence.findMany({ where: (t, { eq: egal }) => egal(t.id, congeId) })));
    expect(c!.justificatifs).toHaveLength(5);
    expect(Object.keys(c!.justificatifs[0]!).sort()).toEqual(["id", "nom", "taille"]);
    await dansOrg(fx, (tx) => retirerJustificatif(tx, stockage, c!.justificatifs[0]!.id, moi()));
    expect(objets.size).toBe(4);
    // Suppression de l'absence : comme l'action serveur, les clés sont relevées avant, les fichiers supprimés après.
    const cles = await dansOrg(fx, (tx) => clesDeLAbsence(tx, congeId));
    await dansOrg(fx, (tx) => supprimerConge(tx, { id: congeId, parAdmin: true }));
    await stockage.supprimer(cles);
    expect(await lignes()).toHaveLength(0);
    expect(objets.size).toBe(0);
  });
});

describe("configuration du stockage", () => {
  it("n'est active que si la clé, le secret et le bucket sont tous présents", () => {
    expect(configStockage({})).toBeNull();
    expect(configStockage({ SCALEWAY_ACCESS_KEY_ID: "SCWTEST", SCALEWAY_BUCKET: "b" })).toBeNull();
    expect(configStockage({ SCALEWAY_ACCESS_KEY_ID: "SCWTEST", SCALEWAY_SECRET_ACCESS_KEY: "s", SCALEWAY_BUCKET: "kipointe-justificatifs" })).toMatchObject({
      region: "fr-par",
      endpoint: "https://s3.fr-par.scw.cloud",
    });
  });
});
