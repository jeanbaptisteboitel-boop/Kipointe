import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compter,
  controlerEnvironnement,
  masquer,
  masquerUrl,
  nomBucketValide,
  regionNeon,
  type Diagnostic,
  type Environnement,
} from "@/lib/config/env";

/** Environnement de production complet et cohérent. Toutes les valeurs sont fictives. */
function envValide(): Environnement {
  return {
    DATABASE_URL: "postgresql://kipointe:motdepasse@ep-essai-1234-pooler.eu-central-1.aws.neon.tech/kipointe?sslmode=require",
    DATABASE_URL_UNPOOLED: "postgresql://kipointe:motdepasse@ep-essai-1234.eu-central-1.aws.neon.tech/kipointe?sslmode=require",
    SESSION_SECRET: "secret-de-test-Vb7qL2ZmT9xKpR4sD1gN6hW8",
    CRON_SECRET: "cron-de-test-Qm3Xv9Tz1Rb7Ns5Kd2Hp8",
    SCALEWAY_ACCESS_KEY_ID: "SCWTESTTESTTEST00000",
    SCALEWAY_SECRET_ACCESS_KEY: "00000000-0000-4000-8000-000000000000",
    SCALEWAY_BUCKET: "kipointe-archives",
    SCALEWAY_REGION: "fr-par",
    SCALEWAY_ENDPOINT: "https://s3.fr-par.scw.cloud",
    ARCHIVE_RETENTION_YEARS: "5",
    RETENTION_POINTAGES_JOURS: "1826",
    NEXT_PUBLIC_APP_URL: "https://kipointe.exemple.fr",
    KIOSQUE_APK_VERSION: "1.0.0",
  };
}

function erreursSur(env: Environnement, variable: string): Diagnostic[] {
  return controlerEnvironnement(env, { production: true }).filter((d) => d.gravite === "erreur" && d.variable === variable);
}

