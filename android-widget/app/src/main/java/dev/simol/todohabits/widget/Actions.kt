package dev.simol.todohabits.widget

import android.content.Context
import android.content.Intent
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.updateAll
import dev.simol.todohabits.MainActivity
import dev.simol.todohabits.data.VaultRepository
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

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

/** Apre l'app sulla cronologia stile GitHub dell'abitudine toccata. */
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
