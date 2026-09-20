/**
 * Contrôle des variables d'environnement avant déploiement.
 *
 * Le but est d'attraper au sol les erreurs qui, en vol, sont silencieuses :
 *  - `CRON_SECRET` absent → la purge quotidienne répond 401 sans que personne ne le voie ;
 *  - `DATABASE_URL` pointant sur l'endpoint direct → épuisement des connexions sur Vercel ;
 *  - `DATABASE_URL_UNPOOLED` pointant sur le pooler → migrations en échec au build ;
 *  - bucket hors `fr-par` ou base Neon hors UE → données personnelles sorties de l'Union ;
 *  - nom de bucket contenant un point → certificat TLS invalide en virtual-host style.
 *
 * Fonctions pures, sans accès disque ni réseau : testées dans `tests/env.test.ts`
 * et appelées par `scripts/verifier-env.ts`.
 */

export type Gravite = "erreur" | "avertissement" | "info";

export type Diagnostic = {
  variable: string;
  gravite: Gravite;
  message: string;
};

export type Environnement = Record<string, string | undefined>;

export type OptionsControle = {
  /** Cible un déploiement de production : durcit plusieurs contrôles. */
  production?: boolean;
};

/** Régions AWS situées dans l'Union européenne, seules admises pour Neon. */
const REGIONS_NEON_UE = [
  "eu-central-1",
  "eu-central-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
];

/** Valeurs de `.env.example` : présentes telles quelles, elles signalent un fichier non renseigné. */
const PLACEHOLDERS = [
  "changez-moi",
  "changez-moi-vite",
  "changez-moi-aussi",
  "changez-moi-32-octets-aleatoires-minimum",
  "USER:PASSWORD",
  "SCWXXXXXXXXXXXXXXXXX",
  "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
];

const LONGUEUR_MINI_SESSION_SECRET = 32;
const LONGUEUR_MINI_CRON_SECRET = 16;
const RETENTION_ANNEES_PROJET = 5;
const JOURS_PAR_AN = 365.25;

/** Masque une valeur pour l'affichage : jamais de secret complet dans un journal. */
export function masquer(valeur: string | undefined): string {
  if (valeur === undefined || valeur === "") return "(vide)";
  if (valeur.length < 12) return "•".repeat(valeur.length);
  return `${valeur.slice(0, 3)}${"•".repeat(Math.min(12, valeur.length - 5))}${valeur.slice(-2)}`;
}

/** Masque une URL de connexion : schéma, hôte et base restent lisibles, jamais le mot de passe. */
export function masquerUrl(valeur: string | undefined): string {
  if (!valeur) return "(vide)";
  try {
    const u = new URL(valeur);
    const utilisateur = u.username ? `${u.username}:•••@` : "";
    return `${u.protocol}//${utilisateur}${u.host}${u.pathname}`;
  } catch {
    return masquer(valeur);
  }
}

function estPlaceholder(valeur: string): boolean {
  return PLACEHOLDERS.some((p) => valeur.includes(p));
}

function hote(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function estNeon(url: string): boolean {
  return (hote(url) ?? "").endsWith(".neon.tech");
}

/** Extrait la région AWS d'un hôte Neon (`ep-xxx-pooler.eu-central-1.aws.neon.tech`). */
export function regionNeon(url: string): string | null {
  const h = hote(url);
  if (!h) return null;
  const m = /\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/.exec(h);
  return m?.[1] ?? null;
}

/** Nom de bucket compatible S3 *virtual-host style* : le client n'utilise pas le path-style. */
export function nomBucketValide(nom: string): boolean {
  if (nom.length < 3 || nom.length > 63) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(nom)) return false;
  if (nom.includes("--")) return false;
  return true;
}

function entier(valeur: string): number | null {
  if (!/^\d+$/.test(valeur.trim())) return null;
  const n = Number(valeur.trim());
  return Number.isFinite(n) ? n : null;
}

