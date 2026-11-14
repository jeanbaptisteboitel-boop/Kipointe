import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { congeAbsence, notification, pointeuse } from "@/db/schema";
import { creerConge, deciderConge, supprimerConge } from "@/lib/conges/service";
import { chargerOrganisation, chargerSuiviSalarie, soldeCongesPayes } from "@/lib/donnees";
import { executerQuotidien } from "@/lib/notifications/quotidien";
import { compterNonLues, marquerLues } from "@/lib/notifications/service";
import { parserAttlog } from "@/lib/pointeuse/adms";
import { enregistrerLignesAttlog } from "@/lib/pointeuse/enregistrement";
import { attlog, creerFixture, dansOrg, type Fixture } from "./helpers/db";

let fx: Fixture;
beforeAll(async () => {
  fx = await creerFixture({ nbSalaries: 3 });
});
afterAll(() => fx.fermer());

const notifs = (salarieId: string | null) =>
  dansOrg(fx, (tx) =>
    tx
      .select()
      .from(notification)
      .where(salarieId ? eq(notification.destinataireSalarieId, salarieId) : isNull(notification.destinataireSalarieId)),
  );
const types = async (salarieId: string | null) => (await notifs(salarieId)).map((n) => n.type).sort();

describe("demandes de congés", () => {
  it("met une demande de congé payé en attente et prévient l'administrateur", async () => {
    const [a] = fx.salaries;
    const c = await dansOrg(fx, (tx) =>
      creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: false, saisie: { salarieId: a!.id, type: "CONGE_PAYE", dateDebut: "2026-12-21", dateFin: "2026-12-25" } }),
    );
    expect(c).toMatchObject({ statut: "EN_ATTENTE", nbJours: 4 }); // le 25 décembre est férié
    expect(await types(null)).toEqual(["CONGE_DEMANDE"]);
    await expect(
      dansOrg(fx, (tx) => creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: false, saisie: { salarieId: a!.id, type: "CONGE_PAYE", dateDebut: "2026-12-24", dateFin: "2026-12-28" } })),
    ).rejects.toThrow("couvre déjà");
    await dansOrg(fx, (tx) => deciderConge(tx, { id: c.id, decideurId: fx.admin.id, statut: "ACCEPTEE" }));
    expect(await types(a!.id)).toEqual(["CONGE_DECISION"]);
    await expect(dansOrg(fx, (tx) => deciderConge(tx, { id: c.id, decideurId: fx.admin.id, statut: "REFUSEE" }))).rejects.toThrow("déjà été traitée");
    await expect(dansOrg(fx, (tx) => supprimerConge(tx, { id: c.id, parAdmin: false, salarieId: a!.id }))).rejects.toThrow("en attente");
  });

  it("refuse au salarié l'absence non autorisée et les périodes sans jour travaillé", async () => {
    const [a] = fx.salaries;
    const saisie = { salarieId: a!.id, dateDebut: "2026-12-05", dateFin: "2026-12-06" };
    await expect(dansOrg(fx, (tx) => creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: false, saisie: { ...saisie, type: "ABSENCE_NON_AUTORISEE" } }))).rejects.toThrow("réservé");
    await expect(dansOrg(fx, (tx) => creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: false, saisie: { ...saisie, type: "CONGE_PAYE" } }))).rejects.toThrow("aucun jour travaillé");
  });

  it("déduit les congés payés acceptés du solde saisi", async () => {
    const [a] = fx.salaries;
    const conges = await dansOrg(fx, (tx) => tx.select().from(congeAbsence).where(eq(congeAbsence.salarieId, a!.id)));
    expect(soldeCongesPayes({ cpSoldeJours: 12, cpSoldeAu: "2026-11-01" }, conges)).toEqual({ solde: 8, pris: 4, enAttente: 0 });
    expect(soldeCongesPayes({ cpSoldeJours: null, cpSoldeAu: null }, conges)).toBeNull();
  });
});

