import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { masquerMobile, normaliserMobile, signatureOvh } from "@/lib/sms/ovh";
import { activerTablette, creerTablette, pointerParCode, trouverTablette, type TabletteConnue } from "@/lib/tablette/service";
import { demanderCodeSms, destinatairesSms } from "@/lib/tablette/sms";
import { creerFixture, dansOrg, type Fixture } from "./helpers/db";

const T0 = new Date("2026-11-16T07:02:00Z");
const plus = (min: number) => new Date(T0.getTime() + min * 60_000);

describe("numéros et signature", () => {
  it("met un mobile français au format international et refuse le reste", () => {
    expect(normaliserMobile("06 12 34 56 78")).toBe("+33612345678");
    expect(normaliserMobile("+33 7 12 34 56 78")).toBe("+33712345678");
    expect(normaliserMobile("0033612345678")).toBe("+33612345678");
    expect(normaliserMobile("+32470123456")).toBe("+32470123456");
    expect(normaliserMobile("02 35 00 00 00")).toBeNull(); // fixe
    expect(normaliserMobile("612345678")).toBeNull();
    expect(masquerMobile("+33612345678")).toBe("06 •• •• •• 78");
  });
  it("signe une requête comme l'attend OVH", () => {
    // sha1("secret+jeton+POST+https://exemple/1.0/x+{}+1700000000")
    expect(signatureOvh("secret", "jeton", "POST", "https://exemple/1.0/x", "{}", 1700000000)).toMatch(/^\$1\$[0-9a-f]{40}$/);
  });
});

describe("pointage par SMS", () => {
  let fx: Fixture;
  let t: TabletteConnue;
  const envois: { numero: string; message: string }[] = [];
  const envoyer = async (numero: string, message: string) => (envois.push({ numero, message }), true);
  const dernierCode = () => /(\d{6})/.exec(envois[envois.length - 1]!.message)![1]!;
  const recharger = async (jeton: string) => (t = (await trouverTablette(fx.db, jeton))!);
  let jeton: string;

  beforeAll(async () => {
    fx = await creerFixture();
    const { codeActivation } = await dansOrg(fx, (tx) => creerTablette(tx, fx.organisation.id, "Entrée", T0));
    jeton = (await activerTablette(fx.db, codeActivation, T0))!;
    await dansOrg(fx, (tx) => tx.update(schema.salarie).set({ telephone: "+33612345678" }).where(eq(schema.salarie.id, fx.salaries[0]!.id)));
    await recharger(jeton);
  });
  afterAll(() => fx.fermer());

  it("reste fermé tant que l'éditeur n'a pas ouvert l'option", async () => {
    await withBypass(fx.db, (tx) => tx.update(schema.organisation).set({ tabletteSms: true }).where(eq(schema.organisation.id, fx.organisation.id)));
    await recharger(jeton);
    expect(t.modeSms).toBe(false);
    expect(await demanderCodeSms(fx.db, t, fx.salaries[0]!.id, T0, envoyer, true)).toEqual({ ok: false, raison: "MODE_FERME" });
    await withBypass(fx.db, (tx) => tx.update(schema.organisation).set({ optionSms: true }).where(eq(schema.organisation.id, fx.organisation.id)));
    await recharger(jeton);
    expect(t.modeSms).toBe(true);
  });

  it("ne propose que les salariés qui ont un mobile", async () => {
    expect(await dansOrg(fx, (tx) => destinatairesSms(tx, fx.organisation.id, "2026-11-16"))).toEqual([{ id: fx.salaries[0]!.id, nom: "Prenom1 N." }]);
    expect(await demanderCodeSms(fx.db, t, fx.salaries[1]!.id, T0, envoyer, true)).toEqual({ ok: false, raison: "SALARIE_INCONNU" });
  });

  it("envoie un code, pointe avec, et ne l'accepte qu'une fois", async () => {
    expect(await demanderCodeSms(fx.db, t, fx.salaries[0]!.id, T0, envoyer, true)).toEqual({ ok: true, mobile: "06 •• •• •• 78" });
    expect(envois).toHaveLength(1);
    expect(envois[0]!.numero).toBe("+33612345678");
    const code = dernierCode();
    expect(await pointerParCode(fx.db, t, code, plus(1))).toMatchObject({ ok: true, sens: "arrivee", prenom: "Prenom1" });
    expect(await pointerParCode(fx.db, t, code, plus(10))).toMatchObject({ ok: false, raison: "CODE_INCONNU" });
    const [trace] = await dansOrg(fx, (tx) => tx.select().from(schema.pointageTablette));
    expect(trace!.mode).toBe("SMS");
  });

  it("limite les envois et refuse un code périmé", async () => {
    expect(await demanderCodeSms(fx.db, t, fx.salaries[0]!.id, new Date(T0.getTime() + 30_000), envoyer, true)).toEqual({ ok: false, raison: "PATIENTEZ" });
    expect(await demanderCodeSms(fx.db, t, fx.salaries[0]!.id, plus(20), envoyer, true)).toMatchObject({ ok: true });
    expect(await pointerParCode(fx.db, t, dernierCode(), plus(26))).toMatchObject({ ok: false, raison: "CODE_INCONNU" });
  });

  it("ne garde aucune trace facturable quand le SMS ne part pas", async () => {
    const avant = (await dansOrg(fx, (tx) => tx.select().from(schema.smsPointage))).length;
    expect(await demanderCodeSms(fx.db, t, fx.salaries[0]!.id, plus(60), async () => false, true)).toEqual({ ok: false, raison: "ENVOI_IMPOSSIBLE" });
    expect(await demanderCodeSms(fx.db, t, fx.salaries[0]!.id, plus(60), envoyer, false)).toEqual({ ok: false, raison: "SERVICE_ABSENT" });
    expect((await dansOrg(fx, (tx) => tx.select().from(schema.smsPointage))).length).toBe(avant);
  });
});
