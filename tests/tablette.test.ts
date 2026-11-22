import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withBypass, withTenant } from "@/db/tenant";
import { fichePointage } from "@/lib/tablette/fiche";
import { DUREE_PAS_MS, jetonQr, lireJetonQr, normaliserCode, verifierJetonQr } from "@/lib/tablette/jeton";
import { activerTablette, creerTablette, definirCodeSalarie, pointerParCode, pointerParQr, renouvelerActivation, trouverTablette, type TabletteConnue } from "@/lib/tablette/service";
import { creerFixture, creerOrganisation, dansOrg, type Fixture } from "./helpers/db";

// Lundi 16 novembre 2026, 08:02 à Paris.
const T0 = new Date("2026-11-16T07:02:00Z");
const plus = (min: number) => new Date(T0.getTime() + min * 60_000);

describe("jetons du QR code", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("vaut pour le pas courant et les deux suivants, pas au-delà", () => {
    const j = lireJetonQr(jetonQr(id, "secret", T0))!;
    expect(verifierJetonQr(j, "secret", T0)).toBe("VALIDE");
    expect(verifierJetonQr(j, "secret", new Date(T0.getTime() + 2 * DUREE_PAS_MS))).toBe("VALIDE");
    expect(verifierJetonQr(j, "secret", new Date(T0.getTime() + 4 * DUREE_PAS_MS))).toBe("EXPIRE");
  });
  it("refuse une signature d'un autre secret ou un pas modifié", () => {
    const j = lireJetonQr(jetonQr(id, "secret", T0))!;
    expect(verifierJetonQr(j, "autre", T0)).toBe("FAUX");
    expect(verifierJetonQr({ ...j, pas: j.pas + 1 }, "secret", T0)).toBe("FAUX");
    expect(lireJetonQr("n'importe quoi")).toBeNull();
  });
  it("n'accepte que 4 à 6 chiffres comme code personnel", () => {
    expect(normaliserCode("12 34")).toBe("1234");
    expect(normaliserCode("123")).toBeNull();
    expect(normaliserCode("12a4")).toBeNull();
  });
});