function controlerBase(env: Environnement, production: boolean, out: Diagnostic[]): void {
  const pooled = env.DATABASE_URL?.trim();
  const direct = env.DATABASE_URL_UNPOOLED?.trim();

  if (!pooled) {
    out.push({ variable: "DATABASE_URL", gravite: "erreur", message: "absente : l'application ne peut pas démarrer." });
  } else if (estPlaceholder(pooled)) {
    out.push({ variable: "DATABASE_URL", gravite: "erreur", message: "contient encore le gabarit de `.env.example`." });
  } else if (!/^postgres(ql)?:\/\//.test(pooled)) {
    out.push({ variable: "DATABASE_URL", gravite: "erreur", message: "doit commencer par `postgres://` ou `postgresql://`." });
  } else {
    if (estNeon(pooled)) {
      if (!hote(pooled)?.includes("-pooler")) {
        out.push({
          variable: "DATABASE_URL",
          gravite: "erreur",
          message: "endpoint direct de Neon : utilisez la chaîne *pooled* (hôte `…-pooler.…`), sinon les fonctions Vercel épuisent les connexions.",
        });
      }
      const region = regionNeon(pooled);
      if (region && !REGIONS_NEON_UE.includes(region)) {
        out.push({
          variable: "DATABASE_URL",
          gravite: "erreur",
          message: `région Neon ${region} hors Union européenne : les données de pointage sont des données personnelles de salariés.`,
        });
      } else if (!region) {
        out.push({ variable: "DATABASE_URL", gravite: "avertissement", message: "région Neon non reconnue dans l'hôte : vérifiez qu'elle est bien dans l'UE." });
      }
      if (!/sslmode=require/.test(pooled)) {
        out.push({ variable: "DATABASE_URL", gravite: "erreur", message: "`sslmode=require` manquant dans la chaîne Neon." });
      }
    } else if (production) {
      out.push({ variable: "DATABASE_URL", gravite: "avertissement", message: "l'hôte n'est pas Neon : le driver `pg` sera utilisé (correct en local, inattendu sur Vercel)." });
    }
  }

  if (!direct) {
    out.push({
      variable: "DATABASE_URL_UNPOOLED",
      gravite: production ? "erreur" : "avertissement",
      message: "absente : les migrations passeraient par le pooler, ce que drizzle-kit ne supporte pas de façon fiable.",
    });
  } else if (estPlaceholder(direct)) {
    out.push({ variable: "DATABASE_URL_UNPOOLED", gravite: "erreur", message: "contient encore le gabarit de `.env.example`." });
  } else if (estNeon(direct) && hote(direct)?.includes("-pooler")) {
    out.push({
      variable: "DATABASE_URL_UNPOOLED",
      gravite: "erreur",
      message: "pointe sur le pooler : les migrations exigent la chaîne directe (hôte sans `-pooler`).",
    });
  }

  if (pooled && direct) {
    const basePooled = hote(pooled)?.replace("-pooler", "");
    const baseDirect = hote(direct);
    if (basePooled && baseDirect && basePooled !== baseDirect) {
      out.push({
        variable: "DATABASE_URL_UNPOOLED",
        gravite: "avertissement",
        message: "ne désigne pas le même endpoint que `DATABASE_URL` : migrations et application travailleraient sur deux bases différentes.",
      });
    }
  }
}

function controlerSecrets(env: Environnement, production: boolean, out: Diagnostic[]): void {
  const session = env.SESSION_SECRET?.trim();
  if (!session) {
    out.push({ variable: "SESSION_SECRET", gravite: "erreur", message: "absent : aucune session ne peut être signée." });
  } else if (estPlaceholder(session)) {
    out.push({ variable: "SESSION_SECRET", gravite: "erreur", message: "valeur d'exemple : générez-en un avec `npm run env:preparer`." });
  } else if (session.length < LONGUEUR_MINI_SESSION_SECRET) {
    out.push({
      variable: "SESSION_SECRET",
      gravite: "erreur",
      message: `${session.length} caractères : il en faut au moins ${LONGUEUR_MINI_SESSION_SECRET}.`,
    });
  } else if (new Set(session).size < 12) {
    out.push({ variable: "SESSION_SECRET", gravite: "avertissement", message: "peu de caractères distincts : tirez-le au hasard plutôt que de l'inventer." });
  }

  const cron = env.CRON_SECRET?.trim();
  if (!cron) {
    out.push({
      variable: "CRON_SECRET",
      gravite: production ? "erreur" : "avertissement",
      message: "absent : `/api/cron/quotidien` répond 401 et la purge des données au-delà de la rétention ne s'exécute jamais.",
    });
  } else if (estPlaceholder(cron)) {
    out.push({ variable: "CRON_SECRET", gravite: "erreur", message: "valeur d'exemple : générez-en un avec `npm run env:preparer`." });
  } else if (cron.length < LONGUEUR_MINI_CRON_SECRET) {
    out.push({ variable: "CRON_SECRET", gravite: "avertissement", message: `${cron.length} caractères : visez au moins ${LONGUEUR_MINI_CRON_SECRET}.` });
  }

  if (env.SESSION_SECRET && env.CRON_SECRET && env.SESSION_SECRET === env.CRON_SECRET) {
    out.push({ variable: "CRON_SECRET", gravite: "erreur", message: "identique à `SESSION_SECRET` : deux usages distincts, deux secrets distincts." });
  }
}

