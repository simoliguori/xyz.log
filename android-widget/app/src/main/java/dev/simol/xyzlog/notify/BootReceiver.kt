package dev.simol.xyzlog.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Riprogramma i promemoria dopo il riavvio del telefono. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            NotificationScheduler.scheduleNext(context)
        }
    }
}
