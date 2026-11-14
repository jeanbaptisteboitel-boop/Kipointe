import { describe, expect, it } from "vitest";
import { LimiteurDebit, horsBornes, masquerNumeroSerie, normaliserNumeroSerie, normaliserPin, parserAttlog, routeAdms, texteHandshake, typeDepuisStatut } from "@/lib/pointeuse/adms";

describe("protocole ADMS de la pointeuse", () => {
  it("lit les lignes ATTLOG séparées par des tabulations, en CRLF comme en LF", () => {
    const { lignes, invalides } = parserAttlog("0002\t2026-11-12 08:01:15\t0\t1\t0\t0\r\n7\t2026-11-12 12:03:00\t255\t15\n");
    expect(invalides).toBe(0);
    expect(lignes).toEqual([
      { pin: "2", horodatageLocal: "2026-11-12 08:01:15", date: "2026-11-12", heure: "08:01", statut: 0, verification: 1 },
      { pin: "7", horodatageLocal: "2026-11-12 12:03:00", date: "2026-11-12", heure: "12:03", statut: 255, verification: 15 },
    ]);
  });

  it("accepte les micrologiciels anciens (espaces, heure sans secondes)", () => {
    const { lignes } = parserAttlog("12 2026-11-12 8:05 1");
    expect(lignes[0]).toMatchObject({ pin: "12", horodatageLocal: "2026-11-12 08:05:00", heure: "08:05", statut: 1 });
  });

  it("compte les lignes illisibles sans les enregistrer", () => {
    const { lignes, invalides } = parserAttlog("5\t2026-02-30 08:00:00\t0\n5\t2026-11-12 25:00:00\t0\nn'importe quoi\n\n");
    expect(lignes).toHaveLength(0);
    expect(invalides).toBe(3);
  });

  it("traduit les codes d'état, et les ignore en mode alternance", () => {
    expect(typeDepuisStatut(0)).toBe("arrivee");
    expect(typeDepuisStatut(1)).toBe("depart");
    expect(typeDepuisStatut(2)).toBe("pause_debut");
    expect(typeDepuisStatut(3)).toBe("pause_fin");
    expect(typeDepuisStatut(4)).toBe("arrivee");
    expect(typeDepuisStatut(5)).toBe("depart");
    expect(typeDepuisStatut(255)).toBe("auto");
    expect(typeDepuisStatut(null)).toBe("auto");
    expect(typeDepuisStatut(0, "ALTERNANCE")).toBe("auto");
  });

  it("normalise numéro de série et PIN", () => {
    expect(normaliserNumeroSerie(" cquh233560123 ")).toBe("CQUH233560123");
    expect(normaliserNumeroSerie("ab")).toBeNull();
    expect(normaliserNumeroSerie("AB CD 12")).toBeNull();
    expect(normaliserPin("0002")).toBe("2");
    expect(normaliserPin("0")).toBe("0");
    expect(normaliserPin("A07")).toBe("A07");
    expect(masquerNumeroSerie("CQUH233560123")).toBe("CQ…23");
  });

  it("reconnaît les chemins du protocole, avec ou sans .aspx", () => {
    expect(routeAdms(["cdata"])).toBe("cdata");
    expect(routeAdms(["cdata.aspx"])).toBe("cdata");
    expect(routeAdms(["getrequest"])).toBe("getrequest");
    expect(routeAdms(["devicecmd"])).toBe("devicecmd");
    expect(routeAdms(["ping"])).toBe("autre");
  });

  it("rend une poignée de main avec le fuseau de l'organisation, été comme hiver", () => {
    const hiver = texteHandshake({ numeroSerie: "SN0001", stampAttlog: null, maintenant: new Date("2026-01-15T10:00:00Z"), fuseau: "Europe/Paris" });
    expect(hiver).toContain("GET OPTION FROM: SN0001");
    expect(hiver).toContain("ATTLOGStamp=None");
    expect(hiver).toContain("TimeZone=1");
    expect(hiver).toContain("Realtime=1");
    const ete = texteHandshake({ numeroSerie: "SN0001", stampAttlog: "9871", maintenant: new Date("2026-07-15T10:00:00Z"), fuseau: "Europe/Paris" });
    expect(ete).toContain("ATTLOGStamp=9871");
    expect(ete).toContain("TimeZone=2");
  });

  it("écarte les badgeages trop anciens ou dans le futur", () => {
    const maintenant = new Date("2026-11-12T09:00:00Z");
    expect(horsBornes("2026-11-12", maintenant, "Europe/Paris")).toBeNull();
    expect(horsBornes("2026-11-14", maintenant, "Europe/Paris")).toBeNull();
    expect(horsBornes("2026-11-15", maintenant, "Europe/Paris")).toBe("futur");
    expect(horsBornes("2026-09-13", maintenant, "Europe/Paris")).toBeNull();
    expect(horsBornes("2026-09-12", maintenant, "Europe/Paris")).toBe("ancien");
  });

  it("limite le débit par clé", () => {
    const l = new LimiteurDebit(2, 1000);
    expect(l.autoriser("a", 0)).toBe(true);
    expect(l.autoriser("a", 10)).toBe(true);
    expect(l.autoriser("a", 20)).toBe(false);
    expect(l.autoriser("b", 20)).toBe(true);
    expect(l.autoriser("a", 1500)).toBe(true);
  });
});
