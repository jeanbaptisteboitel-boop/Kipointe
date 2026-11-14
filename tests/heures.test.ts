import { describe, expect, it } from "vitest";
import { compterJours, formatJours } from "@/lib/conges/types";
import { calculerCompteurHeures, departParDefaut, lireSoldeHeures, mesurerSemaines } from "@/lib/heures/compteur";
import { calculerHeuresJours } from "@/lib/heures/hebdo";
import type { JourPointage } from "@/lib/pointage/paires";
import { PLANNING_REPLI, dureeHebdo, formatHeures, heuresDuJour, planningEffectif, validerPlanning, type PlanningTravail } from "@/lib/planning";
import { estJourFerie, joursFeries, paques } from "@/lib/temps/feries";
import { horodatageLocal, instantDepuisLocal, joursDeSemaine, lundiDe, semaineIso } from "@/lib/temps/zone";

const P35: PlanningTravail = { ...PLANNING_REPLI };
const P24: PlanningTravail = { lun: 8, mar: 8, mer: 0, jeu: 8, ven: 0, sam: 0, dim: 0 };

/** Une semaine pointée : `minutes` par jour à partir du lundi. */
function semaine(lundi: string, minutes: number[]): { jours: JourPointage[] } {
  return { jours: joursDeSemaine(lundi).slice(0, minutes.length).map((date, k) => ({ date, minutes: minutes[k]!, pointages: [] })) };
}

describe("heure locale et calendrier", () => {
  it("convertit dans les deux sens, été comme hiver", () => {
    expect(instantDepuisLocal("2026-01-15 08:00:00")!.toISOString()).toBe("2026-01-15T07:00:00.000Z");
    expect(instantDepuisLocal("2026-07-15 08:00:00")!.toISOString()).toBe("2026-07-15T06:00:00.000Z");
    expect(horodatageLocal(new Date("2026-07-15T22:30:00Z"))).toEqual({ date: "2026-07-16", heure: "00:30" });
  });

  it("connaît les semaines", () => {
    expect(lundiDe("2026-11-15")).toBe("2026-11-09");
    expect(lundiDe("2026-11-09")).toBe("2026-11-09");
    expect(semaineIso("2026-01-01")).toEqual({ annee: 2026, semaine: 1 });
    expect(semaineIso("2027-01-01")).toEqual({ annee: 2026, semaine: 53 });
  });

  it("calcule Pâques et les onze jours fériés", () => {
    expect(paques(2026)).toBe("2026-04-05");
    expect(paques(2027)).toBe("2027-03-28");
    expect(joursFeries(2026).size).toBe(11);
    expect(estJourFerie("2026-04-06")).toBe(true); // lundi de Pâques
    expect(estJourFerie("2026-05-14")).toBe(true); // Ascension
    expect(estJourFerie("2026-05-25")).toBe(true); // lundi de Pentecôte
    expect(estJourFerie("2026-11-11")).toBe(true);
    expect(estJourFerie("2026-11-12")).toBe(false);
  });
});

describe("planning de travail", () => {
  it("valide heures au quart d'heure et durée hebdomadaire", () => {
    expect(validerPlanning({ lun: "7,5", mar: 7.5, mer: 7.5, jeu: 7.5, ven: 5, sam: 0, dim: "" })).toMatchObject({ ok: true, planning: { lun: 7.5, ven: 5, dim: 0 } });
    expect(validerPlanning({ ...P35, lun: 7.1 }).ok).toBe(false);
    expect(validerPlanning({ ...P35, lun: 13 }).ok).toBe(false);
    expect(validerPlanning({ lun: 0, mar: 0, mer: 0, jeu: 0, ven: 0, sam: 0, dim: 0 }).ok).toBe(false);
    expect(validerPlanning({ lun: 12, mar: 12, mer: 12, jeu: 12, ven: 12, sam: 0, dim: 0 }).ok).toBe(false);
  });

  it("résout le planning du salarié, sinon de l'organisation, sinon 35 h", () => {
    expect(planningEffectif({ planning: P24 }, { planningDefaut: null })).toEqual({ planning: P24, source: "salarie" });
    expect(planningEffectif({ planning: null }, { planningDefaut: P24 }).source).toBe("organisation");
    expect(dureeHebdo(planningEffectif(null, null).planning)).toBe(35);
    expect(heuresDuJour(P24, "2026-11-11")).toBe(0); // mercredi
    expect(heuresDuJour(P24, "2026-11-12")).toBe(8); // jeudi
    expect(formatHeures(7.5)).toBe("7 h 30");
  });
});

