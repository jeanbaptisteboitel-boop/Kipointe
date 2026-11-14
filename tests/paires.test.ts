import { describe, expect, it } from "vitest";
import { fusionnerImport, normaliserNom, parsePointageCsv } from "@/lib/pointage/csv";
import { appliquerPointage, formatEcart, formatMinutes, jourIncomplet, minutesDepuisPointages, normaliserHeure, normaliserPointagesSaisis, resoudreTypeAuto, type JourPointage } from "@/lib/pointage/paires";

describe("paires de pointage", () => {
  it("compte la réunion des plages, jamais deux fois la même minute", () => {
    expect(minutesDepuisPointages([{ entree: "08:00", sortie: "12:00" }, { entree: "13:00", sortie: "17:00" }])).toBe(480);
    expect(minutesDepuisPointages([{ entree: "08:00", sortie: "12:00" }, { entree: "11:00", sortie: "13:00" }])).toBe(300);
    expect(minutesDepuisPointages([{ entree: "08:00", sortie: null }])).toBe(0);
    expect(minutesDepuisPointages([{ entree: "08:00", sortie: null }, { entree: null, sortie: "12:00" }])).toBe(240);
  });

  it("ouvre puis ferme une paire au fil des badgeages", () => {
    let r = appliquerPointage([], "2026-11-12", "08:00", "arrivee");
    expect(r.jours[0]!.pointages).toEqual([{ entree: "08:00", sortie: null, source: "pointeuse" }]);
    r = appliquerPointage(r.jours, "2026-11-12", "12:00", "depart");
    expect(r.minutesJour).toBe(240);
    r = appliquerPointage(r.jours, "2026-11-12", "13:00", "arrivee");
    r = appliquerPointage(r.jours, "2026-11-12", "17:30", "depart");
    expect(r.minutesJour).toBe(510);
    expect(r.totalMinutes).toBe(510);
  });

  it("ignore une seconde arrivée et un double badge de sortie", () => {
    const ouverte = appliquerPointage([], "2026-11-12", "08:00", "arrivee");
    expect(appliquerPointage(ouverte.jours, "2026-11-12", "08:20", "arrivee").deja).toBe(true);
    const fermee = appliquerPointage(ouverte.jours, "2026-11-12", "12:00", "depart");
    expect(appliquerPointage(fermee.jours, "2026-11-12", "12:01", "depart").deja).toBe(true);
  });

  it("garde visible une sortie sans entrée (oubli de badge)", () => {
    const r = appliquerPointage([], "2026-11-12", "17:00", "depart");
    expect(r.jours[0]!.pointages).toEqual([{ entree: null, sortie: "17:00", source: "pointeuse" }]);
    expect(r.minutesJour).toBe(0);
    expect(jourIncomplet(r.jours[0]!.pointages)).toBe(true);
  });

  it("alterne arrivée et départ quand la pointeuse n'indique pas le sens", () => {
    expect(resoudreTypeAuto([], "2026-11-12", "08:00")).toBe("arrivee");
    const ouverte = appliquerPointage([], "2026-11-12", "08:00", "arrivee");
    expect(resoudreTypeAuto(ouverte.jours, "2026-11-12", "08:01")).toBeNull();
    expect(resoudreTypeAuto(ouverte.jours, "2026-11-12", "12:00")).toBe("depart");
    const fermee = appliquerPointage(ouverte.jours, "2026-11-12", "12:00", "depart");
    expect(resoudreTypeAuto(fermee.jours, "2026-11-12", "13:00")).toBe("arrivee");
  });

  it("note la pause quand l'appareil l'indique", () => {
    const a = appliquerPointage([], "2026-11-12", "08:00", "arrivee");
    const p = appliquerPointage(a.jours, "2026-11-12", "12:00", "pause_debut");
    expect(p.jours[0]!.pointages[0]).toMatchObject({ sortie: "12:00", pause: true });
  });

  it("nettoie une saisie manuelle", () => {
    expect(normaliserHeure("8:5")).toBeNull();
    expect(normaliserHeure("8:05")).toBe("08:05");
    expect(normaliserHeure("24:00")).toBeNull();
    expect(normaliserPointagesSaisis([{ entree: "13:00", sortie: "17:00" }, { entree: "8:00", sortie: "12:00" }, { entree: "", sortie: "" }], "manuel")).toEqual([
      { entree: "08:00", sortie: "12:00", source: "manuel" },
      { entree: "13:00", sortie: "17:00", source: "manuel" },
    ]);
  });

  it("formate durées et écarts", () => {
    expect(formatMinutes(425)).toBe("7h05");
    expect(formatEcart(195)).toBe("+3 h 15");
    expect(formatEcart(-30)).toBe("−0 h 30");
    expect(formatEcart(0)).toBe("0 h 00");
  });
});

