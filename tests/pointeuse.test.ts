import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { badgeage, pointageSemaine, salarie } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { deciderSemaine, enregistrerJour, importerCsv } from "@/lib/pointage/semaine";
import { parserAttlog } from "@/lib/pointeuse/adms";
import { enregistrerLignesAttlog, retraiterNonRattaches, trouverPointeuse } from "@/lib/pointeuse/enregistrement";
import { attlog, creerFixture, creerOrganisation, dansOrg, type Fixture } from "./helpers/db";

const MAINTENANT = new Date("2026-11-12T18:00:00Z");

let fx: Fixture;
beforeAll(async () => {
  fx = await creerFixture();
});
afterAll(() => fx.fermer());

const envoyer = (texte: string) => enregistrerLignesAttlog(fx.db, { pointeuse: fx.pointeuse, lignes: parserAttlog(texte).lignes, maintenant: MAINTENANT });
const semaineDe = (salarieId: string, lundi = "2026-11-09") =>
  dansOrg(fx, async (tx) => (await tx.select().from(pointageSemaine).where(eq(pointageSemaine.salarieId, salarieId))).find((s) => s.semaineDebut === lundi));

describe("réception des badgeages de la pointeuse", () => {
  it("range les badgeages d'un salarié dans sa semaine", async () => {
    const bilan = await envoyer([attlog("1", "2026-11-12 08:02:11"), attlog("1", "2026-11-12 12:00:40"), attlog("1", "2026-11-12 13:05:00"), attlog("1", "2026-11-12 17:31:09")].join("\n"));
    expect(bilan).toMatchObject({ recues: 4, traitees: 4, doublons: 0, nonRattachees: 0, complet: true });
    const s = await semaineDe(fx.salaries[0]!.id);
    expect(s).toMatchObject({ semaineFin: "2026-11-15", totalMinutes: 238 + 266, statut: "EN_ATTENTE" });
    expect(s!.jours[0]!.pointages).toEqual([
      { entree: "08:02", sortie: "12:00", source: "pointeuse" },
      { entree: "13:05", sortie: "17:31", source: "pointeuse" },
    ]);
  });

  it("ignore un renvoi des mêmes lignes (l'appareil renvoie volontiers)", async () => {
    const bilan = await envoyer([attlog("1", "2026-11-12 08:02:11"), attlog("1", "2026-11-12 17:31:09")].join("\n"));
    expect(bilan).toMatchObject({ traitees: 0, doublons: 2 });
    expect((await semaineDe(fx.salaries[0]!.id))!.totalMinutes).toBe(504);
  });

  it("ignore un double badge dans les deux minutes", async () => {
    const bilan = await envoyer([attlog("2", "2026-11-12 09:00:00"), attlog("2", "2026-11-12 09:00:45")].join("\n"));
    expect(bilan).toMatchObject({ traitees: 1, ignorees: 1 });
    expect((await semaineDe(fx.salaries[1]!.id))!.jours[0]!.pointages).toEqual([{ entree: "09:00", sortie: null, source: "pointeuse" }]);
  });

  it("écarte les badgeages hors bornes (horloge déréglée, vieil historique)", async () => {
    const bilan = await envoyer([attlog("1", "2031-01-01 08:00:00"), attlog("1", "2025-01-01 08:00:00")].join("\n"));
    expect(bilan).toMatchObject({ horsBornes: 2, traitees: 0 });
  });

  it("garde un numéro inconnu « non rattaché », puis le reporte une fois la fiche renseignée", async () => {
    const bilan = await envoyer([attlog("42", "2026-11-10 08:00:00"), attlog("42", "2026-11-10 16:00:00")].join("\n"));
    expect(bilan).toMatchObject({ nonRattachees: 2, traitees: 0 });
    const nouveau = await dansOrg(fx, async (tx) => {
      const [s] = await tx.insert(salarie).values({ organisationId: fx.organisation.id, nom: "Nouveau", prenom: "Venu", pointeuseRef: "0042" }).returning();
      return s!;
    });
    const r = await dansOrg(fx, (tx) => retraiterNonRattaches(tx, fx.organisation.id, { maintenant: MAINTENANT }));
    expect(r).toEqual({ traitees: 2, ignorees: 0, restantes: 0 });
    expect((await semaineDe(nouveau.id))!.totalMinutes).toBe(480);
    const restants = await dansOrg(fx, (tx) => tx.select().from(badgeage).where(eq(badgeage.etat, "NON_RATTACHE")));
    expect(restants).toHaveLength(0);
  });

  it("remet la semaine « à valider » dès qu'un badgeage arrive après validation", async () => {
    const id = fx.salaries[0]!.id;
    const s = (await semaineDe(id))!;
    await dansOrg(fx, (tx) => deciderSemaine(tx, { semaineId: s.id, salarieId: id, action: "valider" }));
    expect((await semaineDe(id))!.statut).toBe("VALIDE");
    await envoyer([attlog("1", "2026-11-13 08:00:00")].join("\n"));
    expect((await semaineDe(id))!.statut).toBe("EN_ATTENTE");
  });

  it("refuse la validation de la semaine d'un autre salarié", async () => {
    const s = (await semaineDe(fx.salaries[0]!.id))!;
    await expect(dansOrg(fx, (tx) => deciderSemaine(tx, { semaineId: s.id, salarieId: fx.salaries[1]!.id, action: "valider" }))).rejects.toThrow("Semaine introuvable");
    await expect(dansOrg(fx, (tx) => deciderSemaine(tx, { semaineId: s.id, salarieId: fx.salaries[0]!.id, action: "demander_modif", commentaire: " " }))).rejects.toThrow();
  });

  it("corrige une journée à la main", async () => {
    const id = fx.salaries[1]!.id;
    const r = await dansOrg(fx, (tx) =>
      enregistrerJour(tx, { organisationId: fx.organisation.id, salarieId: id, date: "2026-11-12", pointages: [{ entree: "09:00", sortie: "17:00", source: "pointeuse" }] }),
    );
    expect(r.minutes).toBe(480);
    expect((await semaineDe(id))!.totalMinutes).toBe(480);
  });
});

