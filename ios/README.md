# Application iPhone — Kipointe (salarié)

Application Swift qui ouvre l'espace salarié du service et lui ajoute un lecteur de QR code pour
pointer sur la tablette. Le contenu reste côté service : une évolution de Kipointe ne demande pas
de republier l'application.

| Fichier | Rôle |
|---|---|
| `project.yml` | description du projet Xcode (XcodeGen) : identifiant, version, adresse du service |
| `Sources/KipointeApp.swift` | écran principal, page hors connexion, contrôle du QR code lu |
| `Sources/PageWeb.swift` | vue web : session conservée, liens extérieurs ouverts dans Safari, boîtes de confirmation |
| `Sources/LecteurQr.swift` | lecteur de QR code (appareil photo) |

## Avant la première publication

- **Identifiant** : `com.omniup.kipointe` (`PRODUCT_BUNDLE_IDENTIFIER` dans `project.yml`). Il est
  définitif une fois l'application créée dans App Store Connect : changez-le maintenant si besoin.
- **Adresse du service** : `KIPOINTE_HOTE` dans `project.yml` (nom d'hôte, sans `https://`).

## Construire et publier (sur un Mac)

```bash
brew install xcodegen
cd ios && xcodegen generate && open Kipointe.xcodeproj
```

Dans Xcode : cible **Kipointe → Signing & Capabilities**, choisir votre équipe (compte développeur
Apple). Puis **Product → Archive**, **Distribute App → App Store Connect**. La version arrive dans
TestFlight, d'où elle se soumet à la validation d'Apple.

À chaque nouvelle version : augmenter `CURRENT_PROJECT_VERSION` (et `MARKETING_VERSION` si la
version visible change), puis régénérer le projet.

## Ce que la validation d'Apple regarde

Apple refuse les applications qui ne font qu'afficher un site (règle 4.2). Celle-ci apporte une
fonction propre, le lecteur de QR code de pointage. Dans les notes pour le validateur, fournir un
compte salarié de démonstration et expliquer que le pointage se fait en visant la tablette de
l'entreprise (joindre une capture de l'écran de la tablette, que le validateur peut scanner).

Le dépôt compile l'application à chaque modification (workflow « Application iPhone »), pour le
simulateur et sans signature : cela vérifie le code, pas la publication.
