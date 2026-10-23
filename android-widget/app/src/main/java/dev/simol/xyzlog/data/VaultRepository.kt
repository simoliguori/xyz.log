package dev.simol.xyzlog.data

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import java.time.LocalDate

/**
 * Legge e scrive i tre file markdown del tracker dentro il vault Obsidian
 * sul telefono, tramite Storage Access Framework. Scritture minime (una riga)
 * per ridurre i conflitti con Obsidian Sync.
 */
class VaultRepository(private val context: Context) {

    private val prefs = Prefs(context)

    fun isConfigured(): Boolean = prefs.treeUri != null

    private fun dataFolder(): DocumentFile? {
        val uri = prefs.treeUri ?: return null
        var dir = DocumentFile.fromTreeUri(context, Uri.parse(uri)) ?: return null
        for (seg in prefs.folder.split('/').filter { it.isNotBlank() }) {
            dir = dir.findFile(seg)?.takeIf { it.isDirectory } ?: return null
        }
        return dir
    }

    private fun readFile(name: String): String? {
        val file = dataFolder()?.findFile(name) ?: return null
        return context.contentResolver.openInputStream(file.uri)
            ?.use { it.readBytes().toString(Charsets.UTF_8) }
    }

    private fun writeFile(name: String, content: String) {
        val file = dataFolder()?.findFile(name) ?: return
        // "wt" tronca il file: senza, un contenuto più corto lascerebbe coda sporca
        context.contentResolver.openOutputStream(file.uri, "wt")
            ?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
    }

    fun readData(): TrackerData {
        val habitsContent = readFile(HABITS_FILE) ?: ""
        return TrackerData(
            habits = MarkdownParser.parseHabits(habitsContent),
            categories = MarkdownParser.parseCategories(habitsContent),
            log = MarkdownParser.parseLog(readFile(LOG_FILE) ?: ""),
            todos = MarkdownParser.parseTodos(readFile(TODO_FILE) ?: ""),
        )
    }

    /* ---------------- abitudini ---------------- */

    fun toggleHabit(habitId: String, date: LocalDate) {
        val content = readFile(LOG_FILE) ?: return
        writeFile(LOG_FILE, MarkdownParser.toggleLog(content, date, habitId))
    }

    fun incrementHabit(habitId: String, date: LocalDate) {
        val content = readFile(LOG_FILE) ?: return
        writeFile(LOG_FILE, MarkdownParser.incrementLog(content, date, habitId))
    }

    fun decrementHabit(habitId: String, date: LocalDate) {
        val content = readFile(LOG_FILE) ?: return
        writeFile(LOG_FILE, MarkdownParser.decrementLog(content, date, habitId))
    }

    fun clearHabit(habitId: String, date: LocalDate) {
        val content = readFile(LOG_FILE) ?: return
        writeFile(LOG_FILE, MarkdownParser.clearLog(content, date, habitId))
    }

    /**
     * Tap sul widget per un'abitudine a contatore: countable → +1; a goal → +1
     * fino al goal, poi azzera (così si può correggere anche dal widget).
     */
    fun tapHabit(habitId: String, date: LocalDate) {
        val habit = readData().habits.find { it.id == habitId } ?: run {
            toggleHabit(habitId, date); return
        }
        val counts = MarkdownParser.parseLog(readFile(LOG_FILE) ?: "")[habitId] ?: emptyMap()
        val countToday = counts[date] ?: 0
        when {
            habit.countable -> incrementHabit(habitId, date)
            countToday >= habit.goal -> clearHabit(habitId, date)
            else -> incrementHabit(habitId, date)
        }
    }

    fun addHabit(name: String) {
        val content = readFile(HABITS_FILE) ?: return
        val existing = MarkdownParser.parseHabits(content).map { it.id }.toSet()
        val base = MarkdownParser.slugifyHabitId(name)
        var id = base
        var n = 2
        while (id in existing) id = "$base-${n++}"
        writeFile(HABITS_FILE, MarkdownParser.addHabitToFrontmatter(content, id, name))
    }

    fun deleteHabit(id: String) {
        val content = readFile(HABITS_FILE) ?: return
        writeFile(HABITS_FILE, MarkdownParser.removeHabitFromFrontmatter(content, id))
    }

    fun setHabitFields(id: String, fields: Map<String, String>) {
        val content = readFile(HABITS_FILE) ?: return
        writeFile(HABITS_FILE, MarkdownParser.setHabitFieldsInFrontmatter(content, id, fields))
    }

    fun setHabitReminders(id: String, times: List<String>) {
        val value = if (times.isEmpty()) "" else MarkdownParser.serializeTimeList(times)
        setHabitFields(id, mapOf("reminders" to value))
    }

    /* ---------------- attività ---------------- */

    fun toggleTodo(raw: String) {
        val content = readFile(TODO_FILE) ?: return
        writeFile(TODO_FILE, MarkdownParser.replaceLine(content, raw) {
            MarkdownParser.toggleTodoLine(it, LocalDate.now())
        })
    }

    fun deleteTodo(raw: String) {
        val content = readFile(TODO_FILE) ?: return
        writeFile(TODO_FILE, MarkdownParser.replaceLine(content, raw) { null })
    }

    fun addTodo(text: String, priority: TaskPriority, due: LocalDate?, time: String? = null) {
        val content = readFile(TODO_FILE) ?: return
        writeFile(TODO_FILE, MarkdownParser.appendLine(content, MarkdownParser.serializeTodo(text, priority, due, time)))
    }

    companion object {
        const val HABITS_FILE = "Habits.md"
        const val LOG_FILE = "Habit Log.md"
        const val TODO_FILE = "Todo.md"
    }
}
