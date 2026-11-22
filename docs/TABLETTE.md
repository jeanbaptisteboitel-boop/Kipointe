# Tablette de pointage

Une tablette Android posée à l'entrée affiche en permanence l'écran de pointage de Kipointe
(`/tablette`), dans l'application Android Kipointe. Le pointage lui-même est une page web : ses
évolutions ne demandent pas de réinstaller l'application. La liaison avec une pointeuse NGTeco / ZKTeco reste disponible en parallèle
([POINTEUSE.md](POINTEUSE.md)).

## Deux façons de pointer

Réglées par l'entreprise, page **Tablettes** ; les deux peuvent être ouvertes ensemble.

| Mode | Déroulé | Ce qu'il faut au salarié |
|---|---|---|
| Code personnel | il tape son code (4 chiffres) sur la tablette | un code, donné par l'administrateur |
| QR code | il vise avec son téléphone le QR code de la tablette ; la page qui s'ouvre enregistre le pointage | un espace salarié, auquel son téléphone est connecté |

Le sens alterne : premier pointage du jour = arrivée, le suivant = départ, et ainsi de suite. Deux
pointages à moins de deux minutes d'écart : le second est ignoré.

## Mise en service

1. Installer l'**application Android Kipointe** sur la tablette ([android/README.md](../android/README.md)) :
   elle affiche la page en plein écran, garde l'écran allumé, se relance au démarrage et verrouille
   la tablette (sortie par code).
2. Page **Tablettes** → *Ajouter une tablette* : un code d'activation s'affiche (24 h, usage unique).
3. Au premier lancement : adresse du service, code de sortie, puis code d'activation.
4. Tablette branchée sur secteur, fixée.

Sans l'application, la page `https://<adresse du service>/tablette` fonctionne aussi dans un
navigateur, mais rien ne verrouille alors la tablette.

## Garde-fous

- **Code** : seule une empreinte est gardée en base ; l'administrateur ne peut pas relire un code,
  seulement en donner un nouveau. Cinq codes faux de suite bloquent le clavier une minute.
- **QR code** : signé par un secret propre à la tablette, il change toutes les 30 secondes et vaut
  90 secondes au plus. Une photo envoyée à un collègue absent ne sert donc à rien. Le pointage est
  fait au nom du compte connecté sur le téléphone ; la tablette d'une autre entreprise est refusée.
- **Tablette** : elle ne détient qu'un jeton (cookie), révocable depuis la page Tablettes (*Relier de
  nouveau*, *Désactiver*, *Retirer*). Volée, elle ne donne accès à aucune donnée.
- **Heure** : c'est celle du serveur, pas celle de la tablette.

## Limites connues

- **Pas de pointage hors connexion.** Sans réseau, la tablette l'affiche et suspend le clavier ; les
  heures se saisissent ensuite depuis la fiche du salarié.
- **Un code peut être prêté.** Comme un badge. Le QR code est plus sûr sur ce point (il engage le
  téléphone et le compte du salarié).
- **Pas de SMS** pour l'instant : il demande un prestataire d'envoi, payant à chaque message.
- La tablette interroge le service toutes les dix secondes ; sans nouvelles depuis 26 h, la tâche
  quotidienne prévient l'administrateur (« Tablette silencieuse »).
