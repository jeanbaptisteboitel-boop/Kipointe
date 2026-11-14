/**
 * Contrôle des variables d'environnement avant déploiement.
 *
 * Le but est d'attraper au sol les erreurs qui, en vol, sont silencieuses :
 *  - `CRON_SECRET` absent → la tâche quotidienne répond 401 : plus aucune notification, sans alerte ;
 *  - `DATABASE_URL` pointant sur l'endpoint direct → épuisement des connexions sur Vercel ;
 *  - `DATABASE_URL_UNPOOLED` pointant sur le pooler → migrations en échec au build ;
 *  - base Neon hors UE → données personnelles de salariés sorties de l'Union ;
 *  - envoi d'e-mails à moitié configuré → notifications jamais envoyées, sans erreur visible.
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
  "re_xxxxxxxx",
];

const LONGUEUR_MINI_SESSION_SECRET = 32;
const LONGUEUR_MINI_CRON_SECRET = 16;

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

function controlerEmail(env: Environnement, out: Diagnostic[]): void {
  const cle = env.RESEND_API_KEY?.trim();
  const expediteur = env.EMAIL_EXPEDITEUR?.trim();
  if (!cle && !expediteur) {
    out.push({ variable: "RESEND_API_KEY", gravite: "info", message: "envoi d'e-mails non configuré : les notifications restent consultables dans les espaces, sans e-mail." });
    return;
  }
  if (!cle || !expediteur) {
    out.push({ variable: cle ? "EMAIL_EXPEDITEUR" : "RESEND_API_KEY", gravite: "erreur", message: "`RESEND_API_KEY` et `EMAIL_EXPEDITEUR` vont ensemble : sans l'une des deux, aucun e-mail ne part." });
    return;
  }
  if (estPlaceholder(cle)) {
    out.push({ variable: "RESEND_API_KEY", gravite: "erreur", message: "valeur d'exemple." });
  } else if (!cle.startsWith("re_")) {
    out.push({ variable: "RESEND_API_KEY", gravite: "avertissement", message: "format inhabituel : une clé Resend commence par `re_`." });
  }
  const adresse = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const nomme = /^[^<>]*<([^<>]+)>$/.exec(expediteur);
  if (!adresse.test(nomme ? nomme[1]! : expediteur)) {
    out.push({ variable: "EMAIL_EXPEDITEUR", gravite: "erreur", message: "attendu `Nom <adresse@domaine>` ou `adresse@domaine`, sur un domaine vérifié chez Resend." });
  }
  if (!env.NEXT_PUBLIC_APP_URL?.trim()) {
    out.push({ variable: "NEXT_PUBLIC_APP_URL", gravite: "avertissement", message: "absente : les e-mails partiront sans lien vers l'espace Kipointe." });
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

  const motDePasse = env.SEED_MOT_DE_PASSE?.trim();
  if (motDePasse && (estPlaceholder(motDePasse) || motDePasse.length < 10)) {
    out.push({ variable: "SEED_MOT_DE_PASSE", gravite: "erreur", message: "mot de passe d'exemple ou trop court : le compte éditeur donne accès à tous les clients." });
  }
}

/** Passe en revue l'environnement et renvoie les diagnostics, les erreurs d'abord. */
export function controlerEnvironnement(env: Environnement, options: OptionsControle = {}): Diagnostic[] {
  const production = options.production ?? false;
  const out: Diagnostic[] = [];
  controlerBase(env, production, out);
  controlerSecrets(env, production, out);
  controlerEmail(env, out);
  controlerDivers(env, production, out);
  const ordre: Record<Gravite, number> = { erreur: 0, avertissement: 1, info: 2 };
  return out.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);
}

export function compter(diagnostics: Diagnostic[], gravite: Gravite): number {
  return diagnostics.filter((d) => d.gravite === gravite).length;
}
