import { describe, expect, it } from "vitest";
import {
  bornesSemaine,
  dateJournee,
  debutJournee,
  formatDuree,
  joursSemaine,
  parseSemaine,
  semaineIsoDe,
  semainePrecedente,
  semaineSuivante,
  PARAMETRES_JOURNEE_DEFAUT as P,
} from "@/lib/temps/journee";
import { paris } from "./helpers/db";

describe("journée de pointage (Europe/Paris, début 04:00)", () => {
  it("rattache un pointage à 02:30 à la veille (service de nuit)", () => {
    expect(dateJournee(paris("2026-09-17 02:30"), P)).toBe("2026-09-16");
    expect(dateJournee(paris("2026-09-17 04:00"), P)).toBe("2026-09-17");
    expect(dateJournee(paris("2026-09-17 23:59"), P)).toBe("2026-09-17");
  });

  it("calcule le début de journée en UTC en tenant compte de l'heure d'été", () => {
    expect(debutJournee(paris("2026-07-01 12:00"), P).toISOString()).toBe("2026-07-01T02:00:00.000Z");
    expect(debutJournee(paris("2026-12-01 12:00"), P).toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });

  it("gère le changement d'heure d'octobre 2026 (25 octobre, 03:00 → 02:00)", () => {
    // 02:30 le 25/10 existe deux fois ; les deux instants restent dans la journée du 24.
    expect(dateJournee(new Date("2026-10-25T00:30:00Z"), P)).toBe("2026-10-24"); // 02:30 CEST
    expect(dateJournee(new Date("2026-10-25T01:30:00Z"), P)).toBe("2026-10-24"); // 02:30 CET
    expect(dateJournee(new Date("2026-10-25T03:00:00Z"), P)).toBe("2026-10-25"); // 04:00 CET
    const { debut, fin } = bornesSemaine(2026, 43, P);
    expect(debut.toISOString()).toBe("2026-10-19T02:00:00.000Z"); // lundi 04:00 CEST
    expect(fin.toISOString()).toBe("2026-10-26T03:00:00.000Z"); // lundi 04:00 CET
  });
});

describe("semaines ISO", () => {
  it("connaît les semaines à cheval sur deux années", () => {
    expect(semaineIsoDe("2026-01-01")).toEqual({ annee: 2026, semaine: 1 });
    expect(semaineIsoDe("2027-01-01")).toEqual({ annee: 2026, semaine: 53 });
    expect(semaineIsoDe("2026-09-17")).toEqual({ annee: 2026, semaine: 38 });
  });

  it("liste les 7 jours du lundi au dimanche", () => {
    expect(joursSemaine(2026, 38)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
    expect(joursSemaine(2026, 1)[0]).toBe("2025-12-29");
  });

  it("navigue entre semaines", () => {
    expect(semaineSuivante(2026, 53)).toEqual({ annee: 2027, semaine: 1 });
    expect(semainePrecedente(2027, 1)).toEqual({ annee: 2026, semaine: 53 });
  });

  it("parse le format 2026-W37", () => {
    expect(parseSemaine("2026-W37")).toEqual({ annee: 2026, semaine: 37 });
    expect(parseSemaine("2026-W7")).toEqual({ annee: 2026, semaine: 7 });
    expect(parseSemaine("n'importe quoi")).toBeNull();
  });

  it("formate les durées", () => {
    expect(formatDuree(455)).toBe("7 h 35");
    expect(formatDuree(0)).toBe("0 h 00");
  });
});
