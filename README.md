# Kipointe — le temps de travail relié à la pointeuse de l'entreprise

Application multi-entreprises, éditée par OMNIUP et revendue à ses clients (bâtiment, restauration,
automobile, transport, coiffure…). Le client installe une pointeuse du commerce (NGTeco / ZKTeco) ;
elle transmet d'elle-même ses badgeages à Kipointe, qui en tire le suivi des heures.

| Espace | Pour qui | Contenu |
|---|---|---|
| **Administrateur** `/admin` | l'employeur | heures de l'équipe et écart au contrat, fiches salariés, plannings, corrections de pointage, demandes de congés et absences, pointeuses, notifications, export CSV pour la paie |
| **Salarié** `/salarie` | chaque salarié | ses badgeages, validation de sa semaine ou demande de modification, compteur d'heures, demandes de congés et déclarations d'absence, notifications |
| **Éditeur** `/plateforme` | OMNIUP | création, suivi et suspension des entreprises clientes |

**Stack** : Next.js 16 (App Router, actions serveur) · TypeScript · Drizzle ORM · Neon PostgreSQL (EU)
· Vercel `cdg1` (Paris) · sessions `httpOnly` maison · cloisonnement des clients par Row Level Security.

## Ce que fait l'application

- **Pointeuse** : protocole ADMS / iClock (`/iclock/…`), liste blanche des numéros de série,
  idempotence, double badge, sens déduit ou alterné, badgeages « non rattachés » repris
  rétroactivement ; import du fichier CSV de l'appareil en repli. → [docs/POINTEUSE.md](docs/POINTEUSE.md)
- **Planning** : heures prévues par jour, pour l'entreprise et par salarié (temps partiel). Sa
  somme est la durée contractuelle à laquelle les heures sont comparées.
- **Compteur d'heures** : écart hebdomadaire = réalisé − prévu ; congés, maladie, formation et jours
  fériés comptent comme du temps réalisé, l'absence non autorisée non. Solde cumulé des semaines
  terminées, depuis le premier jour pointé (ou une date et un solde repris, réglés par salarié).
- **Congés et absences** : demande du salarié → décision de l'administrateur ; déclaration de
  maladie ou d'événement familial ; saisie par l'administrateur ; décompte en jours travaillés du
  planning, demi-journées, solde indicatif de congés payés.
- **Notifications** (tâche quotidienne, et e-mail si configuré) : heures non effectuées ou
  supplémentaires par rapport au contrat, absence sans justification, badgeage incomplet, semaine à
  valider, demande de congé et décision, pointeuse silencieuse, badgeages non rattachés.

## Démarrage rapide

```bash
npm install
npm run env:preparer          # crée .env et tire les secrets au hasard ; reste à renseigner DATABASE_URL
npm run db:migrate            # tables, index, policies RLS
SEED_EMAIL=moi@exemple.fr npm run db:seed -- --demo   # compte éditeur + client de démonstration
npm run dev                   # http://localhost:3000
npm test                      # tests sur PGlite (PostgreSQL en mémoire)
```

Déploiement et mise en service d'un client : **[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)**.

## Organisation du code

```
src/app/iclock/        réception des badgeages de la pointeuse
src/app/actions/       actions serveur (toutes passent par src/lib/actions.ts : rôle + RLS)
src/app/{admin,salarie,plateforme}/   les trois espaces
src/lib/pointeuse/     protocole ADMS (pur) et enregistrement
src/lib/pointage/      paires entrée/sortie, semaines, import CSV
src/lib/heures/        heures jour par jour, compteur
src/lib/conges/        règles et service des congés et absences
src/lib/notifications/ création dédoublonnée, tâche quotidienne, e-mail
src/db/                schéma Drizzle, cloisonnement (tenant.ts), amorçage
drizzle/               migrations (0001_rls.sql : policies)
```

## Limites connues

- Pas d'historique des plannings : un changement s'applique aussi aux semaines passées.
- Jours fériés de France métropolitaine seulement (ni Alsace-Moselle ni outre-mer).
- Les heures supplémentaires sont un écart au planning ; les majorations (25 %, 50 %) et le
  contingent restent du ressort de la paie.
- Pas de dépôt de justificatif (arrêt de travail) : il est remis à l'employeur hors de l'application.
- Le numéro de série est le seul contrôle d'accès d'une pointeuse (voir docs/POINTEUSE.md).
