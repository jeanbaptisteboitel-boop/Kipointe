# Kipointe — pointage par badge QR + PIN sur tablette murale

Application multi-entreprises de suivi du temps de travail destinée aux clients TPE/PME du cabinet OMNIUP
(restauration, coiffure, automobile, commerce). Le salarié présente son badge QR à une tablette murale,
saisit son PIN à 4 chiffres, et le serveur déduit entrée/sortie. Le gérant corrige, valide et archive le
récapitulatif hebdomadaire (article D.3171-8 du Code du travail) en PDF à valeur probante.

**Stack** : Next.js 16 (App Router) + TypeScript · Drizzle ORM · Neon PostgreSQL (EU) · Scaleway Object
Storage `fr-par` (Object Lock) · Vercel `cdg1` (Paris) · sessions cookies `httpOnly` maison · PWA kiosque
hors ligne (Service Worker + IndexedDB) · wrapper Android Kotlin (Lock Task + ML Kit).

## Démarrage rapide

```bash
npm install
cp .env.example .env          # renseigner DATABASE_URL (Neon) ou un Postgres local
npm run db:migrate            # tables, index, policies RLS
npm run db:seed               # organisation de démonstration (gérant, salariés, code d'appairage)
npm run dev                   # http://localhost:3000
npm test                      # tests sur PGlite (PostgreSQL en mémoire)
```

Déploiement Vercel / Neon / Scaleway pas à pas : **[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)**.
Wrapper Android : **[android/README.md](android/README.md)**.

## Ce que fait la V1

| Domaine | Contenu |
|---|---|
| Pointage | badge `BADGE:<uuid>` + PIN Argon2id, 5 échecs → verrouillage 15 min, rate limiting 10 échecs/min (terminal et badge), idempotence, anti-rebond, type déduit serveur |
| Hors ligne | file IndexedDB, horloge tablette + offset mesuré au heartbeat, resynchronisation batch (retour réseau + 60 s, retry exponentiel), vérification locale du PIN, bandeau « Hors ligne — X pointages en attente », Service Worker |
| Calcul | semaine ISO, journées rattachées à 04:00 (services de nuit), heures sup par paliers paramétrables (légal ou HCR), alertes repos 11 h / 35 h, pause après 6 h, amplitude 13 h, oubli de sortie |
| Gérant | tableau salariés × jours, anomalies en tête, corrections additives avec motif, saisie manuelle tracée, badges imprimables (QR), PIN, terminaux et appairage, paramètres par organisation |
| Récap hebdo | brouillon recalculé puis **figé** à la validation : PDF, SHA-256, archivage Scaleway en mode gouvernance, URL présignée 15 min |
| Conformité | note d'information salariés, registre RGPD, espace salarié (consultation + export CSV), journal des accès admin, purge automatique 5 ans, RLS par organisation |

## Structure

```
src/app/           pages (kiosque, gérant, salarié, connexion) et routes API
src/db/            schéma Drizzle, connexion Neon/pg, helpers tenant (RLS), migrations, seed
src/lib/pointage/  service de pointage (badge + PIN, verrouillage, idempotence, déduction du type)
src/lib/calcul/    moteur hebdomadaire, anomalies, vue effective des pointages (corrections)
src/lib/kiosque/   PWA kiosque : file hors ligne, synchronisation, scanner, vérificateur de PIN
src/lib/pdf/       récap hebdomadaire PDF
src/lib/storage/   Scaleway S3 (Object Lock, URL présignées)
drizzle/           migrations SQL (0000 schéma, 0001 RLS)
tests/             tests Vitest sur PGlite (scénarios non négociables du brief)
android/           wrapper Kotlin (Lock Task, CameraX + ML Kit, bridge JS)
docs/              déploiement, note d'information salariés
```

## Tests non négociables (brief §10)

`npm test` couvre : rejeu d'une `idempotency_key` consommée · coupure réseau de 4 h avec 60 pointages en
file (rejeu dans le désordre, second rejeu ignoré) · tablette dont l'horloge dérive de 10 minutes (en ligne
et hors ligne) · oubli de sortie sur 2 jours consécutifs · changement d'heure d'octobre (Europe/Paris,
stockage UTC) · badge inconnu · 6 PIN faux consécutifs · paliers HCR · repos quotidien/hebdomadaire ·
pause manquante · amplitude · corrections additives · isolation RLS.

## Hors périmètre V1

Congés/absences, export paie, pointage multi-sites chantier, QR tournant TOTP (annexe § 11 du brief) :
prévus en V1.5.
