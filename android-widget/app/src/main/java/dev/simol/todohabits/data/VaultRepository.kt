package dev.simol.todohabits.data

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import java.time.LocalDate

/**
 * Legge e scrive i tre file markdown del tracker dentro il vault Obsidian
 * sul telefono, tramite Storage Access Framework.
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
        // "wt" tronca il file: senza, un contenuto più corto lascerebbe code sporche
        context.contentResolver.openOutputStream(file.uri, "wt")
            ?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
    }

    fun readData(): TrackerData = TrackerData(
        habits = MarkdownParser.parseHabits(readFile(HABITS_FILE) ?: ""),
        log = MarkdownParser.parseLog(readFile(LOG_FILE) ?: ""),
        todos = MarkdownParser.parseTodos(readFile(TODO_FILE) ?: ""),
    )

    fun toggleHabit(habitId: String, date: LocalDate) {
        val content = readFile(LOG_FILE) ?: return
        writeFile(LOG_FILE, MarkdownParser.toggleLog(content, date, habitId))
    }

    fun toggleTodo(raw: String) {
        val content = readFile(TODO_FILE) ?: return
        writeFile(TODO_FILE, MarkdownParser.replaceLine(content, raw) {
            MarkdownParser.toggleTodoLine(it, LocalDate.now())
        })
    }

    fun addTodo(text: String, priority: TaskPriority, due: LocalDate?) {
        val content = readFile(TODO_FILE) ?: return
        writeFile(TODO_FILE, MarkdownParser.appendLine(content, MarkdownParser.serializeTodo(text, priority, due)))
    }

    companion object {
        const val HABITS_FILE = "Habits.md"
        const val LOG_FILE = "Habit Log.md"
        const val TODO_FILE = "Todo.md"
    }
}
