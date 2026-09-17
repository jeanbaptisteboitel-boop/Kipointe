/**
 * Seed d'une organisation de test (brief §10, étape 1).
 *
 *   npm run db:seed
 *
 * Variables optionnelles : SEED_RAISON_SOCIALE, SEED_GERANT_EMAIL, SEED_GERANT_MOT_DE_PASSE.
 * Le script affiche le PIN initial de chaque salarié et le code d'appairage du terminal : notez-les.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { fermerDb, getDb } from "./index";
import { etablissement, organisation, salarie, terminal, utilisateur } from "./schema";
import { withBypass } from "./tenant";
import { hacherSecret } from "@/lib/auth/password";
import { genererCodeAppairage, genererPin, sha256Hex } from "@/lib/crypto";

async function main() {
  const raisonSociale = process.env.SEED_RAISON_SOCIALE ?? "Restaurant de démonstration";
  const emailGerant = (process.env.SEED_GERANT_EMAIL ?? "gerant@exemple.fr").toLowerCase();
  const motDePasse = process.env.SEED_GERANT_MOT_DE_PASSE ?? "changez-moi-vite";
  const db = getDb();

  await withBypass(db, async (tx) => {
    const existant = await tx.query.utilisateur.findFirst({ where: eq(utilisateur.email, emailGerant) });
    if (existant) {
      console.log(`[seed] un utilisateur ${emailGerant} existe déjà : rien à faire.`);
      return;
    }

    const [org] = await tx
      .insert(organisation)
      .values({ raisonSociale, siret: "00000000000000", conventionCollective: "HCR (IDCC 1979)" })
      .returning();
    const [etab] = await tx
      .insert(etablissement)
      .values({ organisationId: org!.id, libelle: "Établissement principal", adresse: "Rouen", timezone: "Europe/Paris" })
      .returning();

    await tx.insert(utilisateur).values({
      organisationId: org!.id,
      email: emailGerant,
      nom: "Gérant",
      prenom: "Démo",
      motDePasseHash: await hacherSecret(motDePasse),
      role: "GERANT",
    });

    const code = genererCodeAppairage();
    await tx.insert(terminal).values({
      organisationId: org!.id,
      etablissementId: etab!.id,
      libelle: "Tablette cuisine",
      codeAppairageHash: sha256Hex(code),
      codeAppairageExpireLe: new Date(Date.now() + 24 * 3600_000),
    });

    const personnes = [
      { nom: "Martin", prenom: "Camille", matricule: "001" },
      { nom: "Durand", prenom: "Alex", matricule: "002" },
      { nom: "Lefèvre", prenom: "Sam", matricule: "003" },
    ];
    console.log(`\n[seed] organisation « ${raisonSociale} » créée (${org!.id})`);
    console.log(`[seed] gérant : ${emailGerant} / ${motDePasse}`);
    console.log(`[seed] code d'appairage de la tablette (valable 24 h) : ${code.slice(0, 4)}-${code.slice(4)}`);
    for (const p of personnes) {
      const pin = genererPin();
      const [s] = await tx
        .insert(salarie)
        .values({ organisationId: org!.id, ...p, etablissementDefautId: etab!.id, pinHash: await hacherSecret(pin), dateEntree: "2026-01-05" })
        .returning();
      console.log(`[seed] salarié ${p.prenom} ${p.nom} — badge BADGE:${s!.badgeUuid} — PIN ${pin}`);
    }
  });
}

main()
  .then(() => fermerDb())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] échec :", err);
    process.exit(1);
  });
