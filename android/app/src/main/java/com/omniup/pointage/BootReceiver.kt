package com.omniup.pointage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Relance le kiosque au démarrage de la tablette (et après mise à jour de l'APK). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val lancement = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(lancement)
        }
    }
}
