package com.omniup.pointage

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.webkit.JavascriptInterface

/**
 * Pont exposé à la PWA sous `window.OmniupNative` (annexe §12.6).
 * Le wrapper ne fournit que ce que le navigateur ne sait pas faire : identité stable de l'appareil,
 * état réseau réel, retour sonore/haptique, sortie du mode kiosque.
 */
class WebBridge(private val ctx: Context, private val activite: MainActivity) {

    private val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)

    @JavascriptInterface
    fun getTerminalId(): String =
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: "inconnu"

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun getUrlPwa(): String = activite.urlPwa()

    @JavascriptInterface
    fun isOnline(): Boolean {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    /** Deux sons nettement différents : en cuisine ou en salle, on écoute plus qu'on ne regarde. */
    @JavascriptInterface
    fun beep(ok: Boolean) {
        if (ok) {
            tone.startTone(ToneGenerator.TONE_PROP_ACK, 150)
        } else {
            tone.startTone(ToneGenerator.TONE_SUP_ERROR, 400)
        }
    }

    @JavascriptInterface
    fun vibrate(ms: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    /** Sortie volontaire du kiosque : appui long 5 s sur le logo côté PWA, puis code administrateur à 6 chiffres. */
    @JavascriptInterface
    fun exitKiosk(code: String): Boolean = activite.quitterKiosque(code)
}