describe("import du fichier CSV", () => {
  it("apparie par numéro puis par nom, et mémorise le numéro", async () => {
    await dansOrg(fx, (tx) => tx.insert(salarie).values({ organisationId: fx.organisation.id, nom: "Jourdain", prenom: "Mélanie" }));
    const csv = [
      "Période de paie ,,,22/06/2026-28/06/2026,",
      "Employé,,,Melanie  Jourdain (77),",
      "LUN,22/06/2026,08:00,12:00,04:00,04:00,",
      "Période de paie ,,,22/06/2026-28/06/2026,",
      "Employé,,,Prenom1 Nom1 (1),",
      "LUN,22/06/2026,09:00,17:00,08:00,08:00,",
      "Période de paie ,,,22/06/2026-28/06/2026,",
      "Employé,,,Inconnu Total (99),",
      "LUN,22/06/2026,09:00,17:00,08:00,08:00,",
    ].join("\n");
    const bilan = await dansOrg(fx, (tx) => importerCsv(tx, fx.organisation.id, csv));
    expect(bilan).toMatchObject({ semaines: 2, salaries: 2, nonApparies: ["Inconnu Total (n° 99)"] });
    const melanie = await dansOrg(fx, async (tx) => (await tx.select().from(salarie).where(eq(salarie.nom, "Jourdain")))[0]!);
    expect(melanie.pointeuseRef).toBe("77");
    expect((await semaineDe(melanie.id, "2026-06-22"))!.totalMinutes).toBe(240);
  });
});

describe("cloisonnement entre organisations clientes", () => {
  it("ne laisse voir ni écrire les données d'un autre client", async () => {
    const autre = await creerOrganisation(fx.db, { raisonSociale: "Autre client", numeroSerie: "AUTRE00001", nbSalaries: 1 });
    const vues = await withTenant(fx.db, autre.org.id, (tx) => tx.select().from(pointageSemaine));
    expect(vues).toHaveLength(0);
    const salariesVus = await withTenant(fx.db, autre.org.id, (tx) => tx.select().from(salarie));
    expect(salariesVus.map((s) => s.organisationId)).toEqual([autre.org.id]);
    await expect(
      withTenant(fx.db, autre.org.id, (tx) => tx.insert(salarie).values({ organisationId: fx.organisation.id, nom: "Intrus", prenom: "X" })),
    ).rejects.toThrow();
    // Le même numéro de salarié (PIN 1) chez deux clients : chaque pointeuse écrit chez le sien.
    const pointeuseAutre = (await trouverPointeuse(fx.db, "AUTRE00001"))!;
    await enregistrerLignesAttlog(fx.db, { pointeuse: pointeuseAutre, lignes: parserAttlog(attlog("1", "2026-11-12 10:00:00")).lignes, maintenant: MAINTENANT });
    const chezAutre = await withTenant(fx.db, autre.org.id, (tx) => tx.select().from(pointageSemaine));
    expect(chezAutre).toHaveLength(1);
    expect(chezAutre[0]!.salarieId).toBe(autre.salaries[0]!.id);
  });

  it("sans organisation positionnée, rien n'est visible", async () => {
    const rien = await fx.db.transaction((tx) => tx.select().from(salarie));
    expect(rien).toHaveLength(0);
  });
});
