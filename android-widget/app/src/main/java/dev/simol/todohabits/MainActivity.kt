package dev.simol.todohabits

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.appwidget.updateAll
import dev.simol.todohabits.data.Habit
import dev.simol.todohabits.data.MarkdownParser
import dev.simol.todohabits.data.Prefs
import dev.simol.todohabits.data.TaskPriority
import dev.simol.todohabits.data.Todo
import dev.simol.todohabits.data.TrackerData
import dev.simol.todohabits.data.VaultRepository
import dev.simol.todohabits.notify.NotificationScheduler
import dev.simol.todohabits.widget.Accent
import dev.simol.todohabits.widget.HabitWidget
import dev.simol.todohabits.widget.RefreshWorker
import dev.simol.todohabits.widget.TodoWidget
import dev.simol.todohabits.widget.Tokens
import dev.simol.todohabits.widget.accentFromHex
import dev.simol.todohabits.widget.headlineFontFamily
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val DarkColors = darkColorScheme(
    primary = Tokens.accentBright,
    onPrimary = Tokens.bg,
    secondary = Tokens.accent,
    background = Tokens.bg,
    onBackground = Tokens.text,
    surface = Tokens.bg2,
    onSurface = Tokens.text,
    outline = Tokens.border,
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        RefreshWorker.schedule(this)
        val initialHabitId = intent.getStringExtra(EXTRA_HABIT_ID)
        setContent {
            MaterialTheme(colorScheme = DarkColors) {
                Surface(modifier = Modifier.fillMaxSize(), color = Tokens.bg) {
                    MainScreen(initialHabitId)
                }
            }
        }
    }

    companion object {
        const val EXTRA_HABIT_ID = "habitId"
    }
}

@Composable
private fun MainScreen(initialHabitId: String?) {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    val scope = rememberCoroutineScope()

    var treeUri by remember { mutableStateOf(prefs.treeUri) }
    var data by remember { mutableStateOf<TrackerData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var showSettings by remember { mutableStateOf(treeUri == null) }
    var selectedHabitId by remember { mutableStateOf(initialHabitId) }
    var accentHex by remember { mutableStateOf(prefs.accentHex) }
    val accent = remember(accentHex) { accentFromHex(accentHex) }

    val serif = remember { headlineFontFamily(context) }

    val notifPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    fun reload() {
        scope.launch {
            val result = withContext(Dispatchers.IO) { runCatching { VaultRepository(context).readData() } }
            data = result.getOrNull()
            error = result.exceptionOrNull()?.message
            withContext(Dispatchers.IO) {
                HabitWidget().updateAll(context)
                TodoWidget().updateAll(context)
                NotificationScheduler.scheduleNext(context)
            }
        }
    }

    fun act(block: suspend VaultRepository.() -> Unit) {
        scope.launch {
            withContext(Dispatchers.IO) { runCatching { VaultRepository(context).block() } }
            reload()
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
            prefs.treeUri = uri.toString()
            treeUri = uri.toString()
            reload()
        }
    }

    LaunchedEffect(Unit) { if (treeUri != null) reload() }

    val pager = rememberPagerState(pageCount = { 2 })

    Column(modifier = Modifier.fillMaxSize()) {
        // header con data + tab
        val today = LocalDate.now()
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 16.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                headerDate(today),
                style = TextStyle(fontFamily = serif, fontSize = 22.sp, color = Tokens.text),
                modifier = Modifier.weight(1f),
            )
            Text(
                "⚙",
                style = TextStyle(fontSize = 20.sp, color = Tokens.muted),
                modifier = Modifier.clickable { showSettings = !showSettings }.padding(6.dp),
            )
        }

        TabsRow(pager.currentPage, accent, serif) { i -> scope.launch { pager.animateScrollToPage(i) } }

        if (showSettings) {
            SettingsSheet(
                prefs = prefs,
                accentHex = accentHex,
                onAccent = { accentHex = it; prefs.accentHex = it; reload() },
                onPick = { picker.launch(null) },
                onReload = { reload() },
                treeConfigured = treeUri != null,
                accent = accent,
            )
        }

        error?.let {
            Text("Errore: $it", color = Tokens.overdue, fontSize = 12.sp, modifier = Modifier.padding(20.dp, 4.dp))
        }

        val d = data
        if (d == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    if (treeUri == null) "Scegli la cartella del vault ⚙" else "Caricamento…",
                    color = Tokens.muted, fontFamily = FontFamily.Monospace,
                )
            }
        } else {
            HorizontalPager(state = pager, modifier = Modifier.weight(1f)) { page ->
                when (page) {
                    0 -> HabitsPage(d, today, accent, selectedHabitId, { selectedHabitId = it }, ::act)
                    else -> TasksPage(d, today, accent, ::act)
                }
            }
        }
    }
}