describe("tâche quotidienne", () => {
  // Lundi 16 novembre 2026, 05:00 à Paris. Semaine écoulée : du 9 au 15 (mercredi 11 férié).
  const LUNDI_MATIN = new Date("2026-11-16T04:00:00Z");
  const envoyer = (texte: string, maintenant: Date) => enregistrerLignesAttlog(fx.db, { pointeuse: fx.pointeuse, lignes: parserAttlog(texte).lignes, maintenant });

  it("signale heures manquantes, heures supplémentaires, absence et semaine à valider", async () => {
    const [a, b, c] = fx.salaries;
    const jours = ["2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"];
    // A : 4 jours de 8 h → 32 h + 7 h de férié = 39 h pour 35 h : 4 h supplémentaires.
    // B : absent le vendredi 13 → 3 × 7 h + férié = 28 h : 7 h manquantes, absence à justifier (le 13 n'est pas « hier »).
    // C : en maladie toute la semaine → rien à signaler.
    const lignes: string[] = [];
    for (const j of jours) lignes.push(attlog("1", `${j} 08:00:00`), attlog("1", `${j} 16:00:00`));
    for (const j of jours.slice(0, 3)) lignes.push(attlog("2", `${j} 09:00:00`), attlog("2", `${j} 16:00:00`));
    await envoyer(lignes.join("\n"), new Date("2026-11-13T17:00:00Z"));
    await dansOrg(fx, async (tx) => {
      await creerConge(tx, { organisationId: fx.organisation.id, auteurId: fx.admin.id, parAdmin: true, saisie: { salarieId: c!.id, type: "MALADIE", dateDebut: "2026-11-09", dateFin: "2026-11-20" } });
      await tx.update(pointeuse).set({ derniereConnexion: new Date("2026-11-16T03:30:00Z") });
      await tx.delete(notification);
    });

    const bilan = await executerQuotidien(fx.db, LUNDI_MATIN);
    expect(bilan.organisations).toBe(1);
    expect(await types(a!.id)).toEqual(["HEURES_SUP", "SEMAINE_A_VALIDER"]);
    expect(await types(b!.id)).toEqual(["HEURES_MANQUANTES", "SEMAINE_A_VALIDER"]);
    expect(await types(c!.id)).toEqual([]);
    expect(await types(null)).toEqual(["HEURES_MANQUANTES", "HEURES_SUP"]);
    const sup = (await notifs(a!.id)).find((n) => n.type === "HEURES_SUP")!;
    expect(sup.message).toContain("4 h 00");
    const manque = (await notifs(null)).find((n) => n.type === "HEURES_MANQUANTES")!;
    expect(manque.message).toContain("Prenom2 Nom2");
    expect(manque.message).toContain("7 h 00");
  });

  it("ne crée rien de plus en repassant", async () => {
    const bilan = await executerQuotidien(fx.db, LUNDI_MATIN);
    expect(bilan.notifications).toBe(0);
  });

  it("signale l'absence de la veille et l'oubli de badge", async () => {
    const [a, b] = fx.salaries;
    // Lundi 16 : A badge son arrivée mais pas son départ ; B ne badge pas.
    await envoyer(attlog("1", "2026-11-16 08:00:00"), new Date("2026-11-16T08:00:00Z"));
    await dansOrg(fx, (tx) => tx.update(pointeuse).set({ derniereConnexion: new Date("2026-11-17T03:30:00Z") }));
    await executerQuotidien(fx.db, new Date("2026-11-17T04:00:00Z"));
    expect(await types(a!.id)).toContain("POINTAGE_INCOMPLET");
    expect(await types(b!.id)).toContain("ABSENCE_A_JUSTIFIER");
    const admin = await notifs(null);
    expect(admin.filter((n) => n.type === "ABSENCE_A_JUSTIFIER").map((n) => n.salarieId)).toEqual([b!.id]);
  });

  it("alerte sur une pointeuse silencieuse plutôt que d'accuser chaque salarié d'absence", async () => {
    await dansOrg(fx, (tx) => tx.update(notification).set({ luLe: new Date() }));
    // Mercredi 18 : la pointeuse n'a plus communiqué depuis lundi matin, personne n'a pu badger mardi.
    await dansOrg(fx, (tx) => tx.update(pointeuse).set({ derniereConnexion: new Date("2026-11-16T09:00:00Z") }));
    const bilan = await executerQuotidien(fx.db, new Date("2026-11-18T04:00:00Z"));
    expect(bilan.notifications).toBe(1);
    const nouvelles = (await notifs(null)).filter((n) => !n.luLe);
    expect(nouvelles.map((n) => n.type)).toEqual(["POINTEUSE_SILENCIEUSE"]);
    const absences = (await notifs(fx.salaries[1]!.id)).filter((n) => n.type === "ABSENCE_A_JUSTIFIER");
    expect(absences.map((n) => n.cle)).toEqual([`s:absence:${fx.salaries[1]!.id}:2026-11-16`]);
  });

  it("compte et marque les notifications lues", async () => {
    expect(await dansOrg(fx, (tx) => compterNonLues(tx, fx.organisation.id, null))).toBe(1);
    await dansOrg(fx, (tx) => marquerLues(tx, fx.organisation.id, null));
    expect(await dansOrg(fx, (tx) => compterNonLues(tx, fx.organisation.id, null))).toBe(0);
    const restantes = await dansOrg(fx, (tx) => tx.select().from(notification).where(and(isNull(notification.destinataireSalarieId), isNull(notification.luLe))));
    expect(restantes).toHaveLength(0);
  });
});

