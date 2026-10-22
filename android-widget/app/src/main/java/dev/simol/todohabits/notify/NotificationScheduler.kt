package dev.simol.todohabits.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import dev.simol.todohabits.data.MarkdownParser
import dev.simol.todohabits.data.Prefs
import dev.simol.todohabits.data.Reminder
import dev.simol.todohabits.data.VaultRepository
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Programma un singolo allarme esatto per il prossimo promemoria in scadenza.
 * Quando scatta, ReminderReceiver mostra le notifiche dovute e ri-programma il
 * successivo. Così bastano pochi allarmi e lo stato resta coerente anche dopo
 * un riavvio o una sincronizzazione del vault.
 */
object NotificationScheduler {
    private const val REQ = 7010

    fun scheduleNext(context: Context) {
        val prefs = Prefs(context)
        if (!prefs.notificationsEnabled) {
            cancel(context)
            return
        }
        val repo = VaultRepository(context)
        if (!repo.isConfigured()) return
        val data = runCatching { repo.readData() }.getOrNull() ?: return
        val reminders = MarkdownParser.collectReminders(data)
        val now = LocalDateTime.now()
        val next = reminders.mapNotNull { nextTrigger(it, now) }.minOrNull() ?: return

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val millis = next.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val pi = pendingIntent(context)
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi)
        } catch (_: SecurityException) {
            am.set(AlarmManager.RTC_WAKEUP, millis, pi)
        }
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pendingIntent(context))
    }

    private fun nextTrigger(r: Reminder, now: LocalDateTime): LocalDateTime? {
        val parts = r.time.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: return null
        val m = parts.getOrNull(1)?.toIntOrNull() ?: return null
        return if (r.kind == "todo") {
            val date = r.date ?: return null
            val dt = date.atTime(h, m)
            if (dt.isAfter(now)) dt else null
        } else {
            val todayAt = now.toLocalDate().atTime(h, m)
            if (todayAt.isAfter(now)) todayAt else todayAt.plusDays(1)
        }
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).setAction(ACTION_FIRE)
        return PendingIntent.getBroadcast(
            context,
            REQ,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    const val ACTION_FIRE = "dev.simol.todohabits.REMINDER_FIRE"
}
