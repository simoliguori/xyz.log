package dev.simol.xyzlog.data

import java.time.LocalDate

/** Specchio Kotlin di packages/core/src/types.ts. Mantieni allineato. */
data class Habit(
    val id: String,
    val name: String,
    val emoji: String = "",
    val icon: String = "",
    /** how often the habit counts towards the streak (1 = every day) */
    val cadence: Int = 1,
    val start: String = "",
    val duration: Int = 0,
    /** free count (several times a day, no "done" state) */
    val countable: Boolean = false,
    /** completions per day needed for the day to count as "done" */
    val goal: Int = 1,
    /** "HH:mm" daily reminder times */
    val reminders: List<String> = emptyList(),
)

data class Category(
    val icon: String,
    val name: String,
)

/** The ordinal is the importance order (0 = highest), aligned with the core. */
enum class TaskPriority(val emoji: String, val label: String) {
    HIGHEST("🔺", "massima"),
    HIGH("⏫", "alta"),
    MEDIUM("🔼", "media"),
    NONE("", "normale"),
    LOW("🔽", "bassa"),
    LOWEST("⏬", "minima"),
}

data class Todo(
    /** full original line, used to identify the task on toggle */
    val raw: String,
    val done: Boolean,
    val text: String,
    val due: LocalDate?,
    /** event time "HH:mm" (⏰) */
    val time: String?,
    val doneDate: LocalDate?,
    val priority: TaskPriority,
    val list: String? = null,
    val section: String? = null,
    val description: String? = null,
    /** vault path (no `.md`) of the note the task was exported from (heading `## [[Note]]`) */
    val source: String? = null,
)

/** Open tasks exported from one note (mirror of core::SourceGroup). */
data class SourceGroup(
    val source: String,
    val title: String,
    val todos: List<Todo>,
)

/** habitId -> (date -> number of completions that day) */
typealias HabitLog = Map<String, Map<LocalDate, Int>>

data class TrackerData(
    val habits: List<Habit>,
    val categories: List<Category>,
    val log: HabitLog,
    val todos: List<Todo>,
)

/** Reminder to schedule as a notification (mirror of core::Reminder). */
data class Reminder(
    val kind: String, // "habit" | "todo"
    val id: String,
    val title: String,
    val time: String, // "HH:mm"
    val date: LocalDate? = null,
)
