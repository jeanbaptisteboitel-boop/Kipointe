import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { calculerSemaineSalarie } from "@/lib/calcul/recap";
import { calculerHeuresSup, calculerSemaine, parametresDepuis, type ParametresCalcul } from "@/lib/calcul/semaine";
import type { PointageEffectif } from "@/lib/calcul/effectifs";
import { creerFixture, dansTenant, paris, pointer, type Fixture } from "./helpers/db";

function pe(local: string, type: schema.TypePointage): PointageEffectif {
  const h = paris(local);
  return { id: randomUUID(), salarieId: "s", etablissementId: "e", terminalId: null, horodatage: h, type, source: "KIOSQUE", corrige: false, motif: null, original: { horodatage: h, type } };
}

const ORG = {
  id: "o",
  raisonSociale: "Test",
  siret: null,
  conventionCollective: null,
  dureeHebdoReference: 2100,
  paliersHeuresSup: schema.PALIERS_HEURES_SUP_DEFAUT,
  reposQuotidienMin: 660,
  reposHebdoMin: 2100,
  pauseObligatoireApres: 360,
  pauseDureeMin: 20,
  amplitudeMax: 780,
  journeeDebutHeure: 4,
  antiDoublonSecondes: 60,
  createdAt: new Date(),
} satisfies schema.Organisation;

const P: ParametresCalcul = parametresDepuis(ORG, "Europe/Paris");
const APRES = paris("2026-10-05 12:00"); // toutes les semaines testées sont terminées

