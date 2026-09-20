# Déploiement — Vercel (cdg1) + Neon (EU) + Scaleway (fr-par)

Toutes les données personnelles restent dans l'Union européenne : fonctions Vercel à Paris (`cdg1`),
base Neon en région EU, archives PDF sur Scaleway Object Storage à Paris (`fr-par`).

## 1. Neon — base PostgreSQL

1. Créer un projet Neon en région **EU (`eu-central-1`, Francfort)** — ou `eu-west-2` (Londres) si vous
   préférez ; aucune région hors UE.
2. Dans *Connection details*, récupérer deux chaînes :
   - **pooled** (hôte `…-pooler.eu-central-1.aws.neon.tech`) → `DATABASE_URL` (utilisée par l'application) ;
   - **direct** (sans `-pooler`) → `DATABASE_URL_UNPOOLED` (utilisée par les migrations).
3. Les migrations (`drizzle/*.sql`) créent les tables, les index et les policies **Row Level Security**
   (`FORCE ROW LEVEL SECURITY` : elles s'appliquent aussi au rôle propriétaire utilisé par l'application).
   Chaque transaction applicative positionne `app.organisation_id` ; sans lui, aucune ligne n'est visible.

Pour appliquer les migrations depuis votre poste :

```bash
cp .env.example .env    # renseigner DATABASE_URL / DATABASE_URL_UNPOOLED
npm install
npm run db:migrate
npm run db:seed         # organisation de démonstration : affiche gérant, code d'appairage, badges et PIN
```

Sur Vercel, `npm run build` exécute `db:migrate` avant `next build` : les migrations sont appliquées à chaque
déploiement (la variable `SKIP_MIGRATIONS=1` permet de les sauter). Définissez `DATABASE_URL` pour
l'environnement **Production** uniquement, ou utilisez une branche Neon pour *Preview*.

## 2. Scaleway — bucket d'archives

Le bucket ne sert qu'aux **récaps hebdomadaires validés** (PDF). Il doit être :

- en région `fr-par` ;
- **versionné** et créé avec **Object Lock** ;
- en rétention par défaut **GOUVERNANCE** de 5 ans (chaque PDF est de toute façon déposé avec sa propre rétention) ;
- **jamais public** : l'application ne remet que des URL présignées valables 15 minutes.

1. Console Scaleway → *IAM* → créer une application « kipointe » avec la politique `ObjectStorageFullAccess`
   (ou limitée au bucket) et générer une clé API (`SCALEWAY_ACCESS_KEY_ID` / `SCALEWAY_SECRET_ACCESS_KEY`).
2. Renseigner `SCALEWAY_BUCKET` (ex. `kipointe-archives-<client>`), puis :

```bash
npm run scaleway:setup
```

Le script crée le bucket avec Object Lock, active le versioning, pose la rétention par défaut et bloque
l'accès public. Vérifiez dans la console que le bucket est bien **privé**.

> Object Lock ne peut être activé qu'à la création du bucket : ne réutilisez pas un bucket existant sans lock.

## 3. Vercel

1. Importer le dépôt GitHub dans Vercel (framework Next.js détecté automatiquement).
2. `vercel.json` fixe déjà la **région des fonctions à `cdg1` (Paris)** et le cron quotidien
   `/api/cron/quotidien` (03:00 UTC : purge des pointages > 5 ans, recalcul des anomalies).
3. Variables d'environnement (*Settings → Environment Variables*), voir `.env.example` :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Neon, chaîne pooled |
| `DATABASE_URL_UNPOOLED` | Neon, chaîne directe (migrations) |
| `SESSION_SECRET` | 32 octets aléatoires (`openssl rand -base64 32`) — signe les sessions |
| `CRON_SECRET` | secret du cron ; Vercel l'envoie automatiquement en `Authorization: Bearer` |
| `SCALEWAY_ACCESS_KEY_ID`, `SCALEWAY_SECRET_ACCESS_KEY` | clé API Scaleway |
| `SCALEWAY_BUCKET`, `SCALEWAY_REGION` (`fr-par`), `SCALEWAY_ENDPOINT` | bucket d'archives |
| `ARCHIVE_RETENTION_YEARS` | rétention Object Lock (5 par défaut) |
| `RETENTION_POINTAGES_JOURS` | purge automatique (1826 jours = 5 ans par défaut) |
| `NEXT_PUBLIC_APP_URL` | URL publique |
| `KIOSQUE_APK_VERSION`, `KIOSQUE_APK_URL` | version d'APK attendue (facultatif) |

4. Déployer. Le premier build applique les migrations ; lancez ensuite `npm run db:seed` depuis votre poste
   (avec les variables de production) pour créer le premier gérant, ou créez l'organisation directement en SQL.

Runtime : Node.js 22 (Argon2 natif via `@node-rs/argon2`, driver Neon en WebSocket). Aucune fonction Edge.

## 4. Tablettes

Voir `android/README.md` (wrapper Kotlin, provisionnement device owner) et, sans wrapper, ouvrez
`https://<domaine>/kiosque/appairage` dans Chrome Android : le kiosque fonctionne aussi en PWA seule
(caméra via `BarcodeDetector`, ou lecteur de badge USB/Bluetooth type « douchette » qui tape le contenu
du QR au clavier).

Séquence : espace gérant → *Terminaux* → créer le terminal → *Générer un code* → saisir le code sur la
tablette (15 min) → premier chargement complet en ligne (Service Worker) → test hors ligne.

## 5. Développement local (sans Neon)

Le driver `pg` est utilisé automatiquement quand l'hôte n'est pas Neon :

```bash
createdb kipointe
DATABASE_URL=postgres://localhost/kipointe npm run db:migrate
DATABASE_URL=postgres://localhost/kipointe npm run db:seed
DATABASE_URL=postgres://localhost/kipointe SESSION_SECRET=dev npm run dev
```

Les tests (`npm test`) tournent sur PGlite (PostgreSQL en mémoire) : aucun service requis.

## 6. Exploitation

- **Purge** : cron quotidien, pointages/anomalies/récaps au-delà de la rétention, tentatives > 1 an, sessions expirées.
- **Journal des accès** : menu *Journal* dans l'espace gérant (table `journal_acces`).
- **Rotation des secrets** : changer `SESSION_SECRET` déconnecte tous les utilisateurs ; révoquer un terminal
  se fait depuis *Terminaux* (le token est invalidé immédiatement).
- **Sauvegardes** : Neon conserve un historique point-in-time ; les PDF sont versionnés et verrouillés sur Scaleway.