describe("heures jour par jour", () => {
  it("fait primer le férié sur un congé payé", () => {
    const [j] = calculerHeuresJours({ jours: ["2026-11-11"], planning: P35, conges: [{ type: "CONGE_PAYE", statut: "ACCEPTEE", dateDebut: "2026-11-09", dateFin: "2026-11-13" }] });
    expect(j).toMatchObject({ prevu: 7, feries: 7, congesPayes: 0 });
  });

  it("compte une demi-journée et ignore une demande non acceptée", () => {
    const jours = calculerHeuresJours({
      jours: ["2026-11-12", "2026-11-13"],
      planning: P35,
      conges: [
        { type: "CONGE_PAYE", statut: "ACCEPTEE", dateDebut: "2026-11-12", dateFin: "2026-11-12", demiJourDebut: "APREM" },
        { type: "CONGE_PAYE", statut: "EN_ATTENTE", dateDebut: "2026-11-13", dateFin: "2026-11-13" },
      ],
    });
    expect(jours[0]!.congesPayes).toBe(3.5);
    expect(jours[1]!.congesPayes).toBe(0);
  });

  it("fait passer la maladie avant le congé payé le même jour", () => {
    const [j] = calculerHeuresJours({
      jours: ["2026-11-12"],
      planning: P35,
      conges: [
        { type: "CONGE_PAYE", statut: "ACCEPTEE", dateDebut: "2026-11-09", dateFin: "2026-11-13" },
        { type: "MALADIE", statut: "ACCEPTEE", dateDebut: "2026-11-12", dateFin: "2026-11-12" },
      ],
    });
    expect(j).toMatchObject({ maladie: 7, congesPayes: 0 });
  });

  it("ne compte rien hors période d'emploi ni dans l'avenir", () => {
    const jours = calculerHeuresJours({ jours: ["2026-11-10", "2026-11-12", "2026-11-13"], planning: P35, conges: [], dateEntree: "2026-11-12", aujourdhui: "2026-11-12" });
    expect(jours[0]).toMatchObject({ horsEmploi: true, prevu: 0 });
    expect(jours[1]).toMatchObject({ prevu: 7, aVenir: false });
    expect(jours[2]).toMatchObject({ aVenir: true });
  });
});

