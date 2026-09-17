package com.omniup.pointage

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

/**
 * Kiosque natif OMNIUP : WebView plein écran + Lock Task Mode + scan QR ML Kit (annexe §12).
 * Toute la logique métier reste dans la PWA Next.js ; ce wrapper ne fait que ce que le
 * navigateur ne sait pas faire.
 *
 * Provisionnement (tablette réinitialisée, sans compte Google) :
 *   adb install pointage-omniup.apk
 *   adb shell dpm set-device-owner com.omniup.pointage/.AdminReceiver
 *   adb shell am start -n com.omniup.pointage/.MainActivity --es url https://<domaine>/kiosque --es code_admin 123456
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var scanner: ScannerService? = null
    private lateinit var prefs: android.content.SharedPreferences

    fun urlPwa(): String = prefs.getString("url", BuildConfig.URL_PWA) ?: BuildConfig.URL_PWA

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("kiosque", Context.MODE_PRIVATE)
        intent?.getStringExtra("url")?.let { prefs.edit().putString("url", it).apply() }
        intent?.getStringExtra("code_admin")?.let { prefs.edit().putString("code_admin", it).apply() }

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)

        // Écran maintenu allumé, barres système masquées en immersif permanent.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, webView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        configurerLockTask()
        configurerWebView()
        demarrerScanner()

        webView.loadUrl(urlPwa())
    }

    /** Lock Task Mode : boutons Accueil et Récents neutralisés, sortie impossible sans le code. */
    private fun configurerLockTask() {
        val dpm = getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(this, AdminReceiver::class.java)
        if (dpm.isDeviceOwnerApp(packageName)) {
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            // La caméra est accordée sans dialogue (device owner) : aucune interaction au démarrage.
            dpm.setPermissionGrantState(
                admin, packageName, Manifest.permission.CAMERA,
                DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
            )
            // L'app devient l'écran d'accueil : relance automatique même si le système la ferme.
            dpm.addPersistentPreferredActivity(
                admin,
                android.content.IntentFilter(android.content.Intent.ACTION_MAIN).apply {
                    addCategory(android.content.Intent.CATEGORY_HOME)
                    addCategory(android.content.Intent.CATEGORY_DEFAULT)
                },
                ComponentName(this, MainActivity::class.java)
            )
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            startLockTask()
        }
    }

    private fun configurerWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // indispensable : IndexedDB pour la file hors ligne
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100                    // le réglage système ne doit pas casser la mise en page
            setSupportZoom(false)
            builtInZoomControls = false
            userAgentString = "$userAgentString KipointeKiosque/${BuildConfig.VERSION_NAME}"
        }
        webView.addJavascriptInterface(WebBridge(this, this), "OmniupNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // On reste sur l'origine de la PWA : aucune navigation externe possible.
                val origine = android.net.Uri.parse(urlPwa())
                return request.url.host != origine.host
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                // Page de secours uniquement si la PWA n'a jamais pu être chargée (Service Worker absent).
                if (request.isForMainFrame && !prefs.getBoolean("pwa_chargee", false)) {
                    view.loadUrl("file:///android_asset/offline.html")
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (url.startsWith("http")) prefs.edit().putBoolean("pwa_chargee", true).apply()
            }
        }
        // La page de secours locale est autorisée à charger ses propres ressources.
        webView.settings.allowFileAccess = true
    }

    private fun demarrerScanner() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), 1)
            return
        }
        scanner = ScannerService(this) { brut ->
            // Poussé vers la PWA sous forme d'événement `omniup:badge` (annexe §12.5).
            runOnUiThread {
                val uuid = JSONObject.quote(brut)
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('omniup:badge',{detail:{uuid:$uuid}}))", null
                )
            }
        }.also { it.demarrer(this) }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) demarrerScanner()
    }

    /** Appelé par la PWA (appui long 5 s + code à 6 chiffres) : stoppe le Lock Task et rend la main. */
    fun quitterKiosque(code: String): Boolean {
        val attendu = prefs.getString("code_admin", BuildConfig.CODE_ADMIN_DEFAUT)
        if (code.length != 6 || code != attendu) return false
        runOnUiThread {
            try {
                stopLockTask()
            } catch (_: Exception) {
            }
            finishAndRemoveTask()
        }
        return true
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) webView.systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    override fun onBackPressed() {
        // Aucun menu, aucune sortie possible : le bouton Retour est neutralisé.
    }

    override fun onDestroy() {
        scanner?.arreter()
        super.onDestroy()
    }
}
