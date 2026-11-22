# Tablette de pointage

Une tablette Android posée à l'entrée affiche en permanence l'écran de pointage de Kipointe
(`/tablette`). C'est une page web : rien à installer de la part de Kipointe, et la mise à jour est
immédiate. La liaison avec une pointeuse NGTeco / ZKTeco reste disponible en parallèle
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

1. Page **Tablettes** → *Ajouter une tablette* : un code d'activation s'affiche (24 h, usage unique).
2. Sur la tablette : ouvrir `https://<adresse du service>/tablette`, saisir le code.
3. Verrouiller la tablette sur cette page avec une application de borne (« kiosk »), par exemple
   Fully Kiosk Browser : masquage du reste d'Android, écran toujours allumé, réouverture de la page
   au démarrage. La page demande elle-même à l'écran de rester allumé, mais Android peut le refuser
   (batterie faible) : l'application de borne est la garantie.
4. Tablette branchée sur secteur, fixée.

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