describe("tablette", () => {
  let fx: Fixture;
  let t: TabletteConnue;
  let code1: string;
  beforeAll(async () => {
    fx = await creerFixture();
    const { codeActivation } = await dansOrg(fx, (tx) => creerTablette(tx, fx.organisation.id, "Entrée atelier", T0));
    const jeton = await activerTablette(fx.db, codeActivation.toLowerCase(), T0);
    expect(jeton).toBeTruthy();
    expect(await activerTablette(fx.db, codeActivation, T0)).toBeNull(); // usage unique
    t = (await trouverTablette(fx.db, jeton))!;
    code1 = await dansOrg(fx, (tx) => definirCodeSalarie(tx, fx.organisation.id, fx.salaries[0]!.id));
  });
  afterAll(() => fx.fermer());

  const semaine = () =>
    dansOrg(fx, async (tx) => (await tx.select().from(schema.pointageSemaine).where(eq(schema.pointageSemaine.salarieId, fx.salaries[0]!.id)))[0]);

  it("pointe par code : arrivée, double pointage ignoré, puis départ", async () => {
    const a = await pointerParCode(fx.db, t, code1, T0);
    expect(a).toMatchObject({ ok: true, sens: "arrivee", heure: "08:02", prenom: "Prenom1" });
    expect(await pointerParCode(fx.db, t, code1, plus(1))).toMatchObject({ ok: true, sens: "double_badge" });
    expect(await pointerParCode(fx.db, t, code1, plus(240))).toMatchObject({ ok: true, sens: "depart", heure: "12:02" });
    const s = await semaine();
    expect(s!.totalMinutes).toBe(240);
    expect(s!.jours[0]!.pointages).toEqual([{ entree: "08:02", sortie: "12:02", source: "tablette" }]);
  });

  it("bloque le clavier après cinq codes faux, puis le rouvre", async () => {
    const faux = code1 === "0000" ? "1111" : "0000";
    for (let i = 0; i < 4; i++) expect(await pointerParCode(fx.db, t, faux, plus(300))).toMatchObject({ ok: false, raison: "CODE_INCONNU" });
    expect(await pointerParCode(fx.db, t, faux, plus(300))).toMatchObject({ ok: false, raison: "BLOQUEE" });
    // Même le bon code attend la fin du blocage.
    expect(await pointerParCode(fx.db, t, code1, plus(300))).toMatchObject({ ok: false, raison: "BLOQUEE" });
    expect(await pointerParCode(fx.db, t, code1, plus(302))).toMatchObject({ ok: true, sens: "arrivee" });
  });

  it("pointe par QR code depuis le téléphone du salarié", async () => {
    const qui = { organisationId: fx.organisation.id, salarieId: fx.salaries[1]!.id };
    const jeton = jetonQr(t.id, t.secretQr, plus(10));
    expect(await pointerParQr(fx.db, { jeton, ...qui }, plus(10))).toMatchObject({ ok: true, sens: "arrivee", tablette: "Entrée atelier", prenom: "Prenom2" });
    expect(await pointerParQr(fx.db, { jeton, ...qui }, plus(20))).toMatchObject({ ok: false, raison: "QR_EXPIRE" });
    expect(await pointerParQr(fx.db, { jeton: jetonQr(t.id, "faux-secret", plus(10)), ...qui }, plus(10))).toMatchObject({ ok: false, raison: "QR_INVALIDE" });
  });

  it("refuse le QR code de la tablette d'un autre client", async () => {
    const autre = await creerOrganisation(fx.db, { raisonSociale: "Autre", numeroSerie: "AUTRE000001" });
    const r = await pointerParQr(fx.db, { jeton: jetonQr(t.id, t.secretQr, T0), organisationId: autre.org.id, salarieId: autre.salaries[0]!.id }, T0);
    expect(r).toMatchObject({ ok: false, raison: "AUTRE_ENTREPRISE" });
  });

  it("respecte les modes fermés par l'entreprise", async () => {
    await withBypass(fx.db, (tx) => tx.update(schema.organisation).set({ tabletteCode: false, tabletteQr: false }).where(eq(schema.organisation.id, fx.organisation.id)));
    const ferme = { ...t, modeCode: false, modeQr: false };
    expect(await pointerParCode(fx.db, ferme, code1, plus(400))).toMatchObject({ ok: false, raison: "MODE_FERME" });
    const r = await pointerParQr(fx.db, { jeton: jetonQr(t.id, t.secretQr, plus(400)), organisationId: fx.organisation.id, salarieId: fx.salaries[1]!.id }, plus(400));
    expect(r).toMatchObject({ ok: false, raison: "MODE_FERME" });
    await withBypass(fx.db, (tx) => tx.update(schema.organisation).set({ tabletteCode: true, tabletteQr: true }).where(eq(schema.organisation.id, fx.organisation.id)));
  });

  it("prépare les rappels et les chiffres montrés au pointage", async () => {
    const s1 = fx.salaries[0]!.id;
    await dansOrg(fx, async (tx) => {
      await tx.insert(schema.rendezVous).values([
        { organisationId: fx.organisation.id, salarieId: s1, intitule: "Visite médicale", jour: "2026-11-17", heure: "09:30", precision: "Centre de Rouen" },
        { organisationId: fx.organisation.id, salarieId: s1, intitule: "Trop loin", jour: "2027-03-01" },
        { organisationId: fx.organisation.id, salarieId: s1, intitule: "Passé", jour: "2026-11-10" },
        { organisationId: fx.organisation.id, salarieId: fx.salaries[1]!.id, intitule: "Celui d'un collègue", jour: "2026-11-17" },
      ]);
      await tx.update(schema.salarie).set({ cpSoldeJours: 12.5, cpSoldeAu: "2026-06-01" }).where(eq(schema.salarie.id, s1));
    });
    const f = (await dansOrg(fx, (tx) => fichePointage(tx, fx.organisation.id, s1, plus(600))))!;
    expect(f.rappels).toEqual([{ id: expect.any(String), intitule: "Visite médicale", quand: "demain à 09 h 30", precision: "Centre de Rouen" }]);
    expect(f.conges).toEqual({ solde: expect.stringContaining("12,5"), enAttente: null });
    expect(f.jours[0]).toMatchObject({ jour: "Aujourd'hui", prevu: expect.stringContaining("7") });
    expect(f.jours[0]!.detail).toContain("08:02 → 12:02");
  });

  it("donne des codes distincts et coupe la tablette quand son activation est renouvelée", async () => {
    const code2 = await dansOrg(fx, (tx) => definirCodeSalarie(tx, fx.organisation.id, fx.salaries[1]!.id));
    expect(code2).not.toBe(code1);
    const jetonAvant = await activerTablette(fx.db, await dansOrg(fx, (tx) => renouvelerActivation(tx, t.id, T0)), T0);
    await dansOrg(fx, (tx) => renouvelerActivation(tx, t.id, T0));
    expect(await trouverTablette(fx.db, jetonAvant)).toBeNull();
  });
});

