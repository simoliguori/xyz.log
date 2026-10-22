package dev.simol.todohabits.data

import java.time.LocalDate

/**
 * Specchio Kotlin di packages/core/src/parser.ts (+ parti di viewmodel.ts).
 * Se cambi la logica qui, allineala al core TypeScript e a docs/DATA_FORMAT.md.
 */
object MarkdownParser {

    private val TODO_LINE = Regex("""^(\s*)- \[([ xX])]\s+(.*)$""")
    private val LOG_LINE = Regex("""^-\s*\[[xX]]\s+(\d{4}-\d{2}-\d{2})\s+([a-z0-9-]+)\s*$""")
    private val DUE = Regex("""📅\s*(\d{4}-\d{2}-\d{2})""")
    private val DONE = Regex("""✅\s*(\d{4}-\d{2}-\d{2})""")
    private val TIME = Regex("""⏰\s*(\d{1,2}:\d{2})""")
    private val PRIO_CHARS = Regex("""[🔺⏫🔼🔽⏬]""")
    private val FRONTMATTER = Regex("""^---\r?\n([\s\S]*?)\r?\n---""")
    private val YAML_ITEM = Regex("""^\s*-\s+(\w+):\s*(.*)$""")
    private val YAML_FIELD = Regex("""^\s+(\w+):\s*(.*)$""")
    private val H2 = Regex("""^##\s+(.+?)\s*$""")
    private val H3 = Regex("""^###\s+(.+?)\s*$""")

