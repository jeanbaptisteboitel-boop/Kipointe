import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { traiterLot } from "@/lib/pointage/service";
import { hacherSecret } from "@/lib/auth/password";
import { verificateurHorsLigne } from "@/lib/crypto";
import { creerFixture, dansTenant, paris, pointer, PIN_TEST, type Fixture } from "./helpers/db";

describe("service de pointage badge + PIN", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await creerFixture({ nbSalaries: 4 });
  });
  afterAll(async () => {
    await fx.fermer();
  });

  it("hache les PIN en Argon2id", async () => {
    expect(await hacherSecret("1234")).toMatch(/^\$argon2id\$/);
    expect(fx.salaries[0]!.pinHash).toMatch(/^\$argon2id\$/);
  });

  it("refuse un badge inconnu et le journalise", async () => {
    const res = await pointer(fx, { ...fx.salaries[0]!, badgeUuid: randomUUID() }, paris("2026-09-14 08:00"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BADGE_INCONNU");
    const journal = await dansTenant(fx, (tx) => tx.select().from(schema.tentativePointage).where(eq(schema.tentativePointage.resultat, "BADGE_INCONNU")));
    expect(journal).toHaveLength(1);
  });

  it("déduit le type côté serveur : entrée, puis sortie, puis entrée (coupure)", async () => {
    const s = fx.salaries[0]!;
    const r1 = await pointer(fx, s, paris("2026-09-14 09:00"));
    const r2 = await pointer(fx, s, paris("2026-09-14 12:00"));
    const r3 = await pointer(fx, s, paris("2026-09-14 14:00"));
    const r4 = await pointer(fx, s, paris("2026-09-14 18:30"));
    expect(r1.ok && r1.pointage.type).toBe("ENTREE");
    expect(r2.ok && r2.pointage.type).toBe("SORTIE");
    expect(r3.ok && r3.pointage.type).toBe("ENTREE");
    expect(r4.ok && r4.pointage.type).toBe("SORTIE");
    // total du jour affiché à la sortie : 3 h + 4 h 30
    expect(r4.ok && r4.totalJourMinutes).toBe(450);
    expect(r3.ok && r3.totalJourMinutes).toBe(180);
    expect(r4.ok && r4.verificateurHorsLigne).toBe(verificateurHorsLigne(fx.ctx.token, s.badgeUuid, s.pinVersion, PIN_TEST));
  });

  it("refuse un rebond (deux scans à moins de 60 s) sans créer de pointage", async () => {
    const s = fx.salaries[1]!;
    const r1 = await pointer(fx, s, paris("2026-09-14 09:00:00".slice(0, 16)));
    const r2 = await pointer(fx, s, new Date(paris("2026-09-14 09:00").getTime() + 20_000));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("DOUBLON");
  });

  it("signale un double scan entre 60 s et 5 min (anomalie DOUBLE_SCAN, pointage conservé)", async () => {
    const s = fx.salaries[1]!;
    const r = await pointer(fx, s, new Date(paris("2026-09-14 09:00").getTime() + 90_000));
    expect(r.ok).toBe(true);
    const anomalies = await dansTenant(fx, (tx) => tx.select().from(schema.anomalie).where(eq(schema.anomalie.salarieId, s.id)));
    expect(anomalies.map((a) => a.type)).toContain("DOUBLE_SCAN");
  });

  it("rejoue une idempotency_key déjà consommée sans créer de doublon", async () => {
    const s = fx.salaries[2]!;
    const cle = randomUUID();
    const r1 = await pointer(fx, s, paris("2026-09-14 10:00"), { idempotencyKey: cle });
    const r2 = await pointer(fx, s, paris("2026-09-14 10:00"), { idempotencyKey: cle });
    expect(r1.ok && r1.statut).toBe("OK");
    expect(r2.ok && r2.statut).toBe("REJOUE");
    expect(r2.ok && r1.ok && r2.pointage.id).toBe(r1.ok ? r1.pointage.id : null);
    const [n] = await dansTenant(fx, (tx) => tx.select({ n: count() }).from(schema.pointage).where(eq(schema.pointage.salarieId, s.id)));
    expect(Number(n!.n)).toBe(1);
  });

  it("verrouille le badge 15 minutes après 5 PIN faux, journalise chaque échec, puis se déverrouille", async () => {
    const s = fx.salaries[3]!;
    const t0 = paris("2026-09-14 11:00");
    const resultats = [];
    for (let i = 0; i < 6; i++) {
      resultats.push(await pointer(fx, s, new Date(t0.getTime() + i * 1000), { pin: "0000" }));
    }
    const codes = resultats.map((r) => (r.ok ? "OK" : r.code));
    expect(codes).toEqual(["PIN_INCORRECT", "PIN_INCORRECT", "PIN_INCORRECT", "PIN_INCORRECT", "BADGE_VERROUILLE", "BADGE_VERROUILLE"]);
    const r1 = resultats[0]!;
    expect(!r1.ok && r1.detail?.tentativesRestantes).toBe(4);
    const r5 = resultats[4]!;
    expect(!r5.ok && r5.detail?.jusqua).toBe(new Date(t0.getTime() + 4000 + 15 * 60_000).toISOString());

    // Le bon PIN reste refusé pendant le verrouillage.
    const pendant = await pointer(fx, s, new Date(t0.getTime() + 60_000));
    expect(!pendant.ok && pendant.code).toBe("BADGE_VERROUILLE");

    const journal = await dansTenant(fx, (tx) => tx.select().from(schema.tentativePointage).where(eq(schema.tentativePointage.salarieId, s.id)));
    expect(journal.filter((j) => j.resultat === "PIN_INCORRECT")).toHaveLength(5);
    expect(journal.filter((j) => j.resultat === "VERROUILLE")).toHaveLength(2);
    const anomalies = await dansTenant(fx, (tx) => tx.select().from(schema.anomalie).where(eq(schema.anomalie.salarieId, s.id)));
    expect(anomalies.map((a) => a.type)).toContain("PIN_VERROUILLE");

    // Après 15 minutes, le bon PIN passe (le rate limit compte les échecs sur 60 s seulement).
    const apres = await pointer(fx, s, new Date(t0.getTime() + 16 * 60_000));
    expect(apres.ok).toBe(true);
    expect(apres.ok && apres.pointage.type).toBe("ENTREE");
  });
});

