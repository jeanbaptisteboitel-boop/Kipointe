/**
 * Contrôle l'environnement avant un déploiement et sort en erreur si quelque chose cloche.
 *
 *   npm run env:verifier                 # contrôle le .env local
 *   npm run env:verifier -- --production # durcit les contrôles (cible Vercel production)
 *
 * Aucune valeur secrète n'est affichée en clair : tout est masqué.
 * Les contrôles eux-mêmes sont dans `src/lib/config/env.ts` (testés par `tests/env.test.ts`).
 */
import "dotenv/config";
import { compter, controlerEnvironnement, masquer, masquerUrl, type Diagnostic } from "../src/lib/config/env";

/**
 * Variables affichées dans le récapitulatif, dans l'ordre où on les renseigne.
 * `secret` est masqué, `url` perd son mot de passe, `clair` s'affiche tel quel :
 * un récapitulatif où tout serait masqué ne permettrait pas de relire sa configuration.
 */
const RECAPITULATIF: { cle: string; affichage: "secret" | "url" | "clair" }[] = [
  { cle: "DATABASE_URL", affichage: "url" },
  { cle: "DATABASE_URL_UNPOOLED", affichage: "url" },
  { cle: "SESSION_SECRET", affichage: "secret" },
  { cle: "CRON_SECRET", affichage: "secret" },
  { cle: "SCALEWAY_ACCESS_KEY_ID", affichage: "secret" },
  { cle: "SCALEWAY_SECRET_ACCESS_KEY", affichage: "secret" },
  { cle: "SCALEWAY_BUCKET", affichage: "clair" },
  { cle: "SCALEWAY_REGION", affichage: "clair" },
  { cle: "SCALEWAY_ENDPOINT", affichage: "clair" },
  { cle: "ARCHIVE_RETENTION_YEARS", affichage: "clair" },
  { cle: "RETENTION_POINTAGES_JOURS", affichage: "clair" },
  { cle: "NEXT_PUBLIC_APP_URL", affichage: "clair" },
  { cle: "KIOSQUE_APK_VERSION", affichage: "clair" },
];

function afficher(valeur: string, affichage: "secret" | "url" | "clair"): string {
  if (affichage === "url") return masquerUrl(valeur);
  if (affichage === "secret") return masquer(valeur);
  return valeur;
}

const SYMBOLE: Record<Diagnostic["gravite"], string> = {
  erreur: "✗ ERREUR       ",
  avertissement: "! AVERTISSEMENT",
  info: "· INFO         ",
};

function main(): void {
  const production = process.argv.includes("--production") || process.env.VERCEL_ENV === "production";

  console.log(`[env] contrôle ${production ? "PRODUCTION" : "local"} — ${RECAPITULATIF.length} variables suivies.`);
  console.log("");
  for (const { cle, affichage } of RECAPITULATIF) {
    const brute = process.env[cle];
    const affichee = brute === undefined || brute === "" ? "(absente)" : afficher(brute, affichage);
    console.log(`  ${cle.padEnd(28)} ${affichee}`);
  }
  console.log("");

  const diagnostics = controlerEnvironnement(process.env, { production });
  if (diagnostics.length === 0) {
    console.log("[env] aucun problème détecté.");
    return;
  }
  for (const d of diagnostics) {
    console.log(`  ${SYMBOLE[d.gravite]}  ${d.variable} : ${d.message}`);
  }
  console.log("");

  const erreurs = compter(diagnostics, "erreur");
  const avertissements = compter(diagnostics, "avertissement");
  console.log(`[env] ${erreurs} erreur(s), ${avertissements} avertissement(s).`);
  if (erreurs > 0) {
    console.log("[env] déploiement déconseillé tant que les erreurs subsistent.");
    process.exit(1);
  }
}

main();
