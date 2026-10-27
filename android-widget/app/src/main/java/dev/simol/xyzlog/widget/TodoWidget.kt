package dev.simol.xyzlog.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dev.simol.xyzlog.MainActivity
import dev.simol.xyzlog.R
import dev.simol.xyzlog.data.MarkdownParser
import dev.simol.xyzlog.data.TaskPriority
import dev.simol.xyzlog.data.Todo
import dev.simol.xyzlog.data.TrackerData
import dev.simol.xyzlog.data.VaultRepository
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class TodoWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodoWidget()
}

class TodoWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = VaultRepository(context)
        val data = if (repo.isConfigured()) {
            withContext(Dispatchers.IO) { runCatching { repo.readData() }.getOrNull() }
        } else null
        val alpha = dev.simol.xyzlog.data.Prefs(context).widgetAlpha
        val accent = accentOf(context)

        provideContent { Content(data, alpha, accent) }
    }

    @Composable
    private fun Content(data: TrackerData?, bgAlpha: Int, accent: Accent) {
        val today = LocalDate.now()
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ColorProvider(Tokens.bg.copy(alpha = bgAlpha / 100f)))
                .cornerRadius(24.dp)
                .padding(16.dp)
        ) {
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Todo",
                    style = TextStyle(
                        color = ColorProvider(Tokens.text),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.SansSerif
                    ),
                    modifier = GlanceModifier.defaultWeight()
                )
                Text(
                    text = "↻",
                    style = TextStyle(color = ColorProvider(Tokens.muted), fontSize = 16.sp),
                    modifier = GlanceModifier.clickable(actionRunCallback<RefreshAction>())
                )
            }
            Spacer(GlanceModifier.height(10.dp))

            when {
                data == null -> Text(
                    text = "Tap to pick the vault folder",
                    style = TextStyle(color = ColorProvider(accent.bright), fontSize = 13.sp, fontFamily = FontFamily.Monospace),
                    modifier = GlanceModifier.clickable(actionStartActivity<MainActivity>())
                )
                else -> {
                    // order: today/future on top, overdue below, undated last
                    val open = MarkdownParser.groupTodos(data.todos, today)
                        .flatMap { it.second }
                        .take(30)
                    if (open.isEmpty()) {
                        Text(
                            text = "Tutto fatto ✨",
                            style = TextStyle(color = ColorProvider(Tokens.muted), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                        )
                    } else {
                        LazyColumn {
                            items(open) { todo -> TodoRow(todo, today, accent) }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun TodoRow(todo: Todo, today: LocalDate, accent: Accent) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                provider = ImageProvider(R.drawable.circle_outline),
                contentDescription = "Completa",
                colorFilter = ColorFilter.tint(ColorProvider(accent.bright)),
                modifier = GlanceModifier
                    .size(20.dp)
                    .clickable(
                        actionRunCallback<ToggleTodoAction>(
                            actionParametersOf(ToggleTodoAction.TODO_RAW to todo.raw)
                        )
                    )
            )
            Spacer(GlanceModifier.width(8.dp))
            if (todo.priority != TaskPriority.NONE) {
                Text(
                    text = "●",
                    style = TextStyle(color = ColorProvider(prioColor(todo.priority, accent)), fontSize = 9.sp)
                )
                Spacer(GlanceModifier.width(6.dp))
            }
            Text(
                text = todo.text,
                style = TextStyle(color = ColorProvider(Tokens.text), fontSize = 13.sp, fontFamily = FontFamily.Monospace),
                maxLines = 2,
                modifier = GlanceModifier.defaultWeight()
            )
            val dueLabel = listOfNotNull(todo.due?.let { formatDue(it, today) }, todo.time).joinToString(" ")
            if (dueLabel.isNotEmpty()) {
                Spacer(GlanceModifier.width(6.dp))
                val overdue = todo.due?.isBefore(today) == true
                Text(
                    text = dueLabel,
                    style = TextStyle(
                        color = ColorProvider(if (overdue) Tokens.overdue else Tokens.muted),
                        fontSize = 11.sp,
                        fontWeight = if (overdue) FontWeight.Bold else FontWeight.Normal,
                        fontFamily = FontFamily.Monospace
                    )
                )
            }
        }
    }

    private fun prioColor(p: TaskPriority, accent: Accent): Color = when (p) {
        TaskPriority.HIGHEST -> Tokens.prioHighest
        TaskPriority.HIGH -> Tokens.prioHigh
        TaskPriority.MEDIUM -> accent.bright
        TaskPriority.LOW -> Tokens.prioLow
        TaskPriority.LOWEST -> Tokens.prioLowest
        TaskPriority.NONE -> Tokens.muted
    }

    private fun formatDue(due: LocalDate, today: LocalDate): String = when (due) {
        today -> "today"
        today.plusDays(1) -> "tomorrow"
        else -> due.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
    }
}