describe("rate limiting", () => {
  it("bloque un terminal après 10 échecs en une minute", async () => {
    const fx = await creerFixture({ nbSalaries: 1 });
    try {
      const t0 = paris("2026-09-15 08:00");
      for (let i = 0; i < 10; i++) {
        const r = await pointer(fx, { ...fx.salaries[0]!, badgeUuid: randomUUID() }, new Date(t0.getTime() + i * 1000));
        expect(!r.ok && r.code).toBe("BADGE_INCONNU");
      }
      const bloque = await pointer(fx, fx.salaries[0]!, new Date(t0.getTime() + 11_000));
      expect(!bloque.ok && bloque.code).toBe("RATE_LIMIT");
      // Une minute plus tard, tout rentre dans l'ordre.
      const ok = await pointer(fx, fx.salaries[0]!, new Date(t0.getTime() + 75_000));
      expect(ok.ok).toBe(true);
    } finally {
      await fx.fermer();
    }
  });
});

describe("horloge de la tablette", () => {
  it("en ligne : l'horloge serveur fait foi même si la tablette dérive de 10 minutes", async () => {
    const fx = await creerFixture({ nbSalaries: 1 });
    try {
      const serveur = paris("2026-09-15 09:00");
      const tablette = new Date(serveur.getTime() - 10 * 60_000); // 10 min de retard
      const r = await pointer(fx, fx.salaries[0]!, serveur, { horodatageTerminal: tablette, offsetHorlogeMs: 0 });
      expect(r.ok && r.pointage.horodatage).toBe(serveur.toISOString());
      expect(r.ok && r.deriveHorlogeMs).toBe(10 * 60_000);
      // Avec un offset mesuré au heartbeat, la dérive est compensée.
      const r2 = await pointer(fx, fx.salaries[0]!, new Date(serveur.getTime() + 3600_000), {
        horodatageTerminal: new Date(serveur.getTime() + 3600_000 - 10 * 60_000),
        offsetHorlogeMs: 10 * 60_000,
      });
      expect(r2.ok && r2.deriveHorlogeMs).toBe(0);
    } finally {
      await fx.fermer();
    }
  });

  it("hors ligne : l'heure retenue est l'horloge tablette corrigée de l'offset", async () => {
    const fx = await creerFixture({ nbSalaries: 1 });
    try {
      const reel = paris("2026-09-15 09:00");
      const tablette = new Date(reel.getTime() - 10 * 60_000);
      const resync = new Date(reel.getTime() + 4 * 3600_000);
      const r = await pointer(fx, fx.salaries[0]!, resync, { horodatageTerminal: tablette, offsetHorlogeMs: 10 * 60_000, horsLigne: true });
      expect(r.ok && r.pointage.horodatage).toBe(reel.toISOString());
      expect(r.ok && r.pointage.source).toBe("KIOSQUE_HORS_LIGNE");
      const anomalies = await dansTenant(fx, (tx) => tx.select().from(schema.anomalie));
      expect(anomalies.map((a) => a.type)).toContain("POINTAGE_HORS_LIGNE");
    } finally {
      await fx.fermer();
    }
  });

  it("hors ligne : un horodatage dans le futur est ramené à l'heure serveur et signalé", async () => {
    const fx = await creerFixture({ nbSalaries: 1 });
    try {
      const resync = paris("2026-09-15 12:00");
      const r = await pointer(fx, fx.salaries[0]!, resync, { horodatageTerminal: new Date(resync.getTime() + 3600_000), offsetHorlogeMs: 0, horsLigne: true });
      expect(r.ok && r.pointage.horodatage).toBe(resync.toISOString());
      const [a] = await dansTenant(fx, (tx) => tx.select().from(schema.anomalie).where(eq(schema.anomalie.type, "POINTAGE_HORS_LIGNE")));
      expect(JSON.stringify(a!.detail)).toContain("horodatageFuturRamene");
    } finally {
      await fx.fermer();
    }
  });
});

