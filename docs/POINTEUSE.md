# Pointeuse du client (protocole ADMS / iClock)

La pointeuse installée chez le client (NGTeco, famille ZKTeco) envoie elle-même ses badgeages à
Kipointe. Rien n'est installé sur un poste du client.

- Route : `src/app/iclock/[...chemin]/route.ts` (le chemin `/iclock/…` est figé par l'appareil).
- Protocole (pur) : `src/lib/pointeuse/adms.ts` ; enregistrement : `src/lib/pointeuse/enregistrement.ts`.
- Écran : espace administrateur → **Pointeuses**.

## Échanges

| Requête de l'appareil | Réponse |
| --- | --- |
| `GET /iclock/cdata?SN=…&options=all` | configuration : `Stamp`, `TransTimes=00:00;12:00`, `Realtime=1`, `TimeZone`… |
| `POST /iclock/cdata?SN=…&table=ATTLOG&Stamp=…` | `OK: <n>` (n = lignes reçues) |
| `POST /iclock/cdata?SN=…&table=<autre>` | `OK` (rien n'est lu) |
| `GET /iclock/getrequest?SN=…` | `OK` (aucune commande) |
| `POST /iclock/devicecmd?SN=…` | `OK` |

`Realtime=1` : chaque badgeage part aussitôt. `TransTimes` : envoi complet deux fois par jour, qui
rattrape une coupure de réseau — l'appareil garde ses badgeages tant qu'il n'a pas reçu « OK ».

## Badgeages

Une ligne ATTLOG : `PIN<TAB>AAAA-MM-JJ HH:MM:SS<TAB>état<TAB>vérification<TAB>…`.

- **PIN → salarié** : la fiche dont le « N° dans la pointeuse » est égal (zéros de tête ignorés).
- **État** : 0 arrivée, 1 départ, 2 début de pause, 3 fin de pause, 4/5 heures supplémentaires.
  Absent ou 255 : alternance (paire ouverte → départ, sinon arrivée). Le mode « Alternance » d'un
  appareil ignore toujours les codes.
- Un second badge dans les 2 minutes est ignoré (double badge).
- **Idempotence** : même PIN + même horodatage = ignoré (les appareils renvoient).
- **Bornes** : refusé à plus de 2 jours dans le futur ou plus de 60 jours dans le passé.
- **Heure** : celle de l'appareil, lue dans le fuseau de l'organisation.
- **PIN sans fiche** : gardé dans « Badgeages non rattachés » ; rattaché, il est compté rétroactivement.

## Sécurité — limites

L'appareil ne sait ni s'authentifier ni porter un secret : son **numéro de série**, enregistré par
le client, est le seul contrôle. Quiconque le connaît peut envoyer des badgeages en son nom.
Garde-fous : numéro inconnu, appareil désactivé ou client suspendu → `503`, rien n'est enregistré
et l'appareil garde ses badgeages ; débit limité par numéro et par adresse ; corps plafonné à
2 Mo ; chaque salarié relit et valide sa semaine.

## HTTPS

Le service n'est joignable qu'en HTTPS. Les appareils récents le gèrent (« Cloud Server Setting » :
nom de domaine, port 443, HTTPS activé). Un micrologiciel qui ne parle que HTTP ne pourra pas se
connecter directement : il faut alors un relais sur le réseau du client (par exemple Caddy, qui
transmet `/iclock/*` en HTTPS), ou l'import du fichier CSV de l'appareil. **À vérifier sur le
modèle retenu avant de le proposer aux clients.**

## Données personnelles

La CNIL exclut la biométrie (empreinte, visage) pour le contrôle des horaires. Les appareils
doivent être utilisés en mode **badge ou code** ; Kipointe ne reçoit de toute façon que le numéro
du salarié et l'heure, jamais de gabarit biométrique.
