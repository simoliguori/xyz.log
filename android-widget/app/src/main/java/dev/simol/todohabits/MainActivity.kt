package dev.simol.todohabits

import android.content.Intent
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
import dev.simol.todohabits.data.Prefs
import dev.simol.todohabits.data.TaskPriority
import dev.simol.todohabits.data.TrackerData
import dev.simol.todohabits.data.VaultRepository
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
    var folder by remember { mutableStateOf(prefs.folder) }
    var data by remember { mutableStateOf<TrackerData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var newTodo by remember { mutableStateOf("") }
    var selectedHabitId by remember { mutableStateOf(initialHabitId) }
    var widgetAlpha by remember { mutableStateOf(prefs.widgetAlpha.toFloat()) }
    var accentHex by remember { mutableStateOf(prefs.accentHex) }
    val accent = remember(accentHex) { accentFromHex(accentHex) }

    val mono = FontFamily.Monospace
    val serif = remember { headlineFontFamily(context) }

    fun updateWidgets() {
        scope.launch {
            HabitWidget().updateAll(context)
            TodoWidget().updateAll(context)
        }
    }

    fun reload() {
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { VaultRepository(context).readData() }
            }
            data = result.getOrNull()
            error = result.exceptionOrNull()?.message
            updateWidgets()
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            "Todo & Habits",
            style = TextStyle(fontFamily = serif, fontSize = 34.sp, color = Tokens.text)
        )
        Text(
            if (treeUri == null) "Nessun vault configurato." else "Vault collegato ✓",
            style = TextStyle(fontFamily = mono, fontSize = 13.sp, color = if (treeUri == null) Tokens.overdue else accent.bright)
        )

        Button(
            onClick = { picker.launch(null) },
            colors = ButtonDefaults.buttonColors(containerColor = accent.base, contentColor = Tokens.text)
        ) {
            Text("Scegli la cartella del vault", fontFamily = mono)
        }

        OutlinedTextField(
            value = folder,
            onValueChange = {
                folder = it
                prefs.folder = it
            },
            label = { Text("Sottocartella dati (come nel plugin Obsidian)", fontFamily = mono, fontSize = 11.sp) },
            textStyle = TextStyle(fontFamily = mono, color = Tokens.text),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = accent.bright,
                unfocusedBorderColor = Tokens.border,
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Text(
            "Opacità sfondo widget: ${widgetAlpha.toInt()}%",
            style = TextStyle(fontFamily = mono, fontSize = 13.sp, color = Tokens.text)
        )
        Slider(
            value = widgetAlpha,
            onValueChange = { widgetAlpha = it },
            onValueChangeFinished = {
                prefs.widgetAlpha = widgetAlpha.toInt()
                updateWidgets()
            },
            valueRange = 0f..100f,
            steps = 19,
            colors = SliderDefaults.colors(
                thumbColor = accent.bright,
                activeTrackColor = accent.base,
                inactiveTrackColor = Tokens.surface,
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Text(
            "Colore accent",
            style = TextStyle(fontFamily = mono, fontSize = 13.sp, color = Tokens.text)
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(32.dp)
                    .background(accent.base, RoundedCornerShape(16.dp))
                    .border(1.dp, accent.bright, RoundedCornerShape(16.dp))
            )
            Spacer(Modifier.width(10.dp))
            OutlinedTextField(
                value = accentHex,
                onValueChange = { v ->
                    accentHex = v
                    val norm = v.trim().let { if (it.startsWith("#")) it else "#$it" }
                    if (Regex("^#[0-9a-fA-F]{6}$").matches(norm)) {
                        prefs.accentHex = norm
                        updateWidgets()
                    }
                },
                label = { Text("hex (#RRGGBB)", fontFamily = mono, fontSize = 11.sp) },
                textStyle = TextStyle(fontFamily = mono, color = Tokens.text),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = accent.bright,
                    unfocusedBorderColor = Tokens.border,
                ),
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(10.dp))
            Button(
                onClick = {
                    accentHex = Prefs.DEFAULT_ACCENT
                    prefs.accentHex = Prefs.DEFAULT_ACCENT
                    updateWidgets()
                },
                colors = ButtonDefaults.buttonColors(containerColor = Tokens.surface, contentColor = Tokens.text)
            ) {
                Text("Default", fontFamily = mono, fontSize = 12.sp)
            }
        }

        Button(
            onClick = { reload() },
            colors = ButtonDefaults.buttonColors(containerColor = Tokens.surface, contentColor = Tokens.text)
        ) {
            Text("Ricarica e aggiorna i widget", fontFamily = mono)
        }

        error?.let {
            Text("Errore: $it", style = TextStyle(fontFamily = mono, fontSize = 12.sp, color = Tokens.overdue))
        }

        data?.let { d ->
            Spacer(Modifier.height(8.dp))
            Text("Abitudini", style = TextStyle(fontFamily = serif, fontSize = 22.sp, color = accent.bright))

            val today = LocalDate.now()
            d.habits.forEach { h ->
                val dates = d.log[h.id] ?: emptySet()
                val done = today in dates
                Text(
                    "${if (done) "●" else "○"} ${h.emoji} ${h.name}".trim(),
                    style = TextStyle(fontFamily = mono, fontSize = 14.sp, color = if (done) accent.bright else Tokens.text),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            selectedHabitId = if (selectedHabitId == h.id) null else h.id
                        }
                        .padding(vertical = 4.dp)
                )
                if (selectedHabitId == h.id) {
                    GithubHeatmap(dates = dates, today = today, accent = accent)
                }
            }

            Spacer(Modifier.height(8.dp))
            Text("Todo", style = TextStyle(fontFamily = serif, fontSize = 22.sp, color = accent.bright))
            Text(
                "${d.todos.count { !it.done }} attività aperte",
                style = TextStyle(fontFamily = mono, fontSize = 13.sp, color = Tokens.muted)
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = newTodo,
                    onValueChange = { newTodo = it },
                    label = { Text("Nuova attività…", fontFamily = mono, fontSize = 11.sp) },
                    textStyle = TextStyle(fontFamily = mono, color = Tokens.text),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = accent.bright,
                        unfocusedBorderColor = Tokens.border,
                    ),
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        val text = newTodo.trim()
                        if (text.isNotEmpty()) {
                            scope.launch {
                                withContext(Dispatchers.IO) {
                                    runCatching {
                                        VaultRepository(context).addTodo(text, TaskPriority.NONE, null)
                                    }
                                }
                                newTodo = ""
                                reload()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = accent.base, contentColor = Tokens.text)
                ) {
                    Text("+", fontFamily = mono, fontSize = 18.sp)
                }
            }
        }
    }
}

