package dev.simol.xyzlog.widget

import android.content.Context
import android.content.Intent
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.updateAll
import dev.simol.xyzlog.MainActivity
import dev.simol.xyzlog.data.VaultRepository
import dev.simol.xyzlog.notify.NotificationScheduler
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Binary habits (goal 1, not countable): check on/off. */
class ToggleHabitAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val habitId = parameters[HABIT_ID] ?: return
        withContext(Dispatchers.IO) {
            runCatching { VaultRepository(context).toggleHabit(habitId, LocalDate.now()) }
        }
        HabitWidget().updateAll(context)
    }

    companion object {
        val HABIT_ID = ActionParameters.Key<String>("habitId")
    }
}

/** Counter habits (goal>1 or countable): +1, then reset once the goal is reached. */
class TapHabitAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val habitId = parameters[HABIT_ID] ?: return
        withContext(Dispatchers.IO) {
            runCatching { VaultRepository(context).tapHabit(habitId, LocalDate.now()) }
        }
        HabitWidget().updateAll(context)
    }

    companion object {
        val HABIT_ID = ActionParameters.Key<String>("tapHabitId")
    }
}

class ToggleTodoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val raw = parameters[TODO_RAW] ?: return
        withContext(Dispatchers.IO) {
            runCatching { VaultRepository(context).toggleTodo(raw) }
        }
        TodoWidget().updateAll(context)
    }

    companion object {
        val TODO_RAW = ActionParameters.Key<String>("todoRaw")
    }
}

/** Opens the app on the GitHub-style history of the tapped habit. */
class OpenHabitAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val habitId = parameters[HABIT_ID] ?: return
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(MainActivity.EXTRA_HABIT_ID, habitId)
        }
        context.startActivity(intent)
    }

    companion object {
        val HABIT_ID = ActionParameters.Key<String>("openHabitId")
    }
}

class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        HabitWidget().updateAll(context)
        TodoWidget().updateAll(context)
    }
}