describe("moteur hebdomadaire (pur)", () => {
  it("ventile les heures supplémentaires : 45 h → 8 h à 25 %, 2 h à 50 %", () => {
    expect(calculerHeuresSup(45 * 60, schema.PALIERS_HEURES_SUP_DEFAUT)).toEqual([
      { taux: 25, minutes: 480 },
      { taux: 50, minutes: 120 },
    ]);
    expect(calculerHeuresSup(30 * 60, schema.PALIERS_HEURES_SUP_DEFAUT)).toEqual([
      { taux: 25, minutes: 0 },
      { taux: 50, minutes: 0 },
    ]);
  });

  it("applique les paliers HCR paramétrés (10 % / 20 % / 50 %)", () => {
    const hcr = [
      { seuilHeures: 35, taux: 10 },
      { seuilHeures: 39, taux: 20 },
      { seuilHeures: 43, taux: 50 },
    ];
    expect(calculerHeuresSup(45 * 60, hcr)).toEqual([
      { taux: 10, minutes: 240 },
      { taux: 20, minutes: 240 },
      { taux: 50, minutes: 120 },
    ]);
  });

  it("compte le temps réel lors du changement d'heure d'octobre (service de nuit 22:00 → 03:30)", () => {
    // Samedi 24/10/2026 22:00 CEST = 20:00Z ; dimanche 25/10 03:30 CET = 02:30Z → 6 h 30.
    const pts = [
      { ...pe("2026-10-24 22:00", "ENTREE"), horodatage: new Date("2026-10-24T20:00:00Z") },
      { ...pe("2026-10-24 22:00", "SORTIE"), horodatage: new Date("2026-10-25T02:30:00Z") },
    ];
    const res = calculerSemaine(pts, 2026, 43, P, APRES);
    expect(res.totalMinutes).toBe(390);
    expect(res.jours[5]!.date).toBe("2026-10-24");
    expect(res.jours[5]!.minutes).toBe(390);
    // 6 h 30 d'affilée sans pause : l'alerte prouve que c'est bien le temps réel (5 h 30 en heure locale naïve) qui est compté.
    expect(res.anomalies.map((a) => a.type)).toEqual(["PAUSE_MANQUANTE"]);
  });

  it("détecte l'oubli de sortie sur deux jours consécutifs sans compter d'heures fantômes", () => {
    const pts = [pe("2026-09-14 09:00", "ENTREE"), pe("2026-09-15 09:00", "ENTREE"), pe("2026-09-16 09:00", "ENTREE"), pe("2026-09-16 17:00", "SORTIE")];
    const res = calculerSemaine(pts, 2026, 38, P, APRES);
    expect(res.totalMinutes).toBe(480);
    const oublis = res.anomalies.filter((a) => a.type === "OUBLI_SORTIE").map((a) => a.dateJour);
    expect(oublis).toEqual(["2026-09-14", "2026-09-15"]);
    expect(res.jours[0]!.intervalles[0]!.fin).toBeNull();
  });

  it("alerte sur un repos quotidien inférieur à 11 h", () => {
    const pts = [pe("2026-09-14 14:00", "ENTREE"), pe("2026-09-14 23:30", "SORTIE"), pe("2026-09-15 08:00", "ENTREE"), pe("2026-09-15 12:00", "SORTIE")];
    const res = calculerSemaine(pts, 2026, 38, P, APRES);
    const repos = res.anomalies.find((a) => a.type === "REPOS_11H");
    expect(repos?.dateJour).toBe("2026-09-15");
    expect(repos?.detail.reposMinutes).toBe(510);
  });

  it("alerte sur l'absence de pause de 20 min après 6 h de travail continu", () => {
    const sansPause = calculerSemaine([pe("2026-09-14 08:00", "ENTREE"), pe("2026-09-14 15:00", "SORTIE")], 2026, 38, P, APRES);
    expect(sansPause.anomalies.map((a) => a.type)).toContain("PAUSE_MANQUANTE");

    const pauseCourte = calculerSemaine(
      [pe("2026-09-14 08:00", "ENTREE"), pe("2026-09-14 12:00", "SORTIE"), pe("2026-09-14 12:10", "ENTREE"), pe("2026-09-14 15:00", "SORTIE")],
      2026, 38, P, APRES,
    );
    expect(pauseCourte.anomalies.map((a) => a.type)).toContain("PAUSE_MANQUANTE");

    const avecPause = calculerSemaine(
      [pe("2026-09-14 08:00", "ENTREE"), pe("2026-09-14 12:00", "SORTIE"), pe("2026-09-14 12:30", "ENTREE"), pe("2026-09-14 15:00", "SORTIE")],
      2026, 38, P, APRES,
    );
    expect(avecPause.anomalies).toEqual([]);
    expect(avecPause.totalMinutes).toBe(390);
  });

  it("alerte sur une amplitude supérieure à 13 h", () => {
    const res = calculerSemaine(
      [pe("2026-09-14 07:00", "ENTREE"), pe("2026-09-14 12:00", "SORTIE"), pe("2026-09-14 16:00", "ENTREE"), pe("2026-09-14 21:00", "SORTIE")],
      2026, 38, P, APRES,
    );
    expect(res.anomalies.map((a) => a.type)).toContain("AMPLITUDE");
    expect(res.jours[0]!.amplitudeMinutes).toBe(840);
  });

  it("alerte sur un repos hebdomadaire inférieur à 35 h consécutives", () => {
    const pts: PointageEffectif[] = [];
    // Dimanche 13/09 (semaine précédente) travaillé, puis tous les jours 09:00-17:00 jusqu'au dimanche 20/09.
    for (const d of ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]) {
      pts.push(pe(`${d} 09:00`, "ENTREE"), pe(`${d} 17:00`, "SORTIE"));
    }
    const res = calculerSemaine(pts, 2026, 38, P, APRES);
    const hebdo = res.anomalies.find((a) => a.type === "REPOS_HEBDO");
    expect(hebdo?.dateJour).toBe("2026-09-20");
    expect(res.totalMinutes).toBe(7 * 480);
    expect(res.heuresSup).toEqual([
      { taux: 25, minutes: 480 },
      { taux: 50, minutes: 780 },
    ]);

    // Sans le dimanche 13 : le repos précédant la reprise du lundi est réputé suffisant → pas d'alerte.
    const avecRepos = calculerSemaine(pts.slice(2), 2026, 38, P, APRES);
    expect(avecRepos.anomalies.map((a) => a.type)).not.toContain("REPOS_HEBDO");
    // Le repos du dimanche 20 au lundi 21 sera crédité à la semaine 39 : ici, la semaine 38 reste en défaut
    // si l'on ne travaille que 7 jours d'affilée (dimanche 13 → samedi 19).
    const septJours = calculerSemaine(pts.slice(0, 14), 2026, 38, P, APRES);
    expect(septJours.anomalies.map((a) => a.type)).toContain("REPOS_HEBDO");
  });

  it("ne signale pas d'oubli de sortie pour une journée en cours", () => {
    const enCours = calculerSemaine([pe("2026-09-17 09:00", "ENTREE")], 2026, 38, P, paris("2026-09-17 11:00"));
    expect(enCours.anomalies).toEqual([]);
    expect(enCours.jours[3]!.enCours).toBe(true);
    expect(enCours.terminee).toBe(false);
  });
});