describe("contrôle de l'environnement", () => {
  it("ne signale rien sur une configuration de production complète", () => {
    expect(controlerEnvironnement(envValide(), { production: true })).toEqual([]);
  });

  it("refuse la chaîne Neon directe côté application (connexions épuisées sur Vercel)", () => {
    const env = envValide();
    env.DATABASE_URL = env.DATABASE_URL!.replace("-pooler", "");
    expect(erreursSur(env, "DATABASE_URL")[0]?.message).toContain("pooled");
  });

  it("refuse la chaîne poolée pour les migrations", () => {
    const env = envValide();
    env.DATABASE_URL_UNPOOLED = env.DATABASE_URL!;
    expect(erreursSur(env, "DATABASE_URL_UNPOOLED")[0]?.message).toContain("directe");
  });

  it("refuse une base hors Union européenne", () => {
    const env = envValide();
    env.DATABASE_URL = env.DATABASE_URL!.replace("eu-central-1", "us-east-2");
    env.DATABASE_URL_UNPOOLED = env.DATABASE_URL_UNPOOLED!.replace("eu-central-1", "us-east-2");
    expect(erreursSur(env, "DATABASE_URL")[0]?.message).toContain("hors Union européenne");
  });

  it("exige sslmode=require sur Neon", () => {
    const env = envValide();
    env.DATABASE_URL = env.DATABASE_URL!.replace("?sslmode=require", "");
    expect(erreursSur(env, "DATABASE_URL")).toHaveLength(1);
  });

  it("signale deux endpoints Neon différents entre l'application et les migrations", () => {
    const env = envValide();
    env.DATABASE_URL_UNPOOLED = env.DATABASE_URL_UNPOOLED!.replace("ep-essai-1234", "ep-autre-9999");
    const d = controlerEnvironnement(env, { production: true });
    expect(d.some((x) => x.variable === "DATABASE_URL_UNPOOLED" && x.gravite === "avertissement")).toBe(true);
  });

  it("refuse un CRON_SECRET absent en production, en disant ce qui casse", () => {
    const env = envValide();
    delete env.CRON_SECRET;
    expect(erreursSur(env, "CRON_SECRET")[0]?.message).toContain("purge");
  });

  it("tolère un CRON_SECRET absent hors production", () => {
    const env = envValide();
    delete env.CRON_SECRET;
    const d = controlerEnvironnement(env, { production: false });
    expect(d.filter((x) => x.variable === "CRON_SECRET" && x.gravite === "erreur")).toHaveLength(0);
  });

  it("refuse un SESSION_SECRET trop court ou laissé au gabarit", () => {
    const court = { ...envValide(), SESSION_SECRET: "trop-court" };
    expect(erreursSur(court, "SESSION_SECRET")).toHaveLength(1);
    const gabarit = { ...envValide(), SESSION_SECRET: "changez-moi-32-octets-aleatoires-minimum" };
    expect(erreursSur(gabarit, "SESSION_SECRET")).toHaveLength(1);
  });

  it("refuse le même secret pour les sessions et le cron", () => {
    const env = envValide();
    env.CRON_SECRET = env.SESSION_SECRET;
    expect(erreursSur(env, "CRON_SECRET")).toHaveLength(1);
  });

  it("impose la région fr-par pour les archives", () => {
    const env = { ...envValide(), SCALEWAY_REGION: "nl-ams", SCALEWAY_ENDPOINT: "https://s3.nl-ams.scw.cloud" };
    expect(erreursSur(env, "SCALEWAY_REGION")).toHaveLength(1);
  });

  it("détecte un endpoint incohérent avec la région", () => {
    const env = { ...envValide(), SCALEWAY_ENDPOINT: "https://s3.nl-ams.scw.cloud" };
    expect(erreursSur(env, "SCALEWAY_ENDPOINT")[0]?.message).toContain("incohérent");
  });

  it("refuse un endpoint contenant déjà le nom du bucket", () => {
    const env = { ...envValide(), SCALEWAY_ENDPOINT: "https://kipointe-archives.s3.fr-par.scw.cloud" };
    expect(erreursSur(env, "SCALEWAY_ENDPOINT")).toHaveLength(1);
  });

  it("refuse un nom de bucket qui casserait le certificat TLS", () => {
    const env = { ...envValide(), SCALEWAY_BUCKET: "kipointe.archives" };
    expect(erreursSur(env, "SCALEWAY_BUCKET")).toHaveLength(1);
  });

  it("refuse une configuration Scaleway partielle", () => {
    const env = envValide();
    delete env.SCALEWAY_SECRET_ACCESS_KEY;
    expect(erreursSur(env, "SCALEWAY_*")[0]?.message).toContain("partielle");
  });

  it("signale l'archivage non configuré selon la cible", () => {
    const env = envValide();
    delete env.SCALEWAY_ACCESS_KEY_ID;
    delete env.SCALEWAY_SECRET_ACCESS_KEY;
    delete env.SCALEWAY_BUCKET;
    expect(erreursSur(env, "SCALEWAY_*")[0]?.message).toContain("503");
    const local = controlerEnvironnement(env, { production: false });
    expect(local.filter((d) => d.variable === "SCALEWAY_*" && d.gravite === "erreur")).toHaveLength(0);
  });

  it("signale une rétention d'archives plus courte que celle du projet", () => {
    const env = { ...envValide(), ARCHIVE_RETENTION_YEARS: "2", RETENTION_POINTAGES_JOURS: "731" };
    const d = controlerEnvironnement(env, { production: true });
    expect(d.some((x) => x.variable === "ARCHIVE_RETENTION_YEARS" && x.gravite === "avertissement")).toBe(true);
    expect(compter(d, "erreur")).toBe(0);
  });

  it("signale des durées de purge et d'archivage qui divergent", () => {
    const env = { ...envValide(), RETENTION_POINTAGES_JOURS: "365" };
    const d = controlerEnvironnement(env, { production: true });
    expect(d.filter((x) => x.variable === "RETENTION_POINTAGES_JOURS" && x.gravite === "avertissement").length).toBeGreaterThan(0);
  });

  it("refuse une durée de rétention non numérique", () => {
    expect(erreursSur({ ...envValide(), ARCHIVE_RETENTION_YEARS: "cinq" }, "ARCHIVE_RETENTION_YEARS")).toHaveLength(1);
    expect(erreursSur({ ...envValide(), RETENTION_POINTAGES_JOURS: "0" }, "RETENTION_POINTAGES_JOURS")).toHaveLength(1);
  });

  it("refuse une URL d'APK en clair et un driver inconnu", () => {
    expect(erreursSur({ ...envValide(), KIOSQUE_APK_URL: "http://exemple.fr/k.apk" }, "KIOSQUE_APK_URL")).toHaveLength(1);
    expect(erreursSur({ ...envValide(), DATABASE_DRIVER: "mysql" }, "DATABASE_DRIVER")).toHaveLength(1);
  });

  it("classe les erreurs avant les avertissements", () => {
    const env = { ...envValide(), SCALEWAY_REGION: "nl-ams", KIOSQUE_APK_VERSION: "1.0" };
    const d = controlerEnvironnement(env, { production: true });
    const premierAvertissement = d.findIndex((x) => x.gravite === "avertissement");
    const derniereErreur = d.map((x) => x.gravite).lastIndexOf("erreur");
    expect(derniereErreur).toBeLessThan(premierAvertissement);
  });

  it("rejette le gabarit .env.example tel quel : il ne doit jamais passer le contrôle", () => {
    const texte = readFileSync(path.resolve(import.meta.dirname, "..", ".env.example"), "utf8");
    const env: Environnement = {};
    for (const ligne of texte.split("\n")) {
      const nette = ligne.trim();
      if (nette === "" || nette.startsWith("#") || !nette.includes("=")) continue;
      const i = nette.indexOf("=");
      env[nette.slice(0, i).trim()] = nette.slice(i + 1).replace(/^"|"$/g, "");
    }
    expect(env.DATABASE_URL).toBeDefined();
    expect(compter(controlerEnvironnement(env, { production: true }), "erreur")).toBeGreaterThan(0);
  });
});

