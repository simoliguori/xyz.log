package dev.simol.todohabits.data

import java.time.LocalDate

/**
 * Specchio Kotlin di obsidian-plugin/src/parser.ts.
 * Se cambi la logica qui, allineala anche lì e in docs/DATA_FORMAT.md.
 */
object MarkdownParser {

    private val TODO_LINE = Regex("""^(\s*)- \[([ xX])]\s+(.*)$""")
    private val LOG_LINE = Regex("""^-\s*\[[xX]]\s+(\d{4}-\d{2}-\d{2})\s+([a-z0-9-]+)\s*$""")
    private val DUE = Regex("""📅\s*(\d{4}-\d{2}-\d{2})""")
    private val DONE = Regex("""✅\s*(\d{4}-\d{2}-\d{2})""")
    private val FRONTMATTER = Regex("""^---\r?\n([\s\S]*?)\r?\n---""")
    private val YAML_ITEM = Regex("""^\s*-\s+(\w+):\s*(.*)$""")
    private val YAML_FIELD = Regex("""^\s+(\w+):\s*(.*)$""")

    private fun unquote(s: String): String {
        val t = s.trim()
        return if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
            t.substring(1, t.length - 1)
        } else t
    }

    private fun parseDate(s: String?): LocalDate? =
        s?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    fun parseHabits(content: String): List<Habit> {
        val fm = FRONTMATTER.find(content)?.groupValues?.get(1) ?: return emptyList()
        val habits = mutableListOf<Habit>()
        var cur: MutableMap<String, String>? = null
        var inHabits = false

        fun push() {
            cur?.let { c ->
                c["id"]?.let { id ->
                    habits.add(Habit(id, c["name"] ?: id, c["emoji"] ?: ""))
                }
            }
            cur = null
        }

        for (line in fm.split(Regex("\r?\n"))) {
            if (Regex("""^habits:\s*$""").matches(line)) {
                inHabits = true
                continue
            }
            if (!inHabits) continue
            if (line.isNotEmpty() && !line[0].isWhitespace()) {
                push()
                inHabits = false
                continue
            }
            val item = YAML_ITEM.find(line)
            val field = YAML_FIELD.find(line)
            if (item != null) {
                push()
                cur = mutableMapOf(item.groupValues[1] to unquote(item.groupValues[2]))
            } else if (field != null && cur != null) {
                cur!![field.groupValues[1]] = unquote(field.groupValues[2])
            }
        }
        push()
        return habits
    }

    fun parseLog(content: String): Map<String, Set<LocalDate>> {
        val log = mutableMapOf<String, MutableSet<LocalDate>>()
        for (line in content.split(Regex("\r?\n"))) {
            val m = LOG_LINE.find(line) ?: continue
            val date = parseDate(m.groupValues[1]) ?: continue
            log.getOrPut(m.groupValues[2]) { mutableSetOf() }.add(date)
        }
        return log
    }

    fun logLine(date: LocalDate, habitId: String): String = "- [x] $date $habitId"

    fun toggleLog(content: String, date: LocalDate, habitId: String): String {
        val target = logLine(date, habitId)
        val lines = content.split(Regex("\r?\n")).toMutableList()
        val idx = lines.indexOfFirst { it.trim() == target }
        if (idx >= 0) {
            lines.removeAt(idx)
        } else {
            var last = lines.indexOfLast { it.isNotBlank() }
            lines.add(last + 1, target)
        }
        return lines.joinToString("\n")
    }

    fun parseTodoLine(line: String): Todo? {
        val m = TODO_LINE.find(line) ?: return null
        val done = m.groupValues[2].lowercase() == "x"
        val rest = m.groupValues[3]

        val due = parseDate(DUE.find(rest)?.groupValues?.get(1))
        val doneDate = parseDate(DONE.find(rest)?.groupValues?.get(1))

        val priority = TaskPriority.entries
            .firstOrNull { it.emoji.isNotEmpty() && rest.contains(it.emoji) }
            ?: TaskPriority.NONE

        var text = rest.replace(DUE, "").replace(DONE, "")
        for (p in TaskPriority.entries) {
            if (p.emoji.isNotEmpty()) text = text.replace(p.emoji, "")
        }
        text = text.replace(Regex("""\s{2,}"""), " ").trim()

        return Todo(line, done, text, due, doneDate, priority)
    }

    fun parseTodos(content: String): List<Todo> =
        content.split(Regex("\r?\n")).mapNotNull { parseTodoLine(it) }

    fun serializeTodo(text: String, priority: TaskPriority, due: LocalDate?): String {
        var line = "- [ ] ${text.trim()}"
        if (priority != TaskPriority.NONE) line += " ${priority.emoji}"
        if (due != null) line += " 📅 $due"
        return line
    }

    fun toggleTodoLine(line: String, today: LocalDate): String {
        val m = TODO_LINE.find(line) ?: return line
        val indent = m.groupValues[1]
        val done = m.groupValues[2].lowercase() == "x"
        val rest = m.groupValues[3]
        return if (done) {
            "$indent- [ ] ${rest.replace(DONE, "").replace(Regex("""\s{2,}"""), " ").trim()}"
        } else {
            "$indent- [x] ${rest.trim()} ✅ $today"
        }
    }

    fun replaceLine(content: String, raw: String, fn: (String) -> String?): String {
        val lines = content.split(Regex("\r?\n")).toMutableList()
        val idx = lines.indexOfFirst { it == raw }
        if (idx < 0) return content
        val replaced = fn(lines[idx])
        if (replaced == null) lines.removeAt(idx) else lines[idx] = replaced
        return lines.joinToString("\n")
    }

    fun appendLine(content: String, line: String): String {
        val lines = content.split(Regex("\r?\n")).toMutableList()
        val last = lines.indexOfLast { it.isNotBlank() }
        lines.add(last + 1, line)
        return lines.joinToString("\n")
    }

    /** Giorni consecutivi: conta a ritroso da oggi (o da ieri se oggi non è ancora fatto). */
    fun streak(dates: Set<LocalDate>, today: LocalDate): Int {
        var cursor = if (today in dates) today else today.minusDays(1)
        var count = 0
        while (cursor in dates) {
            count++
            cursor = cursor.minusDays(1)
        }
        return count
    }
}