describe("moteur hebdomadaire (base) : corrections et synchronisation des anomalies", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await creerFixture({ nbSalaries: 2 });
  });
  afterAll(async () => {
    await fx.fermer();
  });

  it("oubli de sortie deux jours de suite via le service : le lendemain repart sur une ENTREE", async () => {
    const s = fx.salaries[0]!;
    const lundi = await pointer(fx, s, paris("2026-09-14 09:00"));
    const mardi = await pointer(fx, s, paris("2026-09-15 09:00"));
    const mercredi = await pointer(fx, s, paris("2026-09-16 09:00"));
    const mercrediSoir = await pointer(fx, s, paris("2026-09-16 17:00"));
    expect([lundi, mardi, mercredi, mercrediSoir].map((r) => r.ok && r.pointage.type)).toEqual(["ENTREE", "ENTREE", "ENTREE", "SORTIE"]);

    const sem = await dansTenant(fx, (tx) => calculerSemaineSalarie(tx, fx.organisation.id, s.id, 2026, 38, APRES));
    expect(sem.resultat.totalMinutes).toBe(480);
    const anomalies = await dansTenant(fx, (tx) => tx.select().from(schema.anomalie).where(eq(schema.anomalie.salarieId, s.id)));
    expect(anomalies.filter((a) => a.type === "OUBLI_SORTIE").map((a) => a.dateJour).sort()).toEqual(["2026-09-14", "2026-09-15"]);
  });

  it("une saisie manuelle de sortie (tracée) lève l'oubli et compte les heures", async () => {
    const s = fx.salaries[0]!;
    await dansTenant(fx, (tx) =>
      tx.insert(schema.pointage).values({
        organisationId: fx.organisation.id,
        salarieId: s.id,
        etablissementId: fx.etablissement.id,
        horodatageServeur: APRES,
        horodatageEffectif: paris("2026-09-14 17:00"),
        type: "SORTIE",
        source: "SAISIE_MANUELLE",
        idempotencyKey: randomUUID(),
        saisiParId: fx.gerant.id,
        motif: "Sortie oubliée, confirmée par le chef de cuisine",
      }),
    );
    const sem = await dansTenant(fx, (tx) => calculerSemaineSalarie(tx, fx.organisation.id, s.id, 2026, 38, APRES));
    expect(sem.resultat.totalMinutes).toBe(960);
    const anomalies = await dansTenant(fx, (tx) => tx.select().from(schema.anomalie).where(eq(schema.anomalie.salarieId, s.id)));
    expect(anomalies.filter((a) => a.type === "OUBLI_SORTIE").map((a) => a.dateJour)).toEqual(["2026-09-15"]);
  });

  it("une correction additive (annulation, changement d'heure) modifie la vue effective sans toucher au pointage", async () => {
    const s = fx.salaries[1]!;
    const e = await pointer(fx, s, paris("2026-09-17 08:00"));
    const sortie = await pointer(fx, s, paris("2026-09-17 12:00"));
    const bruit = await pointer(fx, s, paris("2026-09-17 12:03"));
    expect(bruit.ok && bruit.pointage.type).toBe("ENTREE");
    if (!e.ok || !sortie.ok || !bruit.ok) throw new Error("pointages attendus");

    await dansTenant(fx, async (tx) => {
      await tx.insert(schema.correction).values({
        pointageId: bruit.pointage.id,
        organisationId: fx.organisation.id,
        auteurId: fx.gerant.id,
        ancienneValeur: { horodatage: bruit.pointage.horodatage, type: "ENTREE" },
        nouvelleValeur: { annule: true },
        motif: "Scan par erreur en quittant",
      });
      await tx.insert(schema.correction).values({
        pointageId: sortie.pointage.id,
        organisationId: fx.organisation.id,
        auteurId: fx.gerant.id,
        ancienneValeur: { horodatage: sortie.pointage.horodatage, type: "SORTIE" },
        nouvelleValeur: { horodatage: paris("2026-09-17 12:30").toISOString(), type: "SORTIE" },
        motif: "Sortie réelle à 12:30 (service prolongé)",
      });
    });

    const sem = await dansTenant(fx, (tx) => calculerSemaineSalarie(tx, fx.organisation.id, s.id, 2026, 38, APRES));
    expect(sem.resultat.totalMinutes).toBe(270);
    expect(sem.pointages).toHaveLength(2);
    expect(sem.pointages[1]!.corrige).toBe(true);
    // La table pointage est intacte.
    const brut = await dansTenant(fx, (tx) => tx.select().from(schema.pointage).where(eq(schema.pointage.id, sortie.pointage.id)));
    expect(brut[0]!.horodatageEffectif.toISOString()).toBe(sortie.pointage.horodatage);
  });
});