    private fun unquote(s: String): String {
        val t = s.trim()
        return if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
            t.substring(1, t.length - 1)
        } else t
    }

    private fun parseDate(s: String?): LocalDate? =
        s?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    fun normalizeTime(s: String): String? {
        val m = Regex("""^(\d{1,2}):(\d{1,2})$""").find(s.trim()) ?: return null
        val h = minOf(23, m.groupValues[1].toInt())
        val mi = minOf(59, m.groupValues[2].toInt())
        return "%02d:%02d".format(h, mi)
    }

    fun parseTimeList(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        val inner = raw.trim().removePrefix("[").removeSuffix("]")
        return inner.split(",").mapNotNull { normalizeTime(unquote(it)) }
    }

    fun serializeTimeList(times: List<String>): String =
        "[" + times.joinToString(", ") { "\"$it\"" } + "]"

    /* ---------------- parsing ---------------- */

    fun parseHabits(content: String): List<Habit> {
        val fm = FRONTMATTER.find(content)?.groupValues?.get(1) ?: return emptyList()
        val habits = mutableListOf<Habit>()
        var cur: MutableMap<String, String>? = null
        var inHabits = false

        fun push() {
            cur?.let { c ->
                c["id"]?.let { id ->
                    habits.add(
                        Habit(
                            id = id,
                            name = c["name"] ?: id,
                            emoji = c["emoji"] ?: "",
                            icon = c["icon"] ?: "",
                            cadence = maxOf(1, c["cadence"]?.toIntOrNull() ?: 1),
                            start = c["start"] ?: "",
                            duration = maxOf(0, c["duration"]?.toIntOrNull() ?: 0),
                            countable = c["countable"] == "true",
                            goal = maxOf(1, c["goal"]?.toIntOrNull() ?: 1),
                            reminders = parseTimeList(c["reminders"]),
                        )
                    )
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
                val key = field.groupValues[1]
                // reminders è un array inline: non togliere le virgolette qui
                cur!![key] = if (key == "reminders") field.groupValues[2] else unquote(field.groupValues[2])
            }
        }
        push()
        return habits
    }

    fun parseCategories(content: String): List<Category> {
        val fm = FRONTMATTER.find(content)?.groupValues?.get(1) ?: return emptyList()
        val cats = mutableListOf<Category>()
        var cur: MutableMap<String, String>? = null
        var inKey = false
        fun push() {
            cur?.let { c -> c["icon"]?.let { cats.add(Category(it, c["name"] ?: "")) } }
            cur = null
        }
        for (line in fm.split(Regex("\r?\n"))) {
            if (Regex("""^categories:\s*$""").matches(line)) {
                inKey = true
                continue
            }
            if (!inKey) continue
            if (line.isNotEmpty() && !line[0].isWhitespace()) {
                push(); inKey = false; continue
            }
            val item = YAML_ITEM.find(line)
            val field = YAML_FIELD.find(line)
            if (item != null) {
                push(); cur = mutableMapOf(item.groupValues[1] to unquote(item.groupValues[2]))
            } else if (field != null && cur != null) {
                cur!![field.groupValues[1]] = unquote(field.groupValues[2])
            }
        }
        push()
        return cats
    }

    fun parseLog(content: String): HabitLog {
        val log = mutableMapOf<String, MutableMap<LocalDate, Int>>()
        for (line in content.split(Regex("\r?\n"))) {
            val m = LOG_LINE.find(line) ?: continue
            val date = parseDate(m.groupValues[1]) ?: continue
            val byDate = log.getOrPut(m.groupValues[2]) { mutableMapOf() }
            byDate[date] = (byDate[date] ?: 0) + 1
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
            val last = lines.indexOfLast { it.isNotBlank() }
            lines.add(last + 1, target)
        }
        return lines.joinToString("\n")
    }

    fun incrementLog(content: String, date: LocalDate, habitId: String): String =
        appendLine(content, logLine(date, habitId))

    fun decrementLog(content: String, date: LocalDate, habitId: String): String {
        val lines = content.split(Regex("\r?\n")).toMutableList()
        val idx = lines.indexOfFirst { it.trim() == logLine(date, habitId) }
        if (idx >= 0) lines.removeAt(idx)
        return lines.joinToString("\n")
    }

    /** Rimuove tutti i completamenti di (data, abitudine) di quel giorno. */
    fun clearLog(content: String, date: LocalDate, habitId: String): String {
        val target = logLine(date, habitId)
        return content.split(Regex("\r?\n")).filter { it.trim() != target }.joinToString("\n")
    }

    fun parseTodoLine(line: String): Todo? {
        val m = TODO_LINE.find(line) ?: return null
        val done = m.groupValues[2].lowercase() == "x"
        val rest = m.groupValues[3]

        val due = parseDate(DUE.find(rest)?.groupValues?.get(1))
        val doneDate = parseDate(DONE.find(rest)?.groupValues?.get(1))
        val time = TIME.find(rest)?.groupValues?.get(1)?.let { normalizeTime(it) }

        val priority = TaskPriority.entries
            .firstOrNull { it.emoji.isNotEmpty() && rest.contains(it.emoji) }
            ?: TaskPriority.NONE

        var text = rest.replace(DUE, "").replace(DONE, "").replace(TIME, "")
        text = text.replace(PRIO_CHARS, "").replace(Regex("""\s{2,}"""), " ").trim()

        return Todo(line, done, text, due, time, doneDate, priority)
    }

    fun parseTodos(content: String): List<Todo> {
        val todos = mutableListOf<Todo>()
        val lines = content.split(Regex("\r?\n"))
        var list = ""
        var section = ""
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val h3 = H3.find(line)
            if (h3 != null) { section = h3.groupValues[1].trim(); i++; continue }
            val h2 = H2.find(line)
            if (h2 != null) { list = h2.groupValues[1].trim(); section = ""; i++; continue }
            val t = parseTodoLine(line)
            if (t == null) { i++; continue }
            // descrizione: righe indentate non-task subito sotto
            val desc = mutableListOf<String>()
            while (i + 1 < lines.size) {
                val next = lines[i + 1]
                if (next.isNotBlank() && next[0].isWhitespace() && !TODO_LINE.matches(next)) {
                    desc.add(next.trimStart()); i++
                } else break
            }
            todos.add(
                t.copy(
                    list = list.ifEmpty { null },
                    section = section.ifEmpty { null },
                    description = if (desc.isEmpty()) null else desc.joinToString("\n"),
                )
            )
            i++
        }
        return todos
    }

    fun serializeTodo(text: String, priority: TaskPriority, due: LocalDate?, time: String? = null): String {
        var line = "- [ ] ${text.trim()}"
        if (priority != TaskPriority.NONE) line += " ${priority.emoji}"
        if (due != null) line += " 📅 $due"
        if (time != null) line += " ⏰ $time"
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

    /* ---------------- streak / viewmodel ---------------- */

    fun countOn(counts: Map<LocalDate, Int>, date: LocalDate): Int = counts[date] ?: 0

    fun streak(counts: Map<LocalDate, Int>, today: LocalDate, goal: Int = 1, cadence: Int = 1): Int {
        fun dayDone(d: LocalDate) = countOn(counts, d) >= goal
        fun periodDone(end: LocalDate): Boolean {
            for (k in 0 until cadence) if (dayDone(end.minusDays(k.toLong()))) return true
            return false
        }
        var end = if (periodDone(today)) today else today.minusDays(cadence.toLong())
        var count = 0
        while (periodDone(end)) {
            count++
            end = end.minusDays(cadence.toLong())
        }
        return count
    }

    fun doneToday(habit: Habit, counts: Map<LocalDate, Int>, today: LocalDate): Boolean =
        !habit.countable && countOn(counts, today) >= habit.goal

    enum class TodoGroup { TODAY, NEXT7, LATER, OVERDUE, NODATE }

    /**
     * Task aperte raggruppate per scadenza. Gli eventi con data **futura** (e di
     * oggi) stanno **sopra** quelli **mancati/scaduti**; senza data in fondo.
     */
    fun groupTodos(todos: List<Todo>, today: LocalDate): List<Pair<TodoGroup, List<Todo>>> {
        val week = today.plusDays(7)
        val open = todos.filter { !it.done }
        fun datedSort(t: Todo) = (t.due?.toString() ?: "9999") + (t.time ?: "99:99") + t.priority.ordinal
        val buckets = linkedMapOf(
            TodoGroup.TODAY to open.filter { it.due == today },
            TodoGroup.NEXT7 to open.filter { it.due != null && it.due.isAfter(today) && !it.due.isAfter(week) },
            TodoGroup.LATER to open.filter { it.due != null && it.due.isAfter(week) },
            TodoGroup.OVERDUE to open.filter { it.due != null && it.due.isBefore(today) },
            TodoGroup.NODATE to open.filter { it.due == null },
        )
        return buckets.entries
            .filter { it.value.isNotEmpty() }
            .map { (g, list) ->
                g to if (g == TodoGroup.NODATE) list.sortedBy { it.priority.ordinal }
                else list.sortedBy { datedSort(it) }
            }
    }

    fun collectReminders(data: TrackerData): List<Reminder> {
        val out = mutableListOf<Reminder>()
        for (h in data.habits) for (t in h.reminders) {
            out.add(Reminder("habit", h.id, h.name, t))
        }
        for (t in data.todos) if (!t.done && t.due != null && t.time != null) {
            out.add(Reminder("todo", t.raw, t.text, t.time, t.due))
        }
        return out
    }

    /* ---------------- scrittura frontmatter ---------------- */

    fun slugifyHabitId(name: String): String {
        val s = java.text.Normalizer.normalize(name.lowercase(), java.text.Normalizer.Form.NFD)
            .replace(Regex("""\p{Mn}+"""), "")
            .replace(Regex("""[^a-z0-9]+"""), "-")
            .trim('-')
        return s.ifEmpty { "abitudine" }
    }

    private fun yamlValue(s: String): String =
        if (Regex("""[:#"']""").containsMatchIn(s)) "\"${s.replace("\"", "'")}\"" else s

    private fun habitsBlockEnd(lines: List<String>, idx: Int): Int {
        var end = idx + 1
        while (end < lines.size && (lines[end].isBlank() || lines[end][0].isWhitespace())) end++
        while (end > idx + 1 && lines[end - 1].isBlank()) end--
        return end
    }

    fun addHabitToFrontmatter(content: String, id: String, name: String, emoji: String = "", icon: String = ""): String {
        val item = buildList {
            add("  - id: $id")
            add("    name: ${yamlValue(name)}")
            if (emoji.isNotBlank()) add("    emoji: \"${emoji.replace("\"", "")}\"")
            if (icon.isNotBlank()) add("    icon: $icon")
        }
        val fm = FRONTMATTER.find(content)
            ?: return "---\nhabits:\n${item.joinToString("\n")}\n---\n$content"
        val lines = fm.groupValues[1].split(Regex("\r?\n")).toMutableList()
        val idx = lines.indexOfFirst { Regex("""^habits:\s*(\[\s*])?\s*$""").matches(it) }
        if (idx < 0) {
            lines.add("habits:"); lines.addAll(item)
        } else {
            lines[idx] = "habits:"
            lines.addAll(habitsBlockEnd(lines, idx), item)
        }
        return content.replace(fm.value, "---\n${lines.joinToString("\n")}\n---")
    }

    fun removeHabitFromFrontmatter(content: String, id: String): String =
        editHabitBlock(content, id) { _, _, _ -> null } // segnala rimozione

    fun setHabitFieldsInFrontmatter(content: String, id: String, fields: Map<String, String>): String {
        return editHabitBlock(content, id) { lines, start, stop ->
            val keys = fields.keys.filter { it != "id" }
            var removed = 0
            for (i in stop - 1 downTo start + 1) {
                val m = Regex("""^\s+(\w+):""").find(lines[i])
                if (m != null && !Regex("""^\s*-""").containsMatchIn(lines[i]) && keys.contains(m.groupValues[1])) {
                    lines.removeAt(i); removed++
                }
            }
            val insert = keys.mapNotNull { k ->
                val v = fields[k]
                if (v.isNullOrEmpty()) null
                else "    $k: " + if (v.startsWith("[")) v else yamlValue(v)
            }
            lines.addAll(stop - removed, insert)
            Unit
        }
    }

    /**
     * Trova il blocco dell'abitudine `id` e applica `op`. Se `op` ritorna null
     * (tramite la variante rimozione) elimina il blocco. Usa un sentinel interno.
     */
    private fun editHabitBlock(content: String, id: String, op: (MutableList<String>, Int, Int) -> Any?): String {
        val fm = FRONTMATTER.find(content) ?: return content
        val lines = fm.groupValues[1].split(Regex("\r?\n")).toMutableList()
        val idx = lines.indexOfFirst { Regex("""^habits:\s*$""").matches(it) }
        if (idx < 0) return content
        val end = habitsBlockEnd(lines, idx)
        val items = (idx + 1 until end).filter { Regex("""^\s*-\s+\w+:""").containsMatchIn(lines[it]) }
        for (k in items.indices) {
            val start = items[k]
            val stop = if (k + 1 < items.size) items[k + 1] else end
            val found = (start until stop).any {
                val m = Regex("""^\s*(?:-\s+)?id:\s*(.*)$""").find(lines[it])
                m != null && unquote(m.groupValues[1]) == id
            }
            if (!found) continue
            val result = op(lines, start, stop)
            if (result == null) {
                // rimozione del blocco
                for (i in stop - 1 downTo start) lines.removeAt(i)
            }
            return content.replace(fm.value, "---\n${lines.joinToString("\n")}\n---")
        }
        return content
    }
}
