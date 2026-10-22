package dev.simol.todohabits.data

import java.time.LocalDate

/** Specchio Kotlin di packages/core/src/types.ts. Mantieni allineato. */
data class Habit(
    val id: String,
    val name: String,
    val emoji: String = "",
    val icon: String = "",
    /** ogni quanti giorni l'abitudine conta per lo streak (1 = ogni giorno) */
    val cadence: Int = 1,
    val start: String = "",
    val duration: Int = 0,
    /** conteggio libero (più volte al giorno, senza "fatto") */
    val countable: Boolean = false,
    /** completamenti al giorno necessari perché il giorno sia "fatto" */
    val goal: Int = 1,
    /** orari "HH:mm" dei promemoria giornalieri */
    val reminders: List<String> = emptyList(),
)

data class Category(
    val icon: String,
    val name: String,
)

/** L'ordinal è l'ordine di importanza (0 = massima), allineato al core. */
enum class TaskPriority(val emoji: String, val label: String) {
    HIGHEST("🔺", "massima"),
    HIGH("⏫", "alta"),
    MEDIUM("🔼", "media"),
    NONE("", "normale"),
    LOW("🔽", "bassa"),
    LOWEST("⏬", "minima"),
}

data class Todo(
    /** riga originale completa, usata per identificare la task al toggle */
    val raw: String,
    val done: Boolean,
    val text: String,
    val due: LocalDate?,
    /** orario "HH:mm" dell'evento (⏰) */
    val time: String?,
    val doneDate: LocalDate?,
    val priority: TaskPriority,
    val list: String? = null,
    val section: String? = null,
    val description: String? = null,
)

/** habitId -> (data -> numero di completamenti in quel giorno) */
typealias HabitLog = Map<String, Map<LocalDate, Int>>

data class TrackerData(
    val habits: List<Habit>,
    val categories: List<Category>,
    val log: HabitLog,
    val todos: List<Todo>,
)

/** Promemoria da programmare come notifica (specchio di core::Reminder). */
data class Reminder(
    val kind: String, // "habit" | "todo"
    val id: String,
    val title: String,
    val time: String, // "HH:mm"
    val date: LocalDate? = null,
)