describe("photo au pointage", () => {
  const jpeg = (taille = 2000) => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(taille, 7)]).toString("base64")}`;

  it("n'accepte qu'un vrai JPEG de taille raisonnable", async () => {
    const { lirePhoto, TAILLE_MAX_PHOTO } = await import("@/lib/tablette/photo");
    expect(lirePhoto(jpeg())?.length).toBe(2004);
    expect(lirePhoto(`data:image/jpeg;base64,${Buffer.from("<html>pas une image</html>".repeat(60)).toString("base64")}`)).toBeNull();
    expect(lirePhoto(jpeg().replace("image/jpeg", "image/png"))).toBeNull();
    expect(lirePhoto(jpeg(TAILLE_MAX_PHOTO))).toBeNull();
    expect(lirePhoto(undefined)).toBeNull();
  });

  it("range la photo, la montre à l'administrateur seulement, puis la détruit après trente jours", async () => {
    const { enregistrerPhoto, lirePhoto, purgerPhotos, trouverPhoto } = await import("@/lib/tablette/photo");
    const fx = await creerFixture();
    const autre = await creerOrganisation(fx.db, { raisonSociale: "Autre", numeroSerie: "AUTRE000002" });
    const objets = new Map<string, Uint8Array>();
    const bucket = { ecrire: async (cle: string, o: Uint8Array) => void objets.set(cle, o), supprimer: async (cles: string[]) => cles.forEach((c) => objets.delete(c)) } as unknown as import("@/lib/stockage").Stockage;
    const { codeActivation } = await dansOrg(fx, (tx) => creerTablette(tx, fx.organisation.id, "Entrée", T0));
    const t = (await trouverTablette(fx.db, await activerTablette(fx.db, codeActivation, T0)))!;
    const code = await dansOrg(fx, (tx) => definirCodeSalarie(tx, fx.organisation.id, fx.salaries[0]!.id));
    const r = await pointerParCode(fx.db, t, code, T0);
    if (!r.ok) throw new Error("pointage refusé");

    expect(await enregistrerPhoto(fx.db, bucket, { organisationId: fx.organisation.id, pointageId: r.pointageId, octets: lirePhoto(jpeg())! })).toBe(true);
    expect([...objets.keys()]).toEqual([`pointages/${fx.organisation.id}/${r.pointageId}.jpg`]);
    expect(await dansOrg(fx, (tx) => trouverPhoto(tx, r.pointageId))).toMatchObject({ salarieId: fx.salaries[0]!.id, heure: "08:02" });
    // Un autre client ne voit pas cette photo, et ne peut pas en rattacher une à ce pointage.
    expect(await withTenant(fx.db, autre.org.id, (tx) => trouverPhoto(tx, r.pointageId))).toBeNull();
    expect(await enregistrerPhoto(fx.db, bucket, { organisationId: autre.org.id, pointageId: r.pointageId, octets: lirePhoto(jpeg())! })).toBe(false);
    expect(objets.size).toBe(1);

    expect(await withBypass(fx.db, (tx) => purgerPhotos(tx, plus(29 * 24 * 60)))).toEqual([]);
    const cles = await withBypass(fx.db, (tx) => purgerPhotos(tx, plus(31 * 24 * 60)));
    expect(cles).toEqual([`pointages/${fx.organisation.id}/${r.pointageId}.jpg`]);
    expect(await dansOrg(fx, (tx) => trouverPhoto(tx, r.pointageId))).toBeNull();
    await fx.fermer();
  });
});