const CSV = [
  "Période de paie ,,,22/06/2026-28/06/2026,",
  "Employé,,,Melanie  Jourdain (2),",
  "Date,,ENTRÉE,SORTIE,Temps de travail, Total quotidien, Note,",
  "LUN,22/06/2026,07:04,13:24,06:20,",
  ",,14:13,17:40,03:27,09:47,",
  "MAR,23/06/2026,08:00,12:00,04:00,04:00,",
  "MER,24/06/2026,,,,,",
  "Heures totales,,,,,13:47,",
  "Période de paie ,,,22/06/2026-28/06/2026,",
  "Employé,,,Paul Durand (11),",
  "Date,,ENTRÉE,SORTIE,Temps de travail, Total quotidien, Note,",
  "LUN,22/06/2026,09:00,17:00,08:00,08:00,",
  "Heures totales,,,,,08:00,",
].join("\r\n");

describe("fichier CSV de la pointeuse", () => {
  it("lit un bloc par employé, avec son numéro de pointeuse", () => {
    const semaines = parsePointageCsv(CSV);
    expect(semaines).toHaveLength(2);
    expect(semaines[0]).toMatchObject({ nom: "Melanie Jourdain", pointeuseRef: "2", semaineDebut: "2026-06-22", semaineFin: "2026-06-28", totalMinutes: 827 });
    expect(semaines[0]!.jours.map((j) => [j.date, j.minutes, j.pointages.length])).toEqual([
      ["2026-06-22", 587, 2],
      ["2026-06-23", 240, 1],
      ["2026-06-24", 0, 0],
    ]);
    expect(semaines[1]).toMatchObject({ nom: "Paul Durand", pointeuseRef: "11", totalMinutes: 480 });
  });

  it("redécoupe une période de plusieurs semaines par semaine civile", () => {
    const csv = ["Période de paie ,,,01/06/2026-14/06/2026,", "Employé,,,A B (1),", "VEN,05/06/2026,08:00,12:00,04:00,04:00,", "LUN,08/06/2026,08:00,12:00,04:00,04:00,"].join("\n");
    expect(parsePointageCsv(csv).map((s) => s.semaineDebut)).toEqual(["2026-06-01", "2026-06-08"]);
  });

  it("rapproche les noms sans tenir compte des accents ni de la casse", () => {
    expect(normaliserNom("  Mélanie   JOURDAIN ")).toBe("melanie jourdain");
  });

  it("garde une journée saisie à la main quand le fichier est vide ce jour-là, et la remplace sinon", () => {
    const existants: JourPointage[] = [
      { date: "2026-06-24", minutes: 420, pointages: [{ entree: "09:00", sortie: "16:00", source: "manuel" }] },
      { date: "2026-06-23", minutes: 60, pointages: [{ entree: "09:00", sortie: "10:00", source: "manuel" }] },
      { date: "2026-06-27", minutes: 120, pointages: [{ entree: "09:00", sortie: "11:00", source: "pointeuse" }] },
    ];
    const f = fusionnerImport(parsePointageCsv(CSV)[0]!.jours, existants);
    expect(f.jours.find((j) => j.date === "2026-06-24")!.minutes).toBe(420);
    expect(f.jours.find((j) => j.date === "2026-06-23")!.minutes).toBe(240);
    expect(f.jours.find((j) => j.date === "2026-06-27")!.minutes).toBe(120);
    expect(f.saisiesRemplacees).toEqual(["2026-06-23"]);
    expect(f.totalMinutes).toBe(587 + 240 + 420 + 120);
  });
});
