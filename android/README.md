# Application Android — tablette de pointage Kipointe

Petite application Kotlin qui affiche la page `/tablette` du service en plein écran et verrouille
la tablette dessus : écran toujours allumé, relance au démarrage, aucun lien sortant, sortie par
code. Tout le pointage reste dans la page web : une évolution de Kipointe ne demande pas de
réinstaller l'application.

## Obtenir l'APK

Le dépôt le construit : onglet **Actions → Application tablette**, dernier passage, fichier
`kipointe-tablette` à télécharger. En local : JDK 17, SDK Android 35, Gradle 8.9 ou plus, puis
`gradle -p android assembleDebug` (ou `assembleRelease` avec la clé de signature).

**Signature.** Android n'accepte une mise à jour que si elle est signée avec la même clé que la
version installée. Créez la clé une fois (`keytool -genkeypair -v -keystore kipointe.jks -alias
kipointe -keyalg RSA -keysize 2048 -validity 10000`), gardez-la en lieu sûr, et renseignez dans
GitHub (Settings → Secrets → Actions) : `KIPOINTE_KEYSTORE_BASE64` (le fichier encodé en base64),
`KIPOINTE_KEYSTORE_PASSWORD`, `KIPOINTE_KEY_ALIAS`, `KIPOINTE_KEY_PASSWORD`. Sans ces secrets, seul
un APK de débogage est produit : il s'installe, mais ne se mettra pas à jour par-dessus.

## Installer sur une tablette

1. Copier l'APK sur la tablette (clé USB, téléchargement) et l'ouvrir ; autoriser l'installation
   depuis cette source.
2. Au premier lancement : saisir l'adresse du service et choisir un **code de sortie** (4 à 8
   chiffres), puis le code d'activation donné par Kipointe, page Tablettes.
3. Android propose d'épingler l'application : accepter. Choisir aussi Kipointe comme application
   d'accueil quand Android le demande (« Toujours »).

### Verrouillage complet (recommandé)

L'épingle d'Android se retire en maintenant Retour + Récents. Pour un verrouillage que seul le code
de sortie lève, déclarer l'application « propriétaire » de la tablette, une fois, depuis un
ordinateur — sur une tablette **sans compte Google** (sortie d'usine ou réinitialisée) :

```bash
adb install kipointe-tablette.apk
adb shell dpm set-device-owner com.omniup.pointage/.AdminReceiver
# facultatif : préréglage sans rien taper sur la tablette
adb shell am start -n com.omniup.pointage/.MainActivity --es adresse https://<domaine> --es code_sortie 123456
```

## Sortir de l'écran de pointage

Appui long (trois secondes) sur le logo en haut à gauche → code de sortie → réglages (adresse,
nouveau code) ou « Quitter l'application ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `MainActivity.kt` | page en plein écran, verrouillage, réglages, reprise après coupure réseau |
| `WebBridge.kt` | `window.KipointeNative` : bip, demande de sortie, rechargement |
| `BootReceiver.kt` | relance au démarrage de la tablette |
| `AdminReceiver.kt` | requis par `dpm set-device-owner` |
| `assets/offline.html` | page d'attente quand le service est injoignable |