describe("coupure réseau de 4 h avec 60 pointages en file", () => {
  it("resynchronise 60 pointages, tous datés de l'heure réelle, et ignore un second rejeu", async () => {
    const fx = await creerFixture({ nbSalaries: 30 });
    try {
      const debutCoupure = paris("2026-09-16 11:00");
      const resync = new Date(debutCoupure.getTime() + 4 * 3600_000);
      const offset = 90_000; // la tablette retarde d'1 min 30
      const items = [];
      for (let i = 0; i < 30; i++) {
        const s = fx.salaries[i]!;
        const entree = new Date(debutCoupure.getTime() + i * 60_000);
        const sortie = new Date(entree.getTime() + 3 * 3600_000);
        for (const reel of [entree, sortie]) {
          items.push({
            badgeUuid: s.badgeUuid,
            pin: PIN_TEST,
            idempotencyKey: randomUUID(),
            horodatageTerminal: new Date(reel.getTime() - offset),
            offsetHorlogeMs: offset,
            horsLigne: true,
          });
        }
      }
      expect(items).toHaveLength(60);
      // La file est rejouée dans le désordre : le service trie par horodatage tablette.
      const melange = [...items].sort(() => Math.random() - 0.5);

      const r1 = await traiterLot(fx.db, fx.ctx, melange, resync);
      expect(r1.every((r) => r.ok && r.statut === "OK")).toBe(true);
      const types = r1.filter((r) => r.ok).map((r) => (r.ok ? r.pointage.type : ""));
      expect(types.filter((t) => t === "ENTREE")).toHaveLength(30);
      expect(types.filter((t) => t === "SORTIE")).toHaveLength(30);

      const pointages = await dansTenant(fx, (tx) => tx.select().from(schema.pointage));
      expect(pointages).toHaveLength(60);
      expect(pointages.every((p) => p.source === "KIOSQUE_HORS_LIGNE")).toBe(true);
      // Heure réelle = horloge tablette + offset ; heure serveur = heure de resynchronisation.
      const premier = pointages.find((p) => p.salarieId === fx.salaries[0]!.id && p.type === "ENTREE")!;
      expect(premier.horodatageEffectif.toISOString()).toBe(debutCoupure.toISOString());
      expect(premier.horodatageServeur.toISOString()).toBe(resync.toISOString());

      // Second rejeu (la tablette n'a pas reçu l'accusé) : tout est REJOUE, rien n'est créé.
      const r2 = await traiterLot(fx.db, fx.ctx, melange, new Date(resync.getTime() + 60_000));
      expect(r2.every((r) => r.ok && r.statut === "REJOUE")).toBe(true);
      const [n] = await dansTenant(fx, (tx) => tx.select({ n: count() }).from(schema.pointage));
      expect(Number(n!.n)).toBe(60);
    } finally {
      await fx.fermer();
    }
  }, 120_000);

  it("rejette un PIN faux rejoué hors ligne sans bloquer le reste du lot", async () => {
    const fx = await creerFixture({ nbSalaries: 2 });
    try {
      const t0 = paris("2026-09-16 09:00");
      const r = await traiterLot(
        fx.db,
        fx.ctx,
        [
          { badgeUuid: fx.salaries[0]!.badgeUuid, pin: "9999", idempotencyKey: randomUUID(), horodatageTerminal: t0, offsetHorlogeMs: 0, horsLigne: true },
          { badgeUuid: fx.salaries[1]!.badgeUuid, pin: PIN_TEST, idempotencyKey: randomUUID(), horodatageTerminal: new Date(t0.getTime() + 1000), offsetHorlogeMs: 0, horsLigne: true },
        ],
        new Date(t0.getTime() + 3600_000),
      );
      expect(r[0]!.ok).toBe(false);
      expect(!r[0]!.ok && r[0]!.code).toBe("PIN_INCORRECT");
      expect(r[1]!.ok).toBe(true);
    } finally {
      await fx.fermer();
    }
  });
});
