package com.omniup.pointage

import android.media.AudioManager
import android.media.ToneGenerator
import android.webkit.JavascriptInterface

/** Pont exposé à la page de pointage sous `window.KipointeNative`. */
class WebBridge(private val activite: MainActivity) {

    private val tone: ToneGenerator? = try {
        ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
    } catch (_: Exception) {
        null
    }

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    /** Deux sons distincts : dans un atelier ou une cuisine, on écoute plus qu'on ne regarde. */
    @JavascriptInterface
    fun bip(ok: Boolean) {
        if (ok) tone?.startTone(ToneGenerator.TONE_PROP_ACK, 150) else tone?.startTone(ToneGenerator.TONE_SUP_ERROR, 400)
    }

    /** Appui long sur le logo : l'application demande le code de sortie. */
    @JavascriptInterface
    fun demanderSortie() = activite.demanderSortie()

    @JavascriptInterface
    fun recharger() = activite.recharger()
}
