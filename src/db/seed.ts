/**
 * Amorçage : crée l'organisation de l'ÉDITEUR et son compte (rôle PLATEFORME), depuis lequel
 * les entreprises clientes sont ensuite créées dans l'espace « Clients ».
 *
 *   SEED_EMAIL=vous@domaine.fr SEED_MOT_DE_PASSE=… npm run db:seed
 *   npm run db:seed -- --demo     # ajoute un client de démonstration avec trois semaines de pointages
 *
 * Idempotent : relancé, il ne recrée ni l'éditeur ni la démonstration.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { fermerDb, getDb } from "@/db";
import { organisation, pointageSemaine, pointeuse, salarie, utilisateur } from "@/db/schema";
import { withBypass } from "@/db/tenant";
import { hacherSecret } from "@/lib/auth/password";
import { tokenAleatoire } from "@/lib/crypto";
import { minutesDepuisPointages, totalMinutes, type JourPointage } from "@/lib/pointage/paires";
import { jourLocal, joursDeSemaine, lundiDe, plusJours } from "@/lib/temps/zone";

async function main() {
  const db = getDb();
  const demo = process.argv.includes("--demo");
  const email = (process.env.SEED_EMAIL ?? "").trim().toLowerCase();
  const motDePasse = process.env.SEED_MOT_DE_PASSE ?? tokenAleatoire(12);

  await withBypass(db, async (tx) => {
    const [existante] = await tx.select().from(organisation).where(eq(organisation.plateforme, true));
    if (existante) {
      console.log(`[seed] organisation éditeur déjà présente (${existante.raisonSociale}).`);
    } else {
      if (!email) throw new Error("SEED_EMAIL est requis pour créer le compte de l'éditeur.");
      const [org] = await tx
        .insert(organisation)
        .values({ raisonSociale: process.env.SEED_RAISON_SOCIALE ?? "OMNIUP", plateforme: true })
        .returning();
      await tx.insert(utilisateur).values({
        organisationId: org!.id,
        email,
        nom: "Éditeur",
        prenom: "Compte",
        motDePasseHash: await hacherSecret(motDePasse),
        motDePasseProvisoire: !process.env.SEED_MOT_DE_PASSE,
        role: "PLATEFORME",
      });
      console.log(`[seed] compte éditeur créé : ${email}`);
      if (!process.env.SEED_MOT_DE_PASSE) console.log(`[seed] mot de passe provisoire (à changer à la première connexion) : ${motDePasse}`);
    }

    if (!demo) return;
    const [deja] = await tx.select().from(utilisateur).where(eq(utilisateur.email, "admin@demo.kipointe.test"));
    if (deja) {
      console.log("[seed] client de démonstration déjà présent.");
      return;
    }
    const mdp = tokenAleatoire(9);
    const hash = await hacherSecret(mdp);
    const [org] = await tx.insert(organisation).values({ raisonSociale: "Garage de la Démonstration", siret: "12345678900012" }).returning();
    await tx.insert(utilisateur).values({ organisationId: org!.id, email: "admin@demo.kipointe.test", nom: "Martin", prenom: "Claire", motDePasseHash: hash, role: "ADMIN" });
    await tx.insert(pointeuse).values({ organisationId: org!.id, numeroSerie: "DEMO0000001", nom: "Entrée atelier" });
    const equipe = [
      { prenom: "Lucas", nom: "Bernard", ref: "1", planning: null },
      { prenom: "Inès", nom: "Moreau", ref: "2", planning: { lun: 8, mar: 8, mer: 0, jeu: 8, ven: 0, sam: 0, dim: 0 } },
      { prenom: "Hugo", nom: "Petit", ref: "3", planning: null },
    ];
    const aujourdhui = jourLocal(new Date());
    for (const [i, e] of equipe.entries()) {
      const [s] = await tx
        .insert(salarie)
        .values({ organisationId: org!.id, nom: e.nom, prenom: e.prenom, pointeuseRef: e.ref, planning: e.planning, email: `${e.prenom.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@demo.kipointe.test`, dateEntree: "2024-01-02" })
        .returning();
      if (i === 0) await tx.insert(utilisateur).values({ organisationId: org!.id, email: s!.email!, nom: s!.nom, prenom: s!.prenom, motDePasseHash: hash, role: "SALARIE", salarieId: s!.id });
      for (let n = 3; n >= 0; n--) {
        const lundi = plusJours(lundiDe(aujourdhui), -7 * n);
        const jours: JourPointage[] = [];
        for (const [k, date] of joursDeSemaine(lundi).entries()) {
          if (date >= aujourdhui || k > 4 || (e.planning && [2, 4].includes(k))) continue;
          const depart = i === 2 && k === 3 ? "18:45" : i === 0 && k === 4 && n === 1 ? "15:00" : "17:00";
          const pointages = [
            { entree: e.planning ? "08:00" : "08:30", sortie: "12:00", source: "pointeuse" },
            { entree: "13:00", sortie: e.planning ? "17:00" : depart === "17:00" ? "16:30" : depart, source: "pointeuse" },
          ];
          jours.push({ date, minutes: minutesDepuisPointages(pointages), pointages });
        }
        if (jours.length) {
          await tx.insert(pointageSemaine).values({ organisationId: org!.id, salarieId: s!.id, semaineDebut: lundi, semaineFin: plusJours(lundi, 6), jours, totalMinutes: totalMinutes(jours), statut: n >= 2 ? "VALIDE" : "EN_ATTENTE" });
        }
      }
    }
    console.log("[seed] client de démonstration créé :");
    console.log(`         administrateur  admin@demo.kipointe.test`);
    console.log(`         salarié         lucas@demo.kipointe.test`);
    console.log(`         mot de passe    ${mdp}`);
  });
  await fermerDb();
}

main().catch(async (e) => {
  console.error("[seed] échec :", e instanceof Error ? e.message : e);
  await fermerDb().catch(() => undefined);
  process.exit(1);
});