/**
 * Cronologia stile GitHub: colonne = settimane (lun→dom), ~1 anno,
 * inizio di ogni mese segnato in alto, scrollata sulla settimana corrente.
 */
@Composable
private fun GithubHeatmap(dates: Set<LocalDate>, today: LocalDate, accent: Accent, weeks: Int = 52) {
    val monday = today.minusDays((today.dayOfWeek.value - 1).toLong())
    val start = monday.minusWeeks((weeks - 1).toLong())
    val scroll = rememberScrollState()
    LaunchedEffect(Unit) { scroll.scrollTo(scroll.maxValue) }

    val done = dates.count { !it.isBefore(start) && !it.isAfter(today) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Tokens.bg2, RoundedCornerShape(12.dp))
            .padding(12.dp)
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
                                maxLines = 1,
                                softWrap = false,
                                modifier = Modifier.wrapContentWidthStart()
                            )
                        }
                        prevMonth = weekStart.monthValue
                    }
                }
            }
            Row {
                for (w in 0 until weeks) {
                    Column(Modifier.width(12.dp)) {
                        for (d in 0..6) {
                            val date = start.plusWeeks(w.toLong()).plusDays(d.toLong())
                            val color = when {
                                date.isAfter(today) -> Color.Transparent
                                date in dates -> accent.base
                                else -> Tokens.surface
                            }
                            Box(
                                Modifier
                                    .padding(1.dp)
                                    .size(10.dp)
                                    .background(color, RoundedCornerShape(2.dp))
                                    .then(
                                        if (date == today) Modifier.border(1.dp, accent.bright, RoundedCornerShape(2.dp))
                                        else Modifier
                                    )
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "$done completamenti nelle ultime $weeks settimane",
            style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = Tokens.muted)
        )
    }
}

/** Misura il testo senza vincoli e lo allinea a sinistra, lasciandolo sbordare sulla colonna. */
private fun Modifier.wrapContentWidthStart(): Modifier =
    this.then(
        Modifier.layout { measurable, constraints ->
            val placeable = measurable.measure(constraints.copy(minWidth = 0, maxWidth = Int.MAX_VALUE))
            layout(constraints.minWidth, placeable.height) {
                placeable.placeRelative(0, 0)
            }
        }
    )