@Composable
private fun TabsRow(current: Int, accent: Accent, serif: FontFamily, onSelect: (Int) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("Abitudini", "Attività").forEachIndexed { i, label ->
            val active = i == current
            Text(
                label,
                style = TextStyle(fontFamily = serif, fontSize = 15.sp, color = if (active) Tokens.text else Tokens.muted),
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(i) }
                    .background(if (active) accent.base else Tokens.bg2, RoundedCornerShape(10.dp))
                    .padding(vertical = 9.dp),
            )
        }
    }
}

/* ---------------- pagina Abitudini ---------------- */

@Composable
private fun HabitsPage(
    data: TrackerData,
    today: LocalDate,
    accent: Accent,
    selectedHabitId: String?,
    onSelect: (String?) -> Unit,
    act: (suspend VaultRepository.() -> Unit) -> Unit,
) {
    var newHabit by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        AddRow(newHabit, { newHabit = it }, "Nuova abitudine…", accent) {
            val name = newHabit.trim()
            if (name.isNotEmpty()) { act { addHabit(name) }; newHabit = "" }
        }
        Spacer(Modifier.height(6.dp))
        if (data.habits.isEmpty()) {
            Text("Nessuna abitudine.", color = Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        }
        for (habit in data.habits) {
            val counts = data.log[habit.id] ?: emptyMap()
            HabitRow(habit, counts, today, accent, selectedHabitId == habit.id, { onSelect(if (selectedHabitId == habit.id) null else habit.id) }, act)
            if (selectedHabitId == habit.id) {
                GithubHeatmap(counts.keys, today, accent)
                HabitSettings(habit, accent, act)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun HabitRow(
    habit: Habit,
    counts: Map<LocalDate, Int>,
    today: LocalDate,
    accent: Accent,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    act: (suspend VaultRepository.() -> Unit) -> Unit,
) {
    val countToday = counts[today] ?: 0
    val counterMode = habit.countable || habit.goal > 1
    val done = MarkdownParser.doneToday(habit, counts, today)
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (counterMode) {
            val label = if (habit.countable) "$countToday" else "$countToday/${habit.goal}"
            Box(
                modifier = Modifier
                    .background(if (done) accent.base else Tokens.bg2, RoundedCornerShape(6.dp))
                    .border(1.dp, if (done) accent.base else Tokens.border, RoundedCornerShape(6.dp))
                    .clickable {
                        if (!(habit.goal in 1..countToday && !habit.countable)) {
                            act { incrementHabit(habit.id, today) }
                        }
                    }
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            ) {
                Text(label, color = if (done) Tokens.text else Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            }
            if (countToday > 0) {
                Spacer(Modifier.width(4.dp))
                Text(
                    "−",
                    color = Tokens.muted,
                    fontSize = 18.sp,
                    modifier = Modifier.clickable { act { decrementHabit(habit.id, today) } }.padding(horizontal = 4.dp),
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .background(if (done) accent.base else Color.Transparent, RoundedCornerShape(6.dp))
                    .border(1.5.dp, if (done) accent.base else accent.bright, RoundedCornerShape(6.dp))
                    .clickable { act { toggleHabit(habit.id, today) } },
                contentAlignment = Alignment.Center,
            ) {
                if (done) Text("✓", color = Tokens.text, fontSize = 14.sp)
            }
        }
        Spacer(Modifier.width(10.dp))
        Text(
            listOf(habit.emoji, habit.name).filter { it.isNotBlank() }.joinToString(" "),
            color = if (done) Tokens.muted else Tokens.text,
            fontFamily = FontFamily.Monospace,
            fontSize = 14.sp,
            modifier = Modifier.weight(1f).clickable { onToggleExpand() },
        )
        val streak = MarkdownParser.streak(counts, today, habit.goal, habit.cadence)
        if (streak > 0) {
            Text("$streak×", color = accent.bright, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            Spacer(Modifier.width(8.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            for (i in 6 downTo 0) {
                val dd = today.minusDays(i.toLong())
                Box(
                    Modifier.padding(horizontal = 1.5.dp)
                        .size(8.dp)
                        .background(if ((counts[dd] ?: 0) >= habit.goal) accent.base else Tokens.surface, RoundedCornerShape(50)),
                )
            }
        }
    }
}

@Composable
private fun HabitSettings(habit: Habit, accent: Accent, act: (suspend VaultRepository.() -> Unit) -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .background(Tokens.bg2, RoundedCornerShape(10.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StepperRow("Volte al giorno", habit.goal) { v -> act { setHabitFields(habit.id, mapOf("goal" to if (v == 1) "" else v.toString())) } }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Conteggio libero", color = Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Switch(
                checked = habit.countable,
                onCheckedChange = { on -> act { setHabitFields(habit.id, mapOf("countable" to if (on) "true" else "")) } },
                colors = SwitchDefaults.colors(checkedTrackColor = accent.base, checkedThumbColor = Tokens.text),
            )
        }
        StepperRow("Ogni N giorni", habit.cadence) { v -> act { setHabitFields(habit.id, mapOf("cadence" to if (v == 1) "" else v.toString())) } }
        RemindersEditor(habit, accent, act)
        Text(
            "Elimina abitudine",
            color = Tokens.overdue,
            fontFamily = FontFamily.Monospace,
            fontSize = 12.sp,
            modifier = Modifier.clickable { act { deleteHabit(habit.id) } },
        )
    }
}

@Composable
private fun RemindersEditor(habit: Habit, accent: Accent, act: (suspend VaultRepository.() -> Unit) -> Unit) {
    var newTime by remember { mutableStateOf("") }
    Column {
        Text("Promemoria", color = Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            for (time in habit.reminders) {
                Row(
                    Modifier.background(accent.soft, RoundedCornerShape(50)).padding(start = 10.dp, end = 6.dp, top = 2.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(time, color = Tokens.text, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                    Text("×", color = Tokens.muted, fontSize = 14.sp, modifier = Modifier.padding(start = 4.dp).clickable {
                        act { setHabitReminders(habit.id, habit.reminders.filter { it != time }) }
                    })
                }
            }
        }
        Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = newTime,
                onValueChange = { newTime = it },
                label = { Text("HH:mm", fontFamily = FontFamily.Monospace, fontSize = 11.sp) },
                textStyle = TextStyle(fontFamily = FontFamily.Monospace, color = Tokens.text),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accent.bright, unfocusedBorderColor = Tokens.border),
                modifier = Modifier.width(120.dp),
            )
            Button(
                onClick = {
                    val t = MarkdownParser.normalizeTime(newTime)
                    if (t != null && t !in habit.reminders) {
                        act { setHabitReminders(habit.id, (habit.reminders + t).sorted()) }
                        newTime = ""
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = accent.base, contentColor = Tokens.text),
            ) { Text("+", fontFamily = FontFamily.Monospace) }
        }
    }
}

@Composable
private fun StepperRow(label: String, value: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text("−", color = Tokens.text, fontSize = 20.sp, modifier = Modifier.clickable { onChange(maxOf(1, value - 1)) }.padding(horizontal = 10.dp))
        Text("$value", color = Tokens.text, fontFamily = FontFamily.Monospace, fontSize = 14.sp)
        Text("+", color = Tokens.text, fontSize = 20.sp, modifier = Modifier.clickable { onChange(value + 1) }.padding(horizontal = 10.dp))
    }
}

/* ---------------- pagina Attività ---------------- */

@Composable
private fun TasksPage(data: TrackerData, today: LocalDate, accent: Accent, act: (suspend VaultRepository.() -> Unit) -> Unit) {
    var newTodo by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
        AddRow(newTodo, { newTodo = it }, "Nuova attività…", accent) {
            val text = newTodo.trim()
            if (text.isNotEmpty()) { act { addTodo(text, TaskPriority.NONE, null, null) }; newTodo = "" }
        }
        Spacer(Modifier.height(6.dp))
        val groups = MarkdownParser.groupTodos(data.todos, today)
        if (groups.isEmpty()) {
            Text("Tutto fatto ✨", color = Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        }
        for ((group, todos) in groups) {
            Text(
                groupLabel(group),
                color = if (group == MarkdownParser.TodoGroup.OVERDUE) Tokens.overdue else Tokens.muted,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
            )
            for (todo in todos) TodoRow(todo, today, accent, act)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun TodoRow(todo: Todo, today: LocalDate, accent: Accent, act: (suspend VaultRepository.() -> Unit) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(20.dp)
                .border(1.5.dp, accent.bright, RoundedCornerShape(5.dp))
                .clickable { act { toggleTodo(todo.raw) } },
        )
        Spacer(Modifier.width(8.dp))
        if (todo.priority != TaskPriority.NONE) {
            Box(Modifier.size(8.dp).background(prioColor(todo.priority, accent), RoundedCornerShape(50)))
            Spacer(Modifier.width(6.dp))
        }
        Text(todo.text, color = Tokens.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp, modifier = Modifier.weight(1f))
        val due = todo.due
        val label = listOfNotNull(
            due?.let { if (it == today) "oggi" else it.format(DateTimeFormatter.ofPattern("d MMM", Locale.ITALIAN)) },
            todo.time,
        ).joinToString(" ")
        if (label.isNotEmpty()) {
            val overdue = due != null && due.isBefore(today)
            Text(label, color = if (overdue) Tokens.overdue else Tokens.muted, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
        }
    }
}

/* ---------------- impostazioni ---------------- */

@Composable
private fun SettingsSheet(
    prefs: Prefs,
    accentHex: String,
    onAccent: (String) -> Unit,
    onPick: () -> Unit,
    onReload: () -> Unit,
    treeConfigured: Boolean,
    accent: Accent,
) {
    var alpha by remember { mutableStateOf(prefs.widgetAlpha.toFloat()) }
    var notif by remember { mutableStateOf(prefs.notificationsEnabled) }
    var hex by remember { mutableStateOf(accentHex) }
    val context = LocalContext.current

    Column(
        Modifier.fillMaxWidth().padding(16.dp).background(Tokens.bg2, RoundedCornerShape(12.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(if (treeConfigured) "Vault collegato ✓" else "Nessun vault configurato.", color = if (treeConfigured) accent.bright else Tokens.overdue, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        Button(onClick = onPick, colors = ButtonDefaults.buttonColors(containerColor = accent.base, contentColor = Tokens.text)) {
            Text("Scegli la cartella del vault", fontFamily = FontFamily.Monospace)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Notifiche promemoria", color = Tokens.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Switch(
                checked = notif,
                onCheckedChange = { on -> notif = on; prefs.notificationsEnabled = on; NotificationScheduler.scheduleNext(context) },
                colors = SwitchDefaults.colors(checkedTrackColor = accent.base, checkedThumbColor = Tokens.text),
            )
        }
        Text("Opacità sfondo widget: ${alpha.toInt()}%", color = Tokens.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
        Slider(
            value = alpha, onValueChange = { alpha = it },
            onValueChangeFinished = { prefs.widgetAlpha = alpha.toInt(); onReload() },
            valueRange = 0f..100f, steps = 19,
            colors = SliderDefaults.colors(thumbColor = accent.bright, activeTrackColor = accent.base, inactiveTrackColor = Tokens.surface),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(30.dp).background(accent.base, RoundedCornerShape(15.dp)).border(1.dp, accent.bright, RoundedCornerShape(15.dp)))
            Spacer(Modifier.width(10.dp))
            OutlinedTextField(
                value = hex,
                onValueChange = { v ->
                    hex = v
                    val norm = v.trim().let { if (it.startsWith("#")) it else "#$it" }
                    if (Regex("^#[0-9a-fA-F]{6}$").matches(norm)) onAccent(norm)
                },
                label = { Text("accent hex", fontFamily = FontFamily.Monospace, fontSize = 11.sp) },
                textStyle = TextStyle(fontFamily = FontFamily.Monospace, color = Tokens.text),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accent.bright, unfocusedBorderColor = Tokens.border),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/* ---------------- helper UI ---------------- */

@Composable
private fun AddRow(value: String, onValue: (String) -> Unit, placeholder: String, accent: Accent, onAdd: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = value,
            onValueChange = onValue,
            label = { Text(placeholder, fontFamily = FontFamily.Monospace, fontSize = 11.sp) },
            textStyle = TextStyle(fontFamily = FontFamily.Monospace, color = Tokens.text),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accent.bright, unfocusedBorderColor = Tokens.border),
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        Button(onClick = onAdd, colors = ButtonDefaults.buttonColors(containerColor = accent.base, contentColor = Tokens.text)) {
            Text("+", fontFamily = FontFamily.Monospace, fontSize = 18.sp)
        }
    }
}

private fun groupLabel(g: MarkdownParser.TodoGroup): String = when (g) {
    MarkdownParser.TodoGroup.TODAY -> "OGGI"
    MarkdownParser.TodoGroup.NEXT7 -> "PROSSIMI 7 GIORNI"
    MarkdownParser.TodoGroup.LATER -> "PIÙ AVANTI"
    MarkdownParser.TodoGroup.OVERDUE -> "IN RITARDO"
    MarkdownParser.TodoGroup.NODATE -> "SENZA DATA"
}

private fun prioColor(p: TaskPriority, accent: Accent): Color = when (p) {
    TaskPriority.HIGHEST -> Tokens.prioHighest
    TaskPriority.HIGH -> Tokens.prioHigh
    TaskPriority.MEDIUM -> accent.bright
    TaskPriority.LOW -> Tokens.prioLow
    TaskPriority.LOWEST -> Tokens.prioLowest
    TaskPriority.NONE -> Tokens.muted
}

private fun headerDate(today: LocalDate): String {
    val s = today.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN))
    return s.replaceFirstChar { it.uppercase(Locale.ITALIAN) }
}

@Composable
private fun GithubHeatmap(dates: Set<LocalDate>, today: LocalDate, accent: Accent, weeks: Int = 52) {
    val monday = today.minusDays((today.dayOfWeek.value - 1).toLong())
    val start = monday.minusWeeks((weeks - 1).toLong())
    val scroll = rememberScrollState()
    LaunchedEffect(Unit) { scroll.scrollTo(scroll.maxValue) }
    val done = dates.count { !it.isBefore(start) && !it.isAfter(today) }

    Column(
        modifier = Modifier.fillMaxWidth().background(Tokens.bg2, RoundedCornerShape(12.dp)).padding(12.dp),
    ) {
        Column(Modifier.horizontalScroll(scroll)) {
            Row {
                var prevMonth = -1
                for (w in 0 until weeks) {
                    val weekStart = start.plusWeeks(w.toLong())
                    Box(Modifier.width(12.dp).height(16.dp)) {
                        if (weekStart.monthValue != prevMonth) {
                            Text(
                                weekStart.format(DateTimeFormatter.ofPattern("MMM", Locale.ITALIAN)),
                                style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = Tokens.muted),
                                maxLines = 1, softWrap = false,
                                modifier = Modifier.wrapContentWidthStart(),
                            )
                        }
                        prevMonth = weekStart.monthValue
                    }
                }
            }
            Row {
                for (w in 0 until weeks) {
                    Column(Modifier.width(12.dp)) {
                        for (dow in 0..6) {
                            val date = start.plusWeeks(w.toLong()).plusDays(dow.toLong())
                            val color = when {
                                date.isAfter(today) -> Color.Transparent
                                date in dates -> accent.base
                                else -> Tokens.surface
                            }
                            Box(
                                Modifier.padding(1.dp).size(10.dp).background(color, RoundedCornerShape(2.dp))
                                    .then(if (date == today) Modifier.border(1.dp, accent.bright, RoundedCornerShape(2.dp)) else Modifier),
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text("$done completamenti nelle ultime $weeks settimane", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Tokens.muted))
    }
}

private fun Modifier.wrapContentWidthStart(): Modifier = this.then(
    Modifier.layout { measurable, constraints ->
        val placeable = measurable.measure(constraints.copy(minWidth = 0, maxWidth = Int.MAX_VALUE))
        layout(constraints.minWidth, placeable.height) { placeable.placeRelative(0, 0) }
    }
)