describe("compteur d'heures", () => {
  const base = { planning: P35, conges: [], dateEntree: "2020-01-01", aujourdhui: "2026-11-18" };

  it("mesure l'écart d'une semaine terminée : heures manquantes puis supplémentaires", () => {
    const [m] = mesurerSemaines({ ...base, pointagesSemaines: [semaine("2026-11-02", [420, 420, 420, 420, 300])] }, ["2026-11-02"]);
    expect(m).toMatchObject({ prevuMinutes: 2100, travailleMinutes: 1980, ecartMinutes: -120, terminee: true });
    const [p] = mesurerSemaines({ ...base, pointagesSemaines: [semaine("2026-11-02", [480, 480, 480, 480, 420])] }, ["2026-11-02"]);
    expect(p!.ecartMinutes).toBe(240);
  });

  it("assimile férié et congé accepté à du temps réalisé, pas l'absence non autorisée", () => {
    // Semaine du 9 novembre 2026 : mercredi 11 férié.
    const donnees = { ...base, pointagesSemaines: [semaine("2026-11-09", [420, 420, 0, 0, 0])] };
    const [ferie] = mesurerSemaines({ ...donnees, conges: [{ type: "CONGE_PAYE", statut: "ACCEPTEE", dateDebut: "2026-11-12", dateFin: "2026-11-13" }] }, ["2026-11-09"]);
    expect(ferie).toMatchObject({ prevuMinutes: 2100, travailleMinutes: 840, assimileMinutes: 1260, ecartMinutes: 0 });
    const [abs] = mesurerSemaines({ ...donnees, conges: [{ type: "ABSENCE_NON_AUTORISEE", statut: "ACCEPTEE", dateDebut: "2026-11-12", dateFin: "2026-11-13" }] }, ["2026-11-09"]);
    expect(abs).toMatchObject({ assimileMinutes: 420, nonAutoriseMinutes: 840, ecartMinutes: -840 });
  });

  it("arrête la semaine en cours au dernier jour renseigné", () => {
    // Mercredi 18 novembre : lundi et mardi pointés.
    const [m] = mesurerSemaines({ ...base, pointagesSemaines: [semaine("2026-11-16", [430, 400])] }, ["2026-11-16"]);
    expect(m).toMatchObject({ terminee: false, prevuMinutes: 840, travailleMinutes: 830, ecartMinutes: -10 });
    const [vide] = mesurerSemaines({ ...base, pointagesSemaines: [] }, ["2026-11-16"]);
    expect(vide).toMatchObject({ prevuMinutes: 0, ecartMinutes: 0 });
  });

  it("cumule le solde depuis la date de départ, proratise la première semaine", () => {
    const r = calculerCompteurHeures({
      ...base,
      depart: "2026-11-04", // un mercredi
      soldeDepartMinutes: 60,
      pointagesSemaines: [semaine("2026-11-02", [0, 0, 480, 480, 480]), semaine("2026-11-09", [420, 420, 0, 420, 420])],
    });
    expect(r.semaines.map((s) => [s.lundi, s.prevuMinutes, s.ecartMinutes, s.soldeApresMinutes])).toEqual([
      ["2026-11-02", 1260, 180, 240],
      ["2026-11-09", 2100, 0, 240],
      ["2026-11-16", 0, 0, null],
    ]);
    expect(r.soldeMinutes).toBe(240);
    expect(r.soldeAu).toBe("2026-11-15");
    expect(r.enCours?.lundi).toBe("2026-11-16");
  });

  it("part du 1er janvier par défaut, ou de l'entrée si elle est plus récente", () => {
    expect(departParDefaut("2026-11-18", "2020-01-01")).toBe("2026-01-01");
    expect(departParDefaut("2026-11-18", "2026-09-01")).toBe("2026-09-01");
    expect(departParDefaut("2026-11-18", "2020-01-01", "2025-06-30")).toBe("2025-01-01");
  });

  it("lit un solde saisi en heures", () => {
    expect(lireSoldeHeures("3,25")).toBe(195);
    expect(lireSoldeHeures("-1:30")).toBe(-90);
    expect(lireSoldeHeures("−2h15")).toBe(-135);
    expect(lireSoldeHeures("")).toBeNull();
    expect(lireSoldeHeures("abc")).toBe("invalide");
  });
});

describe("décompte des jours d'absence", () => {
  it("compte les jours travaillés du planning, hors fériés", () => {
    // Du lundi 9 au vendredi 13 novembre 2026, mercredi 11 férié.
    expect(compterJours({ dateDebut: "2026-11-09", dateFin: "2026-11-13" }, P35)).toBe(4);
    expect(compterJours({ dateDebut: "2026-11-09", dateFin: "2026-11-15" }, P24)).toBe(3);
    expect(compterJours({ dateDebut: "2026-11-14", dateFin: "2026-11-15" }, P35)).toBe(0);
  });

  it("compte les demi-journées", () => {
    expect(compterJours({ dateDebut: "2026-11-12", dateFin: "2026-11-13", demiJourDebut: "APREM" }, P35)).toBe(1.5);
    expect(compterJours({ dateDebut: "2026-11-12", dateFin: "2026-11-12", demiJourFin: "MATIN" }, P35)).toBe(0.5);
    expect(formatJours(1.5)).toBe("1,5 jour");
    expect(formatJours(2)).toBe("2 jours");
  });
});
