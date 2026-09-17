package com.omniup.pointage

import android.annotation.SuppressLint
import android.content.Context
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/**
 * Scan QR natif : CameraX en analyse continue (1280×720 suffisent), ML Kit limité au format QR.
 * Le flux caméra n'est jamais enregistré ni transmis : chaque image est analysée puis fermée.
 * Anti-rebond : le même contenu relu dans les 3 secondes est ignoré (annexe §12.5).
 */
class ScannerService(private val ctx: Context, private val onBadge: (String) -> Unit) {

    private val executor = Executors.newSingleThreadExecutor()
    private val scanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    )
    private var dernierContenu: String? = null
    private var dernierInstant = 0L
    private var provider: ProcessCameraProvider? = null

    fun demarrer(owner: LifecycleOwner) {
        val futur = ProcessCameraProvider.getInstance(ctx)
        futur.addListener({
            val p = futur.get()
            provider = p
            val analyse = ImageAnalysis.Builder()
                .setTargetResolution(Size(1280, 720))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analyse.setAnalyzer(executor) { image -> analyser(image) }
            p.unbindAll()
            p.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, analyse)
        }, ContextCompat.getMainExecutor(ctx))
    }

    fun arreter() {
        provider?.unbindAll()
        executor.shutdown()
        scanner.close()
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun analyser(image: ImageProxy) {
        val media = image.image
        if (media == null) {
            image.close()
            return
        }
        val input = InputImage.fromMediaImage(media, image.imageInfo.rotationDegrees)
        scanner.process(input)
            .addOnSuccessListener { codes ->
                for (code in codes) {
                    val brut = code.rawValue ?: continue
                    if (!brut.startsWith("BADGE:")) continue
                    val maintenant = System.currentTimeMillis()
                    if (brut == dernierContenu && maintenant - dernierInstant < 3000) continue
                    dernierContenu = brut
                    dernierInstant = maintenant
                    onBadge(brut)
                }
            }
            .addOnCompleteListener { image.close() }
    }
}
