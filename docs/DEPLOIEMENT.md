# Déploiement — Vercel (cdg1) + Neon (EU) + Scaleway (fr-par)

Toutes les données personnelles restent dans l'Union européenne : fonctions Vercel à Paris (`cdg1`),
base Neon en région EU, archives PDF sur Scaleway Object Storage à Paris (`fr-par`).

## 0. Ordre des opérations

```bash
npm install
npm run env:preparer          # crée .env, tire SESSION_SECRET et CRON_SECRET au hasard
#   → renseigner dans .env : les deux chaînes Neon, la clé Scaleway, l'URL publique
npm run env:verifier          # contrôle la cohérence de l'ensemble
npm run db:migrate            # crée les tables, les index et les policies RLS
npm run scaleway:setup        # crée le bucket d'archives avec Object Lock
./scripts/vercel-env-push.sh production
```

`npm run env:preparer` est **idempotent** : relancé, il conserve les valeurs déjà saisies et ne
régénère les secrets que si on lui passe `--forcer`. Le fichier `.env` est écrit en permissions `600`
et ignoré par git : aucune valeur réelle ne part sur GitHub.

## 1. Neon — base PostgreSQL

1. Créer un projet Neon en région **EU (`eu-central-1`, Francfort)** — ou une autre région `eu-…` ;
   aucune région hors UE (les pointages sont des données personnelles de salariés).
2. Dans *Connection details*, récupérer deux chaînes :
   - **pooled** (hôte `…-pooler.eu-central-1.aws.neon.tech`) → `DATABASE_URL`, utilisée par l'application.
     Sans le pooler, les fonctions Vercel épuisent les connexions de la base ;
   - **direct** (sans `-pooler`) → `DATABASE_URL_UNPOOLED`, utilisée par les migrations.
3. Les migrations (`drizzle/*.sql`) créent les tables, les index et les policies **Row Level Security**
   (`FORCE ROW LEVEL SECURITY` : elles s'appliquent aussi au rôle propriétaire utilisé par l'application).
   Chaque transaction applicative positionne `app.organisation_id` ; sans lui, aucune ligne n'est visible.

```bash
npm run db:migrate
npm run db:seed         # organisation de démonstration : affiche gérant, code d'appairage, badges et PIN
```

Sur Vercel, `npm run build` exécute `db:migrate` avant `next build` : les migrations sont appliquées à chaque
déploiement (`SKIP_MIGRATIONS=1` permet de les sauter). Définissez `DATABASE_URL` pour l'environnement
**Production** uniquement, ou utilisez une branche Neon pour *Preview*.

## 2. Scaleway — bucket d'archives

Le bucket ne sert qu'aux **récaps hebdomadaires validés** (PDF). Il doit être :

- en région `fr-par` ;
- **versionné** et créé avec **Object Lock** ;
- en rétention par défaut **GOUVERNANCE** de 5 ans (chaque PDF est de toute façon déposé avec sa propre rétention) ;
- **jamais public** : l'application ne remet que des URL présignées valables 15 minutes.

1. Console Scaleway → *IAM* → créer une application « kipointe » avec la politique `ObjectStorageFullAccess`
   (ou limitée au bucket) et générer une clé API (`SCALEWAY_ACCESS_KEY_ID` / `SCALEWAY_SECRET_ACCESS_KEY`).
2. Choisir `SCALEWAY_BUCKET`. Le nom est **global à tout Scaleway** : si `kipointe-archives` est pris,
   le script le signale et propose une variante. Minuscules, chiffres et tirets seulement — un point
   casserait le certificat TLS, l'accès se faisant en *virtual-host style*.
3. Lancer :

```bash
npm run scaleway:setup       # crée et configure le bucket
npm run scaleway:verifier    # audit en lecture seule, à relancer quand on veut
```

Le script crée le bucket avec Object Lock, active le versioning, pose la rétention par défaut, bloque
l'accès public, puis **relit la configuration** : c'est l'état constaté qui est affiché, pas le code de
retour des écritures. Toute anomalie sort en erreur.

> **Object Lock ne peut être activé qu'à la création du bucket.** S'il manque sur un bucket existant,
> le script s'arrête au lieu de laisser croire que les archives sont verrouillées : des PDF déposés dans
> un bucket sans lock resteraient effaçables, ce qui leur ôterait leur valeur probante. Il faut alors
> créer un nouveau bucket.

> La rétention est **irréversible** : `ARCHIVE_RETENTION_YEARS` ne pourra pas être rallongée sur les
> objets déjà déposés. La valeur par défaut est 5 ans.

## 3. Vercel

1. Importer le dépôt GitHub dans Vercel (framework Next.js détecté automatiquement).
2. `vercel.json` fixe déjà la **région des fonctions à `cdg1` (Paris)** et le cron quotidien
   `/api/cron/quotidien` (03:00 UTC : purge des pointages au-delà de la rétention, recalcul des anomalies).
3. Envoyer les variables d'environnement :

```bash
./scripts/vercel-env-push.sh production              # depuis le .env local
./scripts/vercel-env-push.sh production --remplacer  # écrase celles déjà définies
vercel env ls production                             # vérification
```

