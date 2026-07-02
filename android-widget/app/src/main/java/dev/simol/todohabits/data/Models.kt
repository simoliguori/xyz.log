package dev.simol.todohabits.data

import java.time.LocalDate

data class Habit(
    val id: String,
    val name: String,
    val emoji: String,
)

/** L'ordinal è l'ordine di importanza (0 = massima), allineato al plugin Obsidian. */
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
    val doneDate: LocalDate?,
    val priority: TaskPriority,
)

data class TrackerData(
    val habits: List<Habit>,
    val log: Map<String, Set<LocalDate>>,
    val todos: List<Todo>,
)