function controlerStockage(env: Environnement, production: boolean, out: Diagnostic[]): void {
  const cle = env.SCALEWAY_ACCESS_KEY_ID?.trim();
  const secret = env.SCALEWAY_SECRET_ACCESS_KEY?.trim();
  const bucket = env.SCALEWAY_BUCKET?.trim();
  const renseignes = [cle, secret, bucket].filter(Boolean).length;

  if (renseignes === 0) {
    out.push({
      variable: "SCALEWAY_*",
      gravite: production ? "erreur" : "avertissement",
      message: "non configuré : l'archivage des récaps hebdomadaires répond 503 (`STOCKAGE_NON_CONFIGURE`).",
    });
    return;
  }
  if (renseignes < 3) {
    out.push({
      variable: "SCALEWAY_*",
      gravite: "erreur",
      message: "configuration partielle : `SCALEWAY_ACCESS_KEY_ID`, `SCALEWAY_SECRET_ACCESS_KEY` et `SCALEWAY_BUCKET` vont ensemble.",
    });
  }

  if (cle && estPlaceholder(cle)) {
    out.push({ variable: "SCALEWAY_ACCESS_KEY_ID", gravite: "erreur", message: "valeur d'exemple." });
  } else if (cle && !/^SCW[A-Z0-9]{17}$/.test(cle)) {
    out.push({ variable: "SCALEWAY_ACCESS_KEY_ID", gravite: "avertissement", message: "format inhabituel : une clé Scaleway commence par `SCW` et fait 20 caractères." });
  }
  if (secret && estPlaceholder(secret)) {
    out.push({ variable: "SCALEWAY_SECRET_ACCESS_KEY", gravite: "erreur", message: "valeur d'exemple." });
  } else if (secret && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) {
    out.push({ variable: "SCALEWAY_SECRET_ACCESS_KEY", gravite: "avertissement", message: "format inhabituel : la clé secrète Scaleway est un UUID." });
  }
  if (bucket && !nomBucketValide(bucket)) {
    out.push({
      variable: "SCALEWAY_BUCKET",
      gravite: "erreur",
      message: "nom invalide : 3 à 63 caractères, minuscules, chiffres et tirets simples. Un point casserait le certificat TLS (accès en virtual-host style).",
    });
  }

  const region = env.SCALEWAY_REGION?.trim() || "fr-par";
  if (region !== "fr-par") {
    out.push({ variable: "SCALEWAY_REGION", gravite: "erreur", message: `${region} : le projet impose \`fr-par\` (archives conservées en France).` });
  }

  const endpoint = env.SCALEWAY_ENDPOINT?.trim();
  if (endpoint) {
    if (!endpoint.startsWith("https://")) {
      out.push({ variable: "SCALEWAY_ENDPOINT", gravite: "erreur", message: "doit être en HTTPS." });
    }
    if (!endpoint.includes(`s3.${region}.scw.cloud`)) {
      out.push({
        variable: "SCALEWAY_ENDPOINT",
        gravite: "erreur",
        message: `incohérent avec \`SCALEWAY_REGION\` (${region}) : attendu \`https://s3.${region}.scw.cloud\`.`,
      });
    }
    if (bucket && endpoint.includes(`${bucket}.`)) {
      out.push({ variable: "SCALEWAY_ENDPOINT", gravite: "erreur", message: "ne doit pas contenir le nom du bucket : le SDK le préfixe lui-même." });
    }
  }

  const annees = env.ARCHIVE_RETENTION_YEARS?.trim();
  if (annees !== undefined && annees !== "") {
    const n = entier(annees);
    if (n === null || n < 1) {
      out.push({ variable: "ARCHIVE_RETENTION_YEARS", gravite: "erreur", message: "doit être un entier d'au moins 1." });
    } else if (n < RETENTION_ANNEES_PROJET) {
      out.push({
        variable: "ARCHIVE_RETENTION_YEARS",
        gravite: "avertissement",
        message: `${n} an(s), en deçà des ${RETENTION_ANNEES_PROJET} ans retenus par le projet. La rétention Object Lock est irréversible : elle ne pourra pas être rallongée après coup sur les objets déjà déposés.`,
      });
    }
  }
}

