# Tablette de pointage

Une tablette Android posée à l'entrée affiche en permanence l'écran de pointage de Kipointe
(`/tablette`), dans l'application Android Kipointe. Le pointage lui-même est une page web : ses
évolutions ne demandent pas de réinstaller l'application. La liaison avec une pointeuse NGTeco / ZKTeco reste disponible en parallèle
([POINTEUSE.md](POINTEUSE.md)).

## Deux façons de pointer

Réglées par l'entreprise, page **Tablettes** ; plusieurs peuvent être ouvertes ensemble.

| Mode | Déroulé | Ce qu'il faut au salarié |
|---|---|---|
| Code personnel | il tape son code (4 chiffres) sur la tablette | un code, donné par l'administrateur |
| QR code | il vise avec son téléphone le QR code de la tablette ; la page qui s'ouvre enregistre le pointage | un espace salarié, auquel son téléphone est connecté |
| Code par SMS (option) | il touche son nom sur la tablette, reçoit un code à 6 chiffres et le tape | un mobile renseigné sur sa fiche |

Le sens alterne : premier pointage du jour = arrivée, le suivant = départ, et ainsi de suite. Deux
pointages à moins de deux minutes d'écart : le second est ignoré.

## Ce que le salarié voit en pointant

- **Par code, sur la tablette** : la confirmation, ses rendez-vous des trente prochains jours
  (médecine du travail, entretien… saisis par l'administrateur sur sa fiche) et le nombre de
  notifications qui l'attendent. Un bouton « Mes heures et mes congés » montre son solde de congés
  payés, son compteur d'heures et ses sept derniers jours (prévu, pointé, détail). L'écran se
  referme seul.
- **Par QR code, sur son téléphone** : la confirmation, ses rendez-vous et un lien vers ses
  notifications. La tablette n'affiche alors que la confirmation.

## Sur le téléphone du salarié

L'espace salarié s'installe sur l'écran d'accueil et s'ouvre comme une application, sur iPhone
(Safari → Partager → « Sur l'écran d'accueil ») comme sur Android (bouton « Installer »). Ce n'est
pas une application des magasins Apple ou Google : rien à télécharger depuis un store.

## Mise en service

1. Installer l'**application Android Kipointe** sur la tablette ([android/README.md](../android/README.md)) :
   elle affiche la page en plein écran, garde l'écran allumé, se relance au démarrage et verrouille
   la tablette (sortie par code).
2. Page **Tablettes** → *Ajouter une tablette* : un code d'activation s'affiche (24 h, usage unique).
3. Au premier lancement : adresse du service, code de sortie, puis code d'activation.
4. Tablette branchée sur secteur, fixée.

Sans l'application, la page `https://<adresse du service>/tablette` fonctionne aussi dans un
navigateur, mais rien ne verrouille alors la tablette.

## Pointage par SMS (option facturée)

- **Ouverture** : l'éditeur ouvre l'option pour un client (espace éditeur, colonne SMS), puis
  l'entreprise coche le mode, page Tablettes. Fermer l'option coupe le mode aussitôt.
- **Envoi** : par l'API SMS d'OVHcloud (variables `OVH_SMS_*`, voir `.env.example`).
- **Facturation** : l'espace éditeur affiche, par client, le nombre de SMS partis ce mois-ci et le
  mois dernier. Un SMS qu'OVH a refusé n'est pas compté.
- **Limites** : le code vaut cinq minutes, une fois, sur la tablette qui l'a demandé. Un salarié
  ne peut en demander qu'un par minute et dix par jour ; une tablette, trente par heure.
- **Affichage des noms** : la tablette liste « Prénom N. » pour les salariés qui ont un mobile.
  Le numéro n'est jamais affiché en entier.

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
- La tablette interroge le service toutes les dix secondes ; sans nouvelles depuis 26 h, la tâche
  quotidienne prévient l'administrateur (« Tablette silencieuse »).
