import AVFoundation
import SwiftUI

/// Lecteur de QR code plein écran : rend le texte du premier QR code vu.
struct LecteurQr: View {
    let surLecture: (String) -> Void
    @Environment(\.dismiss) private var fermer
    @State private var refuse = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()
            if refuse {
                VStack(spacing: 12) {
                    Text("Appareil photo non autorisé").font(.title3.bold())
                    Text("Autorisez l'appareil photo pour Kipointe dans Réglages, puis recommencez.")
                        .multilineTextAlignment(.center)
                    Button("Ouvrir les réglages") {
                        if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                    }
                    .buttonStyle(.borderedProminent)
                }
                .foregroundColor(.white)
                .padding(28)
                .frame(maxHeight: .infinity)
            } else {
                Camera(surLecture: surLecture, surRefus: { refuse = true }).ignoresSafeArea()
                Text("Visez le QR code de la tablette")
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Color.black.opacity(0.55))
                    .clipShape(Capsule())
                    .padding(.bottom, 84)
            }
            Button("Annuler") { fermer() }
                .buttonStyle(.bordered)
                .tint(.white)
                .padding(.bottom, 24)
        }
    }
}

private struct Camera: UIViewControllerRepresentable {
    let surLecture: (String) -> Void
    let surRefus: () -> Void

    func makeUIViewController(context: Context) -> ControleurCamera {
        let c = ControleurCamera()
        c.surLecture = surLecture
        c.surRefus = surRefus
        return c
    }

    func updateUIViewController(_ controleur: ControleurCamera, context: Context) {}
}

final class ControleurCamera: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var surLecture: ((String) -> Void)?
    var surRefus: (() -> Void)?
    private let session = AVCaptureSession()
    private var apercu: AVCaptureVideoPreviewLayer?
    private var lu = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            demarrer()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] accorde in
                DispatchQueue.main.async {
                    if accorde { self?.demarrer() } else { self?.surRefus?() }
                }
            }
        default:
            surRefus?()
        }
    }

    private func demarrer() {
        guard let appareil = AVCaptureDevice.default(for: .video), let entree = try? AVCaptureDeviceInput(device: appareil), session.canAddInput(entree) else {
            surRefus?()
            return
        }
        session.addInput(entree)
        let sortie = AVCaptureMetadataOutput()
        guard session.canAddOutput(sortie) else {
            surRefus?()
            return
        }
        session.addOutput(sortie)
        sortie.setMetadataObjectsDelegate(self, queue: .main)
        sortie.metadataObjectTypes = [.qr]
        let couche = AVCaptureVideoPreviewLayer(session: session)
        couche.videoGravity = .resizeAspectFill
        couche.frame = view.bounds
        view.layer.addSublayer(couche)
        apercu = couche
        DispatchQueue.global(qos: .userInitiated).async { [session] in session.startRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        apercu?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning { session.stopRunning() }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objets: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !lu, let code = objets.first as? AVMetadataMachineReadableCodeObject, let texte = code.stringValue else { return }
        lu = true
        session.stopRunning()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        surLecture?(texte)
    }
}