describe("suivi d'un salarié", () => {
  it("ne fait pas remonter le compteur avant le premier jour pointé", async () => {
    const [a, , c] = fx.salaries;
    const org = await dansOrg(fx, (tx) => chargerOrganisation(tx, fx.organisation.id));
    // A a badgé pour la première fois le lundi 9 novembre : les semaines d'avant ne sont pas des heures dues.
    const suiviA = await dansOrg(fx, (tx) => chargerSuiviSalarie(tx, org, a!, "2026-11-18", 4));
    expect(suiviA.compteur.depart).toBe("2026-11-09");
    expect(suiviA.compteur.soldeMinutes).toBe(240);
    expect(suiviA.semainesAffichees.map((s) => !!s.horsCompteur)).toEqual([true, true, false, false]);
    // C n'a jamais badgé : compteur nul, qui part d'aujourd'hui.
    const suiviC = await dansOrg(fx, (tx) => chargerSuiviSalarie(tx, org, c!, "2026-11-18", 4));
    expect(suiviC.compteur).toMatchObject({ depart: "2026-11-18", soldeMinutes: 0 });
    // Un réglage explicite de l'administrateur l'emporte.
    const regle = await dansOrg(fx, (tx) => chargerSuiviSalarie(tx, org, { ...a!, compteurDepart: "2026-11-02" }, "2026-11-18", 4));
    expect(regle.compteur).toMatchObject({ depart: "2026-11-02", soldeMinutes: 240 - 2100, departParDefaut: false });
  });


  it("rassemble planning, semaines et compteur", async () => {
    const [a] = fx.salaries;
    const suivi = await dansOrg(fx, async (tx) => chargerSuiviSalarie(tx, await chargerOrganisation(tx, fx.organisation.id), a!, "2026-11-18", 4));
    expect(suivi.sourcePlanning).toBe("organisation");
    expect(suivi.semainesAffichees.map((s) => s.lundi)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
    const s = suivi.semainesAffichees[2]!;
    expect(s).toMatchObject({ prevuMinutes: 2100, travailleMinutes: 1920, assimileMinutes: 420, ecartMinutes: 240 });
  });
});
