package com.omniup.pointage

import android.Manifest
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Kipointe — application de la tablette de pointage.
 *
 * Elle n'affiche qu'une chose : la page « /tablette » du service, en plein écran, écran toujours
 * allumé, relancée au démarrage de la tablette. Tout le pointage se passe dans cette page ;
 * l'application apporte ce qu'un navigateur ne sait pas faire : verrouiller la tablette.
 *
 * Deux niveaux de verrouillage :
 *  - tablette « propriétaire » (commande adb, voir android/README.md) : verrouillage complet,
 *    sans confirmation, impossible à quitter sans le code de sortie ;
 *  - sinon : épinglage d'écran d'Android, à confirmer une fois sur la tablette.
 *
 * Sortie : appui long sur le logo de la page, puis code de sortie choisi à l'installation.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var prefs: SharedPreferences
    private val relance = Handler(Looper.getMainLooper())
    private var enPanne = false
    private var demandeCamera: PermissionRequest? = null

    private fun adresse(): String? = prefs.getString("adresse", null)
    private fun pageTablette(): String = "${adresse()}/tablette"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("kipointe", Context.MODE_PRIVATE)
        // Préréglage possible par adb : --es adresse https://… --es code_sortie 123456
        intent?.getStringExtra("adresse")?.let { a -> nettoyerAdresse(a)?.let { prefs.edit().putString("adresse", it).apply() } }
        intent?.getStringExtra("code_sortie")?.let { c -> if (codeValide(c)) prefs.edit().putString("code_sortie", c).apply() }

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        masquerBarres()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Le bouton Retour ne mène nulle part.
            }
        })

        configurerWebView()
        if (adresse() == null || prefs.getString("code_sortie", null) == null) demanderReglages(premiere = true) else demarrer()
    }

    private fun masquerBarres() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun demarrer() {
        verrouiller()
        charger()
    }

    private fun charger() {
        enPanne = false
        webView.loadUrl(pageTablette())
    }

    /** Verrouille la tablette sur l'application. */
    private fun verrouiller() {
        val dpm = getSystemService(DevicePolicyManager::class.java)
        if (dpm.isDeviceOwnerApp(packageName)) {
            val admin = ComponentName(this, AdminReceiver::class.java)
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            // Appareil photo accordé sans dialogue : aucune question à l'écran d'une tablette verrouillée.
            dpm.setPermissionGrantState(admin, packageName, Manifest.permission.CAMERA, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
            // L'application devient l'écran d'accueil : elle revient même si le système la ferme.
            dpm.addPersistentPreferredActivity(
                admin,
                IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addCategory(Intent.CATEGORY_DEFAULT)
                },
                ComponentName(this, MainActivity::class.java),
            )
        }
        try {
            // Tablette propriétaire : immédiat. Sinon Android demande de confirmer l'épinglage.
            startLockTask()
        } catch (_: Exception) {
        }
    }

    private fun configurerWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // aperçu de l'appareil photo sans toucher l'écran
            cacheMode = WebSettings.LOAD_DEFAULT
            allowContentAccess = false
            textZoom = 100 // la taille de police du système ne doit pas déformer l'écran
            setSupportZoom(false)
            builtInZoomControls = false
            userAgentString = "$userAgentString KipointeTablette/${BuildConfig.VERSION_NAME}"
        }
        // Le jeton de la tablette est un cookie : il doit survivre aux redémarrages.
        CookieManager.getInstance().setAcceptCookie(true)
        webView.addJavascriptInterface(WebBridge(this), "KipointeNative")
        // La page demande l'appareil photo quand l'entreprise veut une photo au pointage.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(demande: PermissionRequest) {
                val hote = adresse()?.let { Uri.parse(it).host }
                val video = demande.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                if (!video || demande.origin.host != hote) {
                    demande.deny()
                } else if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    demande.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    demandeCamera = demande
                    requestPermissions(arrayOf(Manifest.permission.CAMERA), 1)
                }
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // On ne quitte jamais le service : aucun lien extérieur ne s'ouvre.
                val hote = adresse()?.let { Uri.parse(it).host }
                return request.url.scheme != "https" || request.url.host != hote
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                // Service injoignable (Wi-Fi coupé au démarrage) : page d'attente, puis nouvel essai.
                enPanne = true
                view.loadUrl("file:///android_asset/offline.html")
                relance.removeCallbacksAndMessages(null)
                relance.postDelayed({ if (enPanne) charger() }, 15_000)
            }

            override fun onPageFinished(view: WebView, url: String) {
                CookieManager.getInstance().flush()
            }
        }
    }

    private fun codeValide(c: String) = Regex("^\\d{4,8}$").matches(c)

    private fun nettoyerAdresse(brut: String): String? {
        var a = brut.trim().trimEnd('/')
        if (a.endsWith("/tablette")) a = a.removeSuffix("/tablette")
        if (!a.contains("://")) a = "https://$a"
        val u = Uri.parse(a)
        return if (u.scheme == "https" && !u.host.isNullOrBlank()) "https://${u.authority}" else null
    }

    /** Réglages de l'application : adresse du service et code de sortie. */
    private fun demanderReglages(premiere: Boolean, erreur: String? = null) {
        val marge = (20 * resources.displayMetrics.density).toInt()
        val champAdresse = EditText(this).apply {
            hint = "Adresse du service"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(adresse() ?: BuildConfig.ADRESSE_DEFAUT)
        }
        val champCode = EditText(this).apply {
            hint = if (premiere) "Code de sortie (4 à 8 chiffres)" else "Nouveau code de sortie (vide : inchangé)"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        val contenu = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(marge, marge / 2, marge, 0)
            addView(champAdresse)
            addView(champCode)
        }
        val dialogue = AlertDialog.Builder(this)
            .setTitle("Réglages de la tablette")
            .setMessage(erreur ?: "L'adresse est celle de Kipointe. Le code de sortie sert à quitter l'écran de pointage : gardez-le pour vous.")
            .setView(contenu)
            .setCancelable(false)
            .setPositiveButton("Enregistrer") { _, _ ->
                val a = nettoyerAdresse(champAdresse.text.toString())
                val c = champCode.text.toString()
                val codeAttendu = premiere || c.isNotEmpty()
                when {
                    a == null -> demanderReglages(premiere, "Adresse invalide : elle doit commencer par https://")
                    codeAttendu && !codeValide(c) -> demanderReglages(premiere, "Code de sortie : 4 à 8 chiffres.")
                    else -> {
                        prefs.edit().putString("adresse", a).apply()
                        if (c.isNotEmpty()) prefs.edit().putString("code_sortie", c).apply()
                        demarrer()
                    }
                }
            }
        if (!premiere) dialogue.setNeutralButton("Quitter l'application") { _, _ -> quitter() }
        dialogue.show()
    }

    /** Appelé par la page (appui long sur le logo) : demande le code, puis ouvre les réglages. */
    fun demanderSortie() {
        runOnUiThread {
            val champ = EditText(this).apply {
                hint = "Code de sortie"
                inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            }
            AlertDialog.Builder(this)
                .setTitle("Quitter l'écran de pointage")
                .setView(champ)
                .setNegativeButton("Annuler") { _, _ -> masquerBarres() }
                .setPositiveButton("Valider") { _, _ ->
                    if (champ.text.toString() == prefs.getString("code_sortie", null)) {
                        try {
                            stopLockTask()
                        } catch (_: Exception) {
                        }
                        demanderReglages(premiere = false)
                    } else {
                        masquerBarres()
                    }
                }
                .show()
        }
    }

    private fun quitter() {
        val dpm = getSystemService(DevicePolicyManager::class.java)
        if (dpm.isDeviceOwnerApp(packageName)) {
            // Rend la touche Accueil au lanceur d'Android, sinon elle ramènerait ici.
            dpm.clearPackagePersistentPreferredActivities(ComponentName(this, AdminReceiver::class.java), packageName)
        }
        finishAndRemoveTask()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 1) return
        val demande = demandeCamera ?: return
        demandeCamera = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) demande.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else demande.deny()
    }

    fun recharger() {
        runOnUiThread { charger() }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) masquerBarres()
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        relance.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
