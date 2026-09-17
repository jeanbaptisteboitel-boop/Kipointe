/** Chargeurs de données pour les Server Components (toujours dans une transaction tenant). */
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalie, etablissement, journalAcces, organisation, recapHebdo, salarie, terminal, utilisateur } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import type { UtilisateurConnecte } from "@/lib/auth/session";
import { calculerSemaineOrganisation, calculerSemaineSalarie } from "@/lib/calcul/recap";
import { journaliserAcces } from "@/lib/journal";
import { enregistrerBrouillonRecap } from "@/lib/recap/service";
import { parseSemaine, semaineCourante } from "@/lib/temps/journee";

export function semaineDemandee(param: string | undefined, maintenant = new Date()) {
  return parseSemaine(param) ?? semaineCourante({ timezone: "Europe/Paris", journeeDebutHeure: 4 }, maintenant);
}

export async function chargerOrganisation(u: UtilisateurConnecte) {
  return withTenant(getDb(), u.organisationId, async (tx) => {
    const org = await tx.query.organisation.findFirst({ where: eq(organisation.id, u.organisationId) });
    const etabs = await tx.select().from(etablissement).where(eq(etablissement.organisationId, u.organisationId)).orderBy(asc(etablissement.libelle));
    return { org: org!, etablissements: etabs };
  });
}

export async function chargerSemaineOrganisation(u: UtilisateurConnecte, annee: number, semaine: number, maintenant = new Date()) {
  return withTenant(getDb(), u.organisationId, async (tx) => {
    const resultats = await calculerSemaineOrganisation(tx, u.organisationId, annee, semaine, maintenant);
    const lignes = [];
    for (const r of resultats) {
      const brouillon = await enregistrerBrouillonRecap(tx, u.organisationId, r);
      lignes.push({ ...r, recap: brouillon });
    }
    return lignes;
  });
}

export async function chargerSemaineSalarie(u: UtilisateurConnecte, salarieId: string, annee: number, semaine: number, maintenant = new Date()) {
  return withTenant(getDb(), u.organisationId, async (tx) => {
    const s = await tx.query.salarie.findFirst({ where: and(eq(salarie.id, salarieId), eq(salarie.organisationId, u.organisationId)) });
    if (!s) return null;
    const res = await calculerSemaineSalarie(tx, u.organisationId, s.id, annee, semaine, maintenant);
    const recap = await enregistrerBrouillonRecap(tx, u.organisationId, res);
    const anomalies = await tx.query.anomalie.findMany({
      where: and(eq(anomalie.salarieId, s.id), eq(anomalie.organisationId, u.organisationId)),
      orderBy: [desc(anomalie.dateJour)],
      limit: 50,
    });
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: s.id, action: "recap.consulter", detail: { semaine: `${annee}-W${semaine}` } });
    return { ...res, recap, anomalies };
  });
}

export async function chargerSalarie(u: UtilisateurConnecte, salarieId: string) {
  return withTenant(getDb(), u.organisationId, async (tx) => {
    const s = await tx.query.salarie.findFirst({ where: and(eq(salarie.id, salarieId), eq(salarie.organisationId, u.organisationId)) });
    if (!s) return null;
    await journaliserAcces(tx, { organisationId: u.organisationId, utilisateurId: u.id, salarieId: s.id, action: "salarie.consulter" });
    return s;
  });
}

export async function listerSalaries(u: UtilisateurConnecte, tous = false) {
  return withTenant(getDb(), u.organisationId, (tx) =>
    tx
      .select()
      .from(salarie)
      .where(tous ? eq(salarie.organisationId, u.organisationId) : and(eq(salarie.organisationId, u.organisationId), eq(salarie.actif, true)))
      .orderBy(asc(salarie.nom), asc(salarie.prenom)),
  );
}

export async function listerAnomalies(u: UtilisateurConnecte, statut: "OUVERTE" | "TRAITEE" | "IGNOREE" | null) {
  return withTenant(getDb(), u.organisationId, (tx) =>
    tx.query.anomalie.findMany({
      where: statut ? and(eq(anomalie.organisationId, u.organisationId), eq(anomalie.statut, statut)) : eq(anomalie.organisationId, u.organisationId),
      with: { salarie: { columns: { nom: true, prenom: true } } },
      orderBy: [desc(anomalie.dateJour), desc(anomalie.createdAt)],
      limit: 300,
    }),
  );
}

export async function listerTerminaux(u: UtilisateurConnecte) {
  return withTenant(getDb(), u.organisationId, async (tx) => ({
    terminaux: await tx.query.terminal.findMany({ where: eq(terminal.organisationId, u.organisationId), with: { etablissement: true }, orderBy: [asc(terminal.libelle)] }),
    etablissements: await tx.select().from(etablissement).where(eq(etablissement.organisationId, u.organisationId)).orderBy(asc(etablissement.libelle)),
  }));
}

export async function listerRecapsValides(u: UtilisateurConnecte, annee: number, semaine: number) {
  return withTenant(getDb(), u.organisationId, (tx) =>
    tx.query.recapHebdo.findMany({
      where: and(eq(recapHebdo.organisationId, u.organisationId), eq(recapHebdo.annee, annee), eq(recapHebdo.semaineIso, semaine)),
      with: { salarie: { columns: { nom: true, prenom: true } }, validePar: { columns: { nom: true, prenom: true } } },
    }),
  );
}

export async function listerJournal(u: UtilisateurConnecte) {
  return withTenant(getDb(), u.organisationId, async (tx) => {
    const lignes = await tx.query.journalAcces.findMany({ where: eq(journalAcces.organisationId, u.organisationId), orderBy: [desc(journalAcces.createdAt)], limit: 200 });
    const utilisateurs = await tx.select({ id: utilisateur.id, nom: utilisateur.nom, prenom: utilisateur.prenom }).from(utilisateur).where(eq(utilisateur.organisationId, u.organisationId));
    const salaries = await tx.select({ id: salarie.id, nom: salarie.nom, prenom: salarie.prenom }).from(salarie).where(eq(salarie.organisationId, u.organisationId));
    return { lignes, utilisateurs: new Map(utilisateurs.map((x) => [x.id, x])), salaries: new Map(salaries.map((x) => [x.id, x])) };
  });
}
