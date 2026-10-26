package dev.simol.xyzlog.data

import android.content.Context

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("xyzlog", Context.MODE_PRIVATE)

    /** URI SAF (tree) della radice del vault */
    var treeUri: String?
        get() = sp.getString("treeUri", null)
        set(value) = sp.edit().putString("treeUri", value).apply()

    /** Sottocartella dei dati dentro il vault (stessa impostazione del plugin Obsidian) */
    var folder: String
        get() = sp.getString("folder", "xyz.log")!!
        set(value) = sp.edit().putString("folder", value.trim().ifEmpty { "xyz.log" }).apply()

    /** Opacità dello sfondo dei widget, 0–100 (il testo resta sempre opaco) */
    var widgetAlpha: Int
        get() = sp.getInt("widgetAlpha", 100)
        set(value) = sp.edit().putInt("widgetAlpha", value.coerceIn(0, 100)).apply()

    /** Colore accent (#RRGGBB); nel plugin Obsidian invece segue l'accent del tema */
    var accentHex: String
        get() = sp.getString("accentHex", DEFAULT_ACCENT)!!
        set(value) = sp.edit().putString("accentHex", value).apply()

    /** Notifiche di promemoria attive */
    var notificationsEnabled: Boolean
        get() = sp.getBoolean("notifications", true)
        set(value) = sp.edit().putBoolean("notifications", value).apply()

    companion object {
        const val DEFAULT_ACCENT = "#44437A"
    }
}