describe("affichage sans fuite de secret", () => {
  it("masque une valeur sans jamais la rendre lisible", () => {
    const secret = "cron-de-test-Qm3Xv9Tz1Rb7Ns5Kd2Hp8";
    const masque = masquer(secret);
    expect(masque).not.toContain(secret.slice(3, -2));
    expect(masque.startsWith("cro")).toBe(true);
    expect(masquer("court")).toBe("•••••");
    expect(masquer(undefined)).toBe("(vide)");
  });

  it("masque le mot de passe d'une URL de connexion en gardant l'hôte lisible", () => {
    const affiche = masquerUrl("postgresql://kipointe:motdepasse@ep-essai-1234-pooler.eu-central-1.aws.neon.tech/kipointe?sslmode=require");
    expect(affiche).not.toContain("motdepasse");
    expect(affiche).toContain("ep-essai-1234-pooler.eu-central-1.aws.neon.tech");
    expect(affiche).toContain("kipointe:");
  });
});

describe("utilitaires", () => {
  it("extrait la région d'un hôte Neon", () => {
    expect(regionNeon("postgresql://u:p@ep-essai-1234-pooler.eu-central-1.aws.neon.tech/db")).toBe("eu-central-1");
    expect(regionNeon("postgres://localhost/kipointe")).toBeNull();
  });

  it("valide les noms de bucket compatibles virtual-host style", () => {
    expect(nomBucketValide("kipointe-archives")).toBe(true);
    expect(nomBucketValide("kipointe.archives")).toBe(false);
    expect(nomBucketValide("Kipointe")).toBe(false);
    expect(nomBucketValide("ki")).toBe(false);
    expect(nomBucketValide("-kipointe")).toBe(false);
    expect(nomBucketValide("kipointe--archives")).toBe(false);
    expect(nomBucketValide("a".repeat(64))).toBe(false);
  });
});
