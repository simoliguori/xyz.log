package dev.simol.xyzlog.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dev.simol.xyzlog.data.MarkdownParser
import dev.simol.xyzlog.data.Prefs
import dev.simol.xyzlog.data.VaultRepository
import java.time.LocalDateTime

/** Fires at the scheduled time: shows the due reminders and reschedules. */
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
                        val body = if (r.kind == "todo") "Event · ${r.time}" else "Reminder · ${r.time}"
                        Notifications.show(context, id, r.title, body)
                    }
                }
            }
        }
        // reschedule the next one
        NotificationScheduler.scheduleNext(context)
    }
}
