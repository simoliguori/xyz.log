package dev.simol.xyzlog.widget

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily

/** Design token condivisi con il plugin Obsidian (design/tokens.json). */
object Tokens {
    val bg = Color(0xFF1E1E1E)
    val bg2 = Color(0xFF262626)
    val surface = Color(0xFF2C2C31)
    val border = Color(0xFF3A3A41)
    val text = Color(0xFFDCDCDC)
    val muted = Color(0xFF8F8F96)
    val accent = Color(0xFF44437A)
    val accentBright = Color(0xFF8887C5)
    val accentSoft = Color(0xFF2A2951)
    val overdue = Color(0xFFC76A6A)
    val prioHighest = Color(0xFFC76A6A)
    val prioHigh = Color(0xFFC98F5F)
    val prioMedium = Color(0xFF8887C5)
    val prioLow = Color(0xFF6F8F7A)
    val prioLowest = Color(0xFF5D7264)
}

/** Accent personalizzabile con le varianti derivate (come nel CSS del plugin). */
data class Accent(val base: Color, val bright: Color, val soft: Color)

fun accentFromHex(hex: String): Accent {
    val base = runCatching {
        Color(android.graphics.Color.parseColor(hex.trim()))
    }.getOrDefault(Tokens.accent)
    return Accent(
        base = base,
        bright = base.mix(Color.White, 0.5f),
        soft = base.mix(Tokens.bg, 0.6f),
    )
}

fun accentOf(context: Context): Accent =
    accentFromHex(dev.simol.xyzlog.data.Prefs(context).accentHex)

private fun Color.mix(other: Color, fraction: Float): Color = Color(
    red = red + (other.red - red) * fraction,
    green = green + (other.green - green) * fraction,
    blue = blue + (other.blue - blue) * fraction,
    alpha = 1f,
)

/**
 * Font dei titoli: NType82-Headline se l'utente ha copiato l'otf in
 * assets/fonts/ (non è redistribuibile), altrimenti il sans di sistema.
 * Vale solo per l'app Compose: i widget Glance non supportano font custom.
 */
@OptIn(ExperimentalTextApi::class)
fun headlineFontFamily(context: Context): FontFamily = try {
    FontFamily(Font("fonts/NType82-Headline.otf", context.assets))
} catch (_: Exception) {
    FontFamily.SansSerif
}
