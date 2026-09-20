# Wrapper Android Kotlin — kiosque natif OMNIUP

Application minimale (≈ 350 lignes de Kotlin) qui encapsule la PWA `/kiosque` de Kipointe :
Lock Task Mode, relance au démarrage, écran maintenu allumé, scan QR par CameraX + ML Kit,
pont JavaScript `window.OmniupNative`. Toute la logique métier reste côté Next.js.

> Ce dossier n'est pas compilé par le dépôt web (il n'y a pas de SDK Android dans la CI Vercel).
> Ouvrez-le dans Android Studio (Ladybug ou plus récent, JDK 17) ou lancez `./gradlew assembleRelease`
> après avoir installé le SDK Android 35.

## Fichiers

| Fichier | Rôle |
|---|---|
| `MainActivity.kt` | WebView plein écran, Lock Task, immersif, chargement de la PWA |
| `AdminReceiver.kt` | `DeviceAdminReceiver` vide, requis par le provisionnement |
| `BootReceiver.kt` | Relance sur `BOOT_COMPLETED` et après mise à jour |
| `ScannerService.kt` | CameraX `ImageAnalysis` + ML Kit (QR uniquement), anti-rebond 3 s |
| `WebBridge.kt` | `@JavascriptInterface` : `getTerminalId`, `getAppVersion`, `isOnline`, `beep`, `vibrate`, `exitKiosk` |
| `assets/offline.html` | Page de secours si la PWA est injoignable au tout premier lancement |

## Provisionnement device owner (au cabinet, jamais chez le client)

Prérequis : tablette sortie d'usine ou réinitialisée, **sans aucun compte Google**.

```bash
adb install pointage-omniup.apk
adb shell dpm set-device-owner com.omniup.pointage/.AdminReceiver
# URL de la PWA et code administrateur à 6 chiffres (sortie du kiosque)
adb shell am start -n com.omniup.pointage/.MainActivity --es url "https://<domaine>/kiosque" --es code_admin 123456
```

Puis, sur la tablette : saisir le code d'appairage généré dans l'espace gérant (Terminaux → Générer un code),
laisser la PWA se charger complètement une première fois (amorçage du Service Worker), tester un scan,
couper le wifi, scanner hors ligne, rétablir le wifi et vérifier la resynchronisation.

## Sortie du kiosque

Appui long 5 secondes sur le nom de l'établissement (bandeau du haut) → « Quitter le kiosque » → code
administrateur à 6 chiffres → `stopLockTask()`.

## Mises à jour

- **PWA** : automatique au rechargement (95 % des évolutions, aucun déplacement).
- **APK** : rare. La version attendue est publiée par `GET /api/terminal/version` (`KIOSQUE_APK_VERSION`) ;
  installation par sideload ou silencieuse via `PackageInstaller` (device owner).
