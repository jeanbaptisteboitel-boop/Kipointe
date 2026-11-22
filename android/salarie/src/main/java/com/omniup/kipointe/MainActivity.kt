package com.omniup.kipointe

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * Kipointe — application du salarié.
 *
 * Elle ouvre l'espace salarié du service (heures, congés, justificatifs, notifications) et lui
 * ajoute ce qu'une page web ne fait pas bien sur un téléphone : lire le QR code de la tablette de
 * pointage sans quitter l'application, donc sans avoir à se reconnecter dans un navigateur.
 *
 * Tout le contenu reste côté service : une évolution de Kipointe ne demande pas de republier
 * l'application.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var envoiFichier: ValueCallback<Array<Uri>>? = null
    private val hote: String? = Uri.parse(BuildConfig.ADRESSE).host

    /** Choix d'un fichier pour un justificatif (photo, PDF). */
    private val choixFichier = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        envoiFichier?.onReceiveValue(uris.toTypedArray())
        envoiFichier = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowContentAccess = false
            setSupportZoom(false)
            // La page reconnaît l'application à ce suffixe et propose alors le lecteur de QR code.
            userAgentString = "$userAgentString KipointeApp/${BuildConfig.VERSION_NAME} (Android)"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        webView.addJavascriptInterface(Pont(), "KipointeApp")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "https" && request.url.host == hote) return false
                // Tout le reste (justificatif à télécharger, lien extérieur) s'ouvre hors de l'application.
                ouvrirDehors(request.url)
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) view.loadUrl("file:///android_asset/offline.html")
            }

            override fun onPageFinished(view: WebView, url: String) {
                CookieManager.getInstance().flush()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, rappel: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                envoiFichier?.onReceiveValue(null)
                envoiFichier = rappel
                return try {
                    choixFichier.launch("*/*")
                    true
                } catch (_: ActivityNotFoundException) {
                    envoiFichier = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState) else webView.loadUrl(BuildConfig.ADRESSE)
    }

    private fun ouvrirDehors(adresse: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, adresse))
        } catch (_: ActivityNotFoundException) {
        }
    }

    /** Lit le QR code de la tablette et ouvre la page de pointage dans l'application. */
    private fun scanner() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { code ->
                val lu = code.rawValue?.let { Uri.parse(it) }
                // Seul un QR code de pointage de ce service est suivi : jamais une adresse quelconque.
                if (lu != null && lu.scheme == "https" && lu.host == hote && lu.path == "/pointer") {
                    webView.loadUrl(lu.toString())
                } else {
                    Toast.makeText(this, "Ce QR code n'est pas celui d'une tablette Kipointe.", Toast.LENGTH_LONG).show()
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Lecture du QR code impossible sur ce téléphone.", Toast.LENGTH_LONG).show()
            }
    }

    /** Exposé à la page sous `window.KipointeApp`. */
    inner class Pont {
        @JavascriptInterface
        fun scanner() = runOnUiThread { this@MainActivity.scanner() }

        @JavascriptInterface
        fun recharger() = runOnUiThread { webView.loadUrl(BuildConfig.ADRESSE) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        super.onPause()
    }
}
