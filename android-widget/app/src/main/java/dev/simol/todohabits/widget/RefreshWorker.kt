package dev.simol.todohabits.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.glance.appwidget.updateAll
import java.util.concurrent.TimeUnit

/**
 * Rinfresca periodicamente i widget così che le modifiche arrivate
 * via Obsidian Sync compaiano anche senza aprire l'app.
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        HabitWidget().updateAll(applicationContext)
        TodoWidget().updateAll(applicationContext)
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "todo-habits-refresh",
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