function controlerRetentions(env: Environnement, out: Diagnostic[]): void {
  const jours = env.RETENTION_POINTAGES_JOURS?.trim();
  if (jours === undefined || jours === "") return;
  const n = entier(jours);
  if (n === null || n < 1) {
    out.push({ variable: "RETENTION_POINTAGES_JOURS", gravite: "erreur", message: "doit être un entier d'au moins 1." });
    return;
  }
  if (n < 365) {
    out.push({ variable: "RETENTION_POINTAGES_JOURS", gravite: "avertissement", message: `${n} jours : les pointages seraient purgés avant un an.` });
  }
  const annees = entier(env.ARCHIVE_RETENTION_YEARS?.trim() || String(RETENTION_ANNEES_PROJET));
  if (annees !== null && annees >= 1) {
    const attendu = Math.round(annees * JOURS_PAR_AN);
    if (Math.abs(n - attendu) > JOURS_PAR_AN) {
      out.push({
        variable: "RETENTION_POINTAGES_JOURS",
        gravite: "avertissement",
        message: `${n} jours face à ${annees} an(s) d'archives (≈ ${attendu} jours) : les pointages et les PDF ne disparaîtraient pas en même temps.`,
      });
    }
  }
}

function controlerDivers(env: Environnement, production: boolean, out: Diagnostic[]): void {
  const driver = env.DATABASE_DRIVER?.trim();
  if (driver && driver !== "pg" && driver !== "neon") {
    out.push({ variable: "DATABASE_DRIVER", gravite: "erreur", message: "valeurs admises : `pg` ou `neon` (sinon, laissez la variable vide : le driver est déduit de l'hôte)." });
  }

  if (env.SKIP_MIGRATIONS?.trim() === "1" && production) {
    out.push({ variable: "SKIP_MIGRATIONS", gravite: "avertissement", message: "à 1 en production : le build ne jouera pas les migrations." });
  }

  const url = env.NEXT_PUBLIC_APP_URL?.trim();
  if (url) {
    if (!url.startsWith("https://") && production) {
      out.push({ variable: "NEXT_PUBLIC_APP_URL", gravite: "erreur", message: "doit être en HTTPS." });
    }
    if (url.endsWith("/")) {
      out.push({ variable: "NEXT_PUBLIC_APP_URL", gravite: "avertissement", message: "supprimez la barre oblique finale." });
    }
  }

  const apk = env.KIOSQUE_APK_URL?.trim();
  if (apk && !apk.startsWith("https://")) {
    out.push({ variable: "KIOSQUE_APK_URL", gravite: "erreur", message: "doit être en HTTPS : les tablettes refusent un téléchargement en clair." });
  }
  const version = env.KIOSQUE_APK_VERSION?.trim();
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    out.push({ variable: "KIOSQUE_APK_VERSION", gravite: "avertissement", message: "format attendu `x.y.z` : les tablettes comparent cette valeur à la leur." });
  }

  const motDePasse = env.SEED_GERANT_MOT_DE_PASSE?.trim();
  if (motDePasse && estPlaceholder(motDePasse)) {
    out.push({ variable: "SEED_GERANT_MOT_DE_PASSE", gravite: "erreur", message: "mot de passe d'exemple : le premier gérant serait créé avec un mot de passe public." });
  }
}

/** Passe en revue l'environnement et renvoie les diagnostics, les erreurs d'abord. */
export function controlerEnvironnement(env: Environnement, options: OptionsControle = {}): Diagnostic[] {
  const production = options.production ?? false;
  const out: Diagnostic[] = [];
  controlerBase(env, production, out);
  controlerSecrets(env, production, out);
  controlerStockage(env, production, out);
  controlerRetentions(env, out);
  controlerDivers(env, production, out);
  const ordre: Record<Gravite, number> = { erreur: 0, avertissement: 1, info: 2 };
  return out.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);
}

export function compter(diagnostics: Diagnostic[], gravite: Gravite): number {
  return diagnostics.filter((d) => d.gravite === gravite).length;
}