Les valeurs transitent par l'entrée standard : elles n'apparaissent ni à l'écran, ni dans la liste des
processus, ni dans l'historique du terminal. Les variables d'amorçage et de développement
(`SEED_*`, `DATABASE_DRIVER`, `SKIP_MIGRATIONS`) restent sur le poste. À défaut de CLI, la saisie
manuelle se fait dans *Settings → Environment Variables* :

| Variable | Rôle | Obligatoire |
|---|---|---|
| `DATABASE_URL` | Neon, chaîne pooled | oui |
| `DATABASE_URL_UNPOOLED` | Neon, chaîne directe (migrations) | oui |
| `SESSION_SECRET` | signe les sessions ; le changer déconnecte tout le monde | oui |
| `CRON_SECRET` | secret du cron ; Vercel l'envoie en `Authorization: Bearer`. **Absent, la purge quotidienne répond 401 sans alerte** | oui |
| `SCALEWAY_ACCESS_KEY_ID`, `SCALEWAY_SECRET_ACCESS_KEY` | clé API Scaleway | oui |
| `SCALEWAY_BUCKET` | bucket d'archives | oui |
| `SCALEWAY_REGION` | `fr-par` | défaut `fr-par` |
| `SCALEWAY_ENDPOINT` | `https://s3.fr-par.scw.cloud` | déduit de la région |
| `ARCHIVE_RETENTION_YEARS` | rétention Object Lock | défaut 5 |
| `RETENTION_POINTAGES_JOURS` | purge automatique | défaut 1826 (5 ans) |
| `NEXT_PUBLIC_APP_URL` | URL publique du service | non |
| `KIOSQUE_APK_VERSION`, `KIOSQUE_APK_URL` | version et téléchargement de l'APK tablette | non |

4. Déployer. Le premier build applique les migrations ; lancez ensuite `npm run db:seed` depuis votre poste
   (avec les variables de production) pour créer le premier gérant, ou créez l'organisation directement en SQL.

Runtime : Node.js 22 (Argon2 natif via `@node-rs/argon2`, driver Neon en WebSocket). Aucune fonction Edge.

## 4. Contrôle avant mise en service

```bash
npm run env:verifier -- --production   # sort en code 1 si une erreur subsiste
npm run scaleway:verifier              # relit la configuration réelle du bucket
npm run typecheck && npm test
```

`env:verifier` reprend les pièges qui ne se voient pas à l'exécution : chaîne Neon directe côté
application, chaîne poolée côté migrations, base hors UE, `sslmode` manquant, endpoint Scaleway
incohérent avec la région, `SESSION_SECRET` et `CRON_SECRET` identiques, durées de purge et
d'archivage qui divergent. Les secrets sont masqués à l'affichage ; les réglages non sensibles
(bucket, région, rétentions) restent lisibles pour être relus.

Puis, en conditions réelles : créer un terminal, appairer une tablette, faire un pointage, valider un
récap hebdomadaire et vérifier que le PDF se télécharge (URL présignée de 15 minutes) et qu'il apparaît
dans le bucket.

## 5. Tablettes

Voir `android/README.md` (wrapper Kotlin, provisionnement device owner) et, sans wrapper, ouvrez
`https://<domaine>/kiosque/appairage` dans Chrome Android : le kiosque fonctionne aussi en PWA seule
(caméra via `BarcodeDetector`, ou lecteur de badge USB/Bluetooth type « douchette » qui tape le contenu
du QR au clavier).

Séquence : espace gérant → *Terminaux* → créer le terminal → *Générer un code* → saisir le code sur la
tablette (15 min) → premier chargement complet en ligne (Service Worker) → test hors ligne.

## 6. Développement local (sans Neon)

Le driver `pg` est utilisé automatiquement quand l'hôte n'est pas Neon :

```bash
createdb kipointe
DATABASE_URL=postgres://localhost/kipointe npm run db:migrate
DATABASE_URL=postgres://localhost/kipointe npm run db:seed
DATABASE_URL=postgres://localhost/kipointe SESSION_SECRET=dev npm run dev
```

Les tests (`npm test`) tournent sur PGlite (PostgreSQL en mémoire) : aucun service requis.

## 7. Exploitation

- **Purge** : cron quotidien, pointages/anomalies/récaps au-delà de la rétention, tentatives > 1 an, sessions expirées.
  Contrôlez de temps en temps que le cron s'exécute (Vercel → *Logs*) : sans `CRON_SECRET`, il échoue en silence.
- **Journal des accès** : menu *Journal* dans l'espace gérant (table `journal_acces`).
- **Rotation des secrets** : `npm run env:preparer -- --forcer` régénère `SESSION_SECRET` et `CRON_SECRET`,
  puis `./scripts/vercel-env-push.sh production --remplacer`. Changer `SESSION_SECRET` déconnecte tous les
  utilisateurs. Révoquer un terminal se fait depuis *Terminaux* (le token est invalidé immédiatement).
- **Sauvegardes** : Neon conserve un historique point-in-time ; les PDF sont versionnés et verrouillés sur Scaleway.
