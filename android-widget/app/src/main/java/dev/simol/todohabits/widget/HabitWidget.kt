package dev.simol.todohabits.widget

import android.content.Context
import androidx.compose.runtime.Composable
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
import androidx.glance.layout.Box
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
import dev.simol.todohabits.MainActivity
import dev.simol.todohabits.R
import dev.simol.todohabits.data.Habit
import dev.simol.todohabits.data.MarkdownParser
import dev.simol.todohabits.data.TrackerData
import dev.simol.todohabits.data.VaultRepository
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class HabitWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = HabitWidget()
}

class HabitWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = VaultRepository(context)
        val data = if (repo.isConfigured()) {
            withContext(Dispatchers.IO) { runCatching { repo.readData() }.getOrNull() }
        } else null
        val alpha = dev.simol.todohabits.data.Prefs(context).widgetAlpha
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
                    text = headerDate(today),
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
                data == null -> NotConfigured(accent)
                data.habits.isEmpty() -> Text(
                    text = "Nessuna abitudine in Habits.md",
                    style = TextStyle(color = ColorProvider(Tokens.muted), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                )
                else -> LazyColumn {
                    items(data.habits) { habit ->
                        HabitRow(habit, data.log[habit.id] ?: emptySet(), today, accent)
                    }
                }
            }
        }
    }

    @Composable
    private fun NotConfigured(accent: Accent) {
        Text(
            text = "Tocca per scegliere la cartella del vault",
            style = TextStyle(color = ColorProvider(accent.bright), fontSize = 13.sp, fontFamily = FontFamily.Monospace),
            modifier = GlanceModifier.clickable(actionStartActivity<MainActivity>())
        )
    }

    @Composable
    private fun HabitRow(habit: Habit, dates: Set<LocalDate>, today: LocalDate, accent: Accent) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().padding(vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val doneToday = today in dates
            Box(
                modifier = GlanceModifier
                    .size(26.dp)
                    .clickable(
                        actionRunCallback<ToggleHabitAction>(
                            actionParametersOf(ToggleHabitAction.HABIT_ID to habit.id)
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    provider = ImageProvider(if (doneToday) R.drawable.circle_filled else R.drawable.circle_outline),
                    contentDescription = habit.name,
                    colorFilter = ColorFilter.tint(ColorProvider(if (doneToday) accent.base else accent.bright)),
                    modifier = GlanceModifier.size(26.dp)
                )
                if (doneToday) {
                    Text(
                        text = "✓",
                        style = TextStyle(color = ColorProvider(Tokens.text), fontSize = 13.sp)
                    )
                }
            }
            Spacer(GlanceModifier.width(10.dp))
            Text(
                text = listOf(habit.emoji, habit.name).filter { it.isNotBlank() }.joinToString(" "),
                style = TextStyle(color = ColorProvider(Tokens.text), fontSize = 13.sp, fontFamily = FontFamily.Monospace),
                maxLines = 1,
                modifier = GlanceModifier
                    .defaultWeight()
                    .clickable(
                        actionRunCallback<OpenHabitAction>(
                            actionParametersOf(OpenHabitAction.HABIT_ID to habit.id)
                        )
                    )
            )
            val streak = MarkdownParser.streak(dates, today)
            if (streak > 0) {
                Text(
                    text = "$streak×",
                    style = TextStyle(
                        color = ColorProvider(accent.bright),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                )
                Spacer(GlanceModifier.width(8.dp))
            }
            // pallini degli ultimi 7 giorni
            Row(verticalAlignment = Alignment.CenterVertically) {
                for (i in 6 downTo 0) {
                    val d = today.minusDays(i.toLong())
                    Image(
                        provider = ImageProvider(R.drawable.dot),
                        contentDescription = null,
                        colorFilter = ColorFilter.tint(
                            ColorProvider(if (d in dates) accent.base else Tokens.surface)
                        ),
                        modifier = GlanceModifier.size(9.dp)
                    )
                    if (i > 0) Spacer(GlanceModifier.width(3.dp))
                }
            }
        }
    }

    private fun headerDate(today: LocalDate): String {
        val s = today.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN))
        return s.replaceFirstChar { it.uppercase(Locale.ITALIAN) }
    }
}
