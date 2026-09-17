import { describe, expect, it } from "vitest";
import { genererPdfRecap } from "@/lib/pdf/recap";
import { sha256HexBytes } from "@/lib/crypto";

describe("PDF du récap hebdo", () => {
  it("génère un PDF A4 avec les journées, le total et les majorations", async () => {
    const pdf = await genererPdfRecap({
      recapId: "11111111-1111-1111-1111-111111111111",
      organisation: { raisonSociale: "Crêperie de l'Écluse", siret: "12345678900012", conventionCollective: "HCR (IDCC 1979)" },
      salarie: { nom: "Lefèvre", prenom: "Zoé", matricule: "007", contratHeuresHebdo: 2100 },
      annee: 2026,
      semaine: 38,
      jours: [
        { date: "2026-09-14", minutes: 480, amplitudeMinutes: 540, intervalles: [{ debut: "2026-09-14T07:00:00Z", fin: "2026-09-14T11:00:00Z", minutes: 240 }, { debut: "2026-09-14T12:00:00Z", fin: "2026-09-14T16:00:00Z", minutes: 240 }], anomalies: [] },
        { date: "2026-09-15", minutes: 0, amplitudeMinutes: 0, intervalles: [{ debut: "2026-09-15T07:00:00Z", fin: null, minutes: 0 }], anomalies: ["OUBLI_SORTIE"] },
        { date: "2026-09-16", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
        { date: "2026-09-17", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
        { date: "2026-09-18", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
        { date: "2026-09-19", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
        { date: "2026-09-20", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
      ],
      totalMinutes: 480,
      heuresSup: [{ taux: 25, minutes: 0 }, { taux: 50, minutes: 0 }],
      dureeHebdoReference: 2100,
      timezone: "Europe/Paris",
      genereLe: new Date("2026-09-21T08:00:00Z"),
      validePar: "Démo Gérant",
      correctionsCount: 1,
      horsLigneCount: 2,
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1500);
    expect(sha256HexBytes(pdf)).toMatch(/^[0-9a-f]{64}$/);
  });
});
