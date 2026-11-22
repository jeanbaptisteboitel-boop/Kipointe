import SwiftUI
import WebKit

/// État partagé entre l'écran et la page web.
final class EtatPage: ObservableObject {
    @Published var horsLigne = false
    @Published var scanOuvert = false
    @Published var message: String?
    weak var vue: WKWebView?

    func ouvrir(_ adresse: URL) {
        horsLigne = false
        vue?.load(URLRequest(url: adresse))
    }

    func recharger() {
        ouvrir(vue?.url ?? Service.accueil)
    }
}

/// La page de l'espace salarié, dans une vue web qui garde la session entre deux lancements.
struct PageWeb: UIViewRepresentable {
    @ObservedObject var etat: EtatPage

    func makeCoordinator() -> Coordinateur { Coordinateur(etat: etat) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // La page reconnaît l'application à ce suffixe et propose alors le lecteur de QR code.
        config.applicationNameForUserAgent = "KipointeApp/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1") (iOS)"
        config.userContentController.add(context.coordinator, name: "kipointe")
        let vue = WKWebView(frame: .zero, configuration: config)
        vue.navigationDelegate = context.coordinator
        vue.uiDelegate = context.coordinator
        vue.allowsBackForwardNavigationGestures = true
        vue.scrollView.contentInsetAdjustmentBehavior = .automatic
        let tirer = UIRefreshControl()
        tirer.addTarget(context.coordinator, action: #selector(Coordinateur.rafraichir(_:)), for: .valueChanged)
        vue.scrollView.refreshControl = tirer
        etat.vue = vue
        vue.load(URLRequest(url: Service.accueil))
        return vue
    }

    func updateUIView(_ vue: WKWebView, context: Context) {}

    final class Coordinateur: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let etat: EtatPage
        init(etat: EtatPage) { self.etat = etat }

        @objc func rafraichir(_ controle: UIRefreshControl) {
            etat.vue?.reload()
            controle.endRefreshing()
        }

        // La page demande le lecteur de QR code : window.webkit.messageHandlers.kipointe.postMessage("scanner")
        func userContentController(_ controleur: WKUserContentController, didReceive message: WKScriptMessage) {
            if (message.body as? String) == "scanner" { etat.scanOuvert = true }
        }

        func webView(_ vue: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let adresse = action.request.url else { return decisionHandler(.cancel) }
            if adresse.scheme == "https" && adresse.host == Service.hote {
                return decisionHandler(.allow)
            }
            // Cadres internes (about:blank…) : laissés à la page.
            if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
            // Tout le reste (justificatif à télécharger, lien extérieur) s'ouvre hors de l'application.
            if adresse.scheme == "https" || adresse.scheme == "mailto" || adresse.scheme == "tel" {
                UIApplication.shared.open(adresse)
            }
            decisionHandler(.cancel)
        }

        // Lien ouvert dans un nouvel onglet : chargé dans la même vue (la règle ci-dessus s'applique).
        func webView(_ vue: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if action.targetFrame == nil { vue.load(action.request) }
            return nil
        }

        func webView(_ vue: WKWebView, didFinish navigation: WKNavigation!) {
            etat.horsLigne = false
        }

        func webView(_ vue: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let code = (error as NSError).code
            // Navigation annulée par nous (lien extérieur) ou remplacée par une autre : pas une panne.
            if code == NSURLErrorCancelled || code == 102 { return }
            etat.horsLigne = true
        }

        // Les boîtes « alert » et « confirm » de la page : sans cela, une confirmation répond toujours non.
        func webView(_ vue: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            presenter(message, actions: [UIAlertAction(title: "OK", style: .default) { _ in completionHandler() }], repli: completionHandler)
        }

        func webView(_ vue: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            presenter(
                message,
                actions: [
                    UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) },
                    UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) },
                ],
                repli: { completionHandler(false) }
            )
        }

        private func presenter(_ message: String, actions: [UIAlertAction], repli: @escaping () -> Void) {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            var hote = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
            while let dessus = hote?.presentedViewController { hote = dessus }
            guard let hote = hote else { return repli() }
            let boite = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            actions.forEach(boite.addAction)
            hote.present(boite, animated: true)
        }
    }
}
