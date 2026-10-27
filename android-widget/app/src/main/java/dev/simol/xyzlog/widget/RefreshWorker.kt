package dev.simol.xyzlog.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.glance.appwidget.updateAll
import dev.simol.xyzlog.notify.NotificationScheduler
import java.util.concurrent.TimeUnit

/**
 * Periodically refreshes the widgets so that changes arriving
 * via Obsidian Sync show up without opening the app.
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        HabitWidget().updateAll(applicationContext)
        TodoWidget().updateAll(applicationContext)
        NotificationScheduler.scheduleNext(applicationContext)
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "xyzlog-refresh",
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
