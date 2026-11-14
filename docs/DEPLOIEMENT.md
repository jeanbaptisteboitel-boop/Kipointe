# Déploiement — Vercel (cdg1) + Neon (EU) + Scaleway (fr-par)

Toutes les données restent dans l'Union européenne : fonctions Vercel à Paris (`cdg1`), base Neon
en région EU, justificatifs des salariés dans un bucket Scaleway à Paris (`fr-par`). L'envoi
d'e-mails (Resend) est facultatif.

## 1. Préparer

```bash
npm install
npm run env:preparer          # crée .env, tire SESSION_SECRET et CRON_SECRET au hasard
#   → renseigner dans .env : les deux chaînes Neon, la clé Scaleway et l'URL publique
npm run env:verifier          # contrôle la cohérence de l'ensemble
```

Neon : projet en région **EU** ; chaîne *pooled* → `DATABASE_URL`, chaîne directe →
`DATABASE_URL_UNPOOLED`.

> **Base neuve.** Cette version remplace entièrement l'ancien schéma (tablette, badges QR). Une base
> qui a reçu les anciennes migrations doit être recréée (nouvelle base ou nouvelle branche Neon).

## 2. Créer la base et le compte éditeur

```bash
npm run db:migrate
SEED_EMAIL=vous@domaine.fr SEED_MOT_DE_PASSE='…' npm run db:seed
npm run db:seed -- --demo     # facultatif : un client de démonstration
```

Le compte éditeur ouvre l'espace **Clients**, d'où chaque entreprise cliente est créée avec son
administrateur.

## 3. Scaleway — bucket des justificatifs

Les salariés y déposent leurs justificatifs (arrêt de travail, acte de naissance…), jusqu'à 25 Mo.
Le navigateur envoie le fichier **directement au bucket** par une URL signée à durée courte : il
ne traverse pas Vercel, qui plafonne une requête à 4,5 Mo.

1. Console Scaleway → *IAM* → application « kipointe », politique `ObjectStorageFullAccess` (ou
   limitée au bucket), puis une clé API → `SCALEWAY_ACCESS_KEY_ID` / `SCALEWAY_SECRET_ACCESS_KEY`.
2. Choisir `SCALEWAY_BUCKET` (nom global à tout Scaleway : minuscules, chiffres, tirets).
3. `NEXT_PUBLIC_APP_URL` doit être l'adresse définitive du service, puis :

```bash
npm run scaleway:setup       # crée le bucket, le ferme au public, pose la règle CORS
npm run scaleway:verifier    # audit en lecture seule
```

- **Privé** : aucun accès public ; lecture par URL signée d'une minute, après contrôle d'accès.
- **Sans Object Lock** : un justificatif est supprimé avec l'absence. Le script refuse un bucket
  verrouillé (ne réutilisez pas celui d'une version antérieure).
- **CORS** : seule l'adresse du service peut envoyer un fichier. Si l'adresse change, ou pour
  autoriser un aperçu Vercel (`SCALEWAY_CORS_ORIGINES`), relancez `scaleway:setup` — sinon l'envoi
  échoue dans le navigateur.

## 4. Vercel

```bash
./scripts/vercel-env-push.sh production
```

| Variable | Rôle | Obligatoire |
|---|---|---|
| `DATABASE_URL` | Neon, chaîne pooled | oui |
| `DATABASE_URL_UNPOOLED` | Neon, chaîne directe (migrations au build) | oui |
| `SESSION_SECRET` | signe les sessions | oui |
| `CRON_SECRET` | tâche quotidienne. **Absent : plus aucune notification, sans alerte** | oui |
| `NEXT_PUBLIC_APP_URL` | URL publique : liens des e-mails, origine autorisée à envoyer au bucket | oui |
| `SCALEWAY_ACCESS_KEY_ID`, `SCALEWAY_SECRET_ACCESS_KEY`, `SCALEWAY_BUCKET` | bucket des justificatifs | oui |
| `SCALEWAY_REGION` | `fr-par` | défaut `fr-par` |
| `RESEND_API_KEY`, `EMAIL_EXPEDITEUR` | envoi des notifications par e-mail | non |

`vercel.json` fixe la région `cdg1` et la tâche quotidienne `/api/cron/quotidien` à 03:00 UTC
(point de la veille : absences, oublis de badge, écarts au contrat, pointeuses silencieuses).

## 5. Mettre un client en service

1. Espace éditeur → **Nouveau client** : remettre à l'administrateur ses identifiants provisoires.
2. L'administrateur règle le **planning de l'entreprise** (Paramètres), crée ses **salariés** avec
   leur numéro dans la pointeuse, enregistre le **numéro de série** de l'appareil (Pointeuses) et
   suit le guide de branchement affiché sur cette page.
3. Il ouvre l'**espace salarié** de chacun depuis sa fiche.

Détail du protocole et de ses limites : [POINTEUSE.md](POINTEUSE.md).

## 6. Développement local

```bash
createdb kipointe
DATABASE_URL=postgres://localhost/kipointe npm run db:migrate
DATABASE_URL=postgres://localhost/kipointe SEED_EMAIL=moi@exemple.fr npm run db:seed -- --demo
DATABASE_URL=postgres://localhost/kipointe SESSION_SECRET=dev-0123456789abcdef npm run dev
```

Simuler un badgeage :

```bash
curl -X POST "http://localhost:3000/iclock/cdata?SN=DEMO0000001&table=ATTLOG&Stamp=1" \
  --data-binary $'1\t2026-11-16 08:02:00\t0\t1'
```

Les tests (`npm test`) tournent sur PGlite, sous un rôle sans privilège : le cloisonnement entre
clients (RLS) y est réellement appliqué.
