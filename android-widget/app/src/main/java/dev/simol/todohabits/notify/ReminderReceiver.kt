package dev.simol.todohabits.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dev.simol.todohabits.data.MarkdownParser
import dev.simol.todohabits.data.Prefs
import dev.simol.todohabits.data.VaultRepository
import java.time.LocalDateTime

/** Scatta all'orario programmato: mostra i promemoria dovuti e riprogramma. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Prefs(context).notificationsEnabled) {
            val data = runCatching { VaultRepository(context).readData() }.getOrNull()
            if (data != null) {
                val now = LocalDateTime.now()
                val hm = "%02d:%02d".format(now.hour, now.minute)
                val today = now.toLocalDate()
                for (r in MarkdownParser.collectReminders(data)) {
                    val match = if (r.kind == "todo") r.date == today && r.time == hm else r.time == hm
                    if (match) {
                        val id = (r.kind + r.id + r.time).hashCode()
                        val body = if (r.kind == "todo") "Evento · ${r.time}" else "Promemoria · ${r.time}"
                        Notifications.show(context, id, r.title, body)
                    }
                }
            }
        }
        // riprogramma il prossimo
        NotificationScheduler.scheduleNext(context)
    }
}
