/**
 * Prépare le fichier `.env` local à partir de `.env.example` :
 *  - tire au hasard les secrets qui doivent l'être (`SESSION_SECRET`, `CRON_SECRET`) ;
 *  - conserve les valeurs déjà renseignées (aucune écrasée sans `--forcer`) ;
 *  - laisse en place les gabarits des valeurs que seul le cabinet connaît (Neon, Scaleway) ;
 *  - liste ce qu'il reste à saisir à la main.
 *
 *   npm run env:preparer            # crée ou complète .env
 *   npm run env:preparer -- --forcer  # régénère aussi les secrets déjà présents
 *
 * Le fichier produit est ignoré par git (`.gitignore`) : aucun secret ne part sur GitHub.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Variables tirées au hasard par ce script : personne n'a à les inventer. */
const SECRETS_GENERES: Record<string, () => string> = {
  SESSION_SECRET: () => randomBytes(32).toString("base64url"),
  CRON_SECRET: () => randomBytes(24).toString("base64url"),
};

/** Fragments de `.env.example` : une valeur qui les contient reste à renseigner. */
const GABARITS = ["changez-moi", "USER:PASSWORD", "SCWXXXX", "xxxxxxxx-xxxx", "ep-xxxx", "kipointe.vercel.app"];

function estGabarit(valeur: string): boolean {
  if (valeur.trim() === "") return true;
  return GABARITS.some((g) => valeur.includes(g));
}

function deshabiller(valeur: string): string {
  const v = valeur.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Analyse minimale d'un fichier `.env` : `CLE=valeur`, guillemets optionnels. */
function lireEnv(chemin: string): Map<string, string> {
  const valeurs = new Map<string, string>();
  if (!existsSync(chemin)) return valeurs;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const nette = ligne.trim();
    if (nette === "" || nette.startsWith("#")) continue;
    const separateur = nette.indexOf("=");
    if (separateur <= 0) continue;
    valeurs.set(nette.slice(0, separateur).trim(), deshabiller(nette.slice(separateur + 1)));
  }
  return valeurs;
}

function main(): void {
  const forcer = process.argv.includes("--forcer");
  const racine = path.resolve(import.meta.dirname, "..");
  const cheminExemple = path.join(racine, ".env.example");
  const cheminEnv = path.join(racine, ".env");

  if (!existsSync(cheminExemple)) {
    console.error("[env] .env.example introuvable.");
    process.exit(1);
  }

  const existantes = lireEnv(cheminEnv);
  const genere: string[] = [];
  const conserve: string[] = [];
  const aSaisir: string[] = [];
  const defauts: string[] = [];

  const lignes = readFileSync(cheminExemple, "utf8").split("\n");
  const sortie = lignes.map((ligne) => {
    const nette = ligne.trim();
    if (nette === "" || nette.startsWith("#")) return ligne;
    const separateur = nette.indexOf("=");
    if (separateur <= 0) return ligne;

    const cle = nette.slice(0, separateur).trim();
    const exemple = deshabiller(nette.slice(separateur + 1));
    const existante = existantes.get(cle);

    const genereSecret = Object.hasOwn(SECRETS_GENERES, cle);
    if (existante !== undefined && !estGabarit(existante) && !(forcer && genereSecret)) {
      conserve.push(cle);
      return `${cle}="${existante}"`;
    }
    const generateur = genereSecret ? SECRETS_GENERES[cle] : undefined;
    if (generateur) {
      genere.push(cle);
      return `${cle}="${generateur()}"`;
    }
    // Un gabarit doit être remplacé ; une valeur d'exemple utilisable est simplement reprise.
    if (estGabarit(exemple)) aSaisir.push(cle);
    else defauts.push(cle);
    return `${cle}="${exemple}"`;
  });

  // Variables présentes dans .env mais absentes de .env.example : on ne les perd pas.
  const connues = new Set(
    lignes
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#") && l.includes("="))
      .map((l) => l.slice(0, l.indexOf("=")).trim()),
  );
  const supplementaires = [...existantes.keys()].filter((c) => !connues.has(c));
  if (supplementaires.length > 0) {
    sortie.push("", "# ─── Variables ajoutées localement ───────────────────────────────────────────");
    for (const cle of supplementaires) sortie.push(`${cle}="${existantes.get(cle)}"`);
  }

  writeFileSync(cheminEnv, sortie.join("\n"), { mode: 0o600 });

  console.log(`[env] .env écrit (${cheminEnv}, permissions 600, ignoré par git).`);
  if (genere.length > 0) console.log(`[env] secrets tirés au hasard : ${genere.join(", ")}.`);
  if (conserve.length > 0) console.log(`[env] valeurs conservées : ${conserve.join(", ")}.`);
  if (defauts.length > 0) console.log(`[env] valeurs par défaut reprises : ${defauts.join(", ")}.`);
  if (aSaisir.length > 0) {
    console.log("");
    console.log("[env] à renseigner à la main dans .env (le reste est prêt) :");
    for (const cle of aSaisir) console.log(`        ${cle}`);
    console.log("");
    console.log("        Neon     → tableau de bord du projet, onglet « Connection details »");
    console.log("        Scaleway → console, IAM → application « kipointe » → clé API");
  }
  console.log("");
  console.log("[env] ensuite : npm run env:verifier    puis    ./scripts/vercel-env-push.sh production");
}

main();
