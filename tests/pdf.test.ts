import { describe, expect, it } from "vitest";
import { sha256HexBytes } from "@/lib/crypto";
import { genererPdfRecap } from "@/lib/pdf/recap";
import { texteDuPdf } from "./helpers/pdf";

describe("PDF du récapitulatif hebdomadaire", () => {
  it("génère un document A4 lisible sans l'application : journées, total, majorations, traçabilité", async () => {
    const pdf = await genererPdfRecap({
      recapId: "11111111-1111-4111-8111-111111111111",
      reference: "KP-2026-S38-SAL001",
      organisation: {
        raisonSociale: "Crêperie de l'Écluse SARL",
        siret: "912 345 678 00019",
        conventionCollective: "HCR — Hôtels, cafés, restaurants (IDCC 1979)",
        adresse: "12 rue Verte, 76000 Rouen",
      },
      salarie: { nom: "Lefèvre", prenom: "Zoé", matricule: "SAL-001", contratHeuresHebdo: 2100 },
      annee: 2026,
      semaine: 38,
      jours: [
        {
          date: "2026-09-14",
          minutes: 450,
          amplitudeMinutes: 570,
          intervalles: [
            { debut: "2026-09-14T07:00:00Z", fin: "2026-09-14T10:00:00Z", minutes: 180 },
            { debut: "2026-09-14T12:00:00Z", fin: "2026-09-14T16:30:00Z", minutes: 270 },
          ],
          anomalies: [],
        },
        { date: "2026-09-15", minutes: 180, amplitudeMinutes: 180, intervalles: [{ debut: "2026-09-15T07:00:00Z", fin: null, minutes: 0 }], anomalies: ["OUBLI_SORTIE"] },
        { date: "2026-09-16", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
        { date: "2026-09-17", minutes: 450, amplitudeMinutes: 570, intervalles: [{ debut: "2026-09-17T07:00:00Z", fin: "2026-09-17T14:30:00Z", minutes: 450 }], anomalies: [] },
        { date: "2026-09-18", minutes: 525, amplitudeMinutes: 645, intervalles: [{ debut: "2026-09-18T07:00:00Z", fin: "2026-09-18T15:45:00Z", minutes: 525 }], anomalies: [] },
        { date: "2026-09-19", minutes: 570, amplitudeMinutes: 750, intervalles: [{ debut: "2026-09-19T09:00:00Z", fin: "2026-09-19T18:30:00Z", minutes: 570 }], anomalies: [] },
        { date: "2026-09-20", minutes: 0, amplitudeMinutes: 0, intervalles: [], anomalies: [] },
      ],
      notes: {
        "2026-09-15": ["Sortie de 18:30 ajoutée par saisie manuelle du gérant le 17/09/2026, motif « oubli de badge »."],
        "2026-09-19": ["Sortie de 20:30 enregistrée hors ligne sur le terminal, transmise le 20/09/2026 à 08:12."],
      },
      totalMinutes: 2175,
      heuresSup: [
        { taux: 25, minutes: 75 },
        { taux: 50, minutes: 0 },
      ],
      dureeHebdoReference: 2100,
      timezone: "Europe/Paris",
      genereLe: new Date("2026-09-21T07:14:00Z"),
      validePar: "Démo Gérant (gerant@restaurant-demo.fr)",
      correctionsCount: 1,
      horsLigneCount: 1,
      annulesCount: 0,
      anomaliesCount: 1,
    });

    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
    expect(sha256HexBytes(pdf)).toMatch(/^[0-9a-f]{64}$/);

    const texte = texteDuPdf(pdf);
    // Les mentions légales et le décompte doivent figurer dans le document lui-même.
    expect(texte).toContain("R\u00e9capitulatif hebdomadaire");
    expect(texte).toContain("D.3171-8");
    expect(texte).toContain("LEF\u00c8VRE");
    expect(texte).toContain("KP-2026-S38-SAL001");
    expect(texte).toContain("36 h 15"); // total de 2175 minutes
    expect(texte).toContain("1 h 15"); // heures supplémentaires à 25 %
    expect(texte).toContain("oubli de badge"); // la correction est reportée sur le PDF
    expect(texte).toContain("hors ligne");
  });
});
