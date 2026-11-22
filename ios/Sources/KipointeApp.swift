import SwiftUI

/// Kipointe — application du salarié.
///
/// Elle ouvre l'espace salarié du service (heures, congés, justificatifs, notifications) et lui
/// ajoute un lecteur de QR code : le salarié vise la tablette de pointage sans quitter
/// l'application, donc sans avoir à se reconnecter dans Safari.
@main
struct KipointeApp: App {
    var body: some Scene {
        WindowGroup {
            EcranPrincipal()
        }
    }
}

enum Service {
    /// Nom d'hôte du service, fixé à la construction (KIPOINTE_HOTE dans project.yml).
    static let hote: String = (Bundle.main.object(forInfoDictionaryKey: "KipointeHote") as? String) ?? "kipointe.vercel.app"
    static var accueil: URL { URL(string: "https://\(hote)/")! }

    /// Seul un QR code de pointage de ce service est suivi : jamais une adresse quelconque.
    static func adresseDePointage(_ lu: String) -> URL? {
        guard let u = URL(string: lu), u.scheme == "https", u.host == hote, u.path == "/pointer" else { return nil }
        return u
    }
}

struct EcranPrincipal: View {
    @StateObject private var etat = EtatPage()

    var body: some View {
        ZStack {
            Color(red: 0.96, green: 0.97, blue: 0.98).ignoresSafeArea()
            PageWeb(etat: etat)
                .ignoresSafeArea(.container, edges: .bottom)
            if etat.horsLigne {
                VStack(spacing: 14) {
                    Text("Pas de connexion").font(.title2.bold())
                    Text("Kipointe n'est pas joignable. Vérifiez votre réseau, puis réessayez.")
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                    Button("Réessayer") { etat.recharger() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(28)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 0.96, green: 0.97, blue: 0.98))
            }
        }
        .sheet(isPresented: $etat.scanOuvert) {
            LecteurQr { lu in
                etat.scanOuvert = false
                if let adresse = Service.adresseDePointage(lu) {
                    etat.ouvrir(adresse)
                } else {
                    etat.message = "Ce QR code n'est pas celui d'une tablette Kipointe."
                }
            }
        }
        .alert("Kipointe", isPresented: Binding(get: { etat.message != nil }, set: { if !$0 { etat.message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(etat.message ?? "")
        }
    }
}
