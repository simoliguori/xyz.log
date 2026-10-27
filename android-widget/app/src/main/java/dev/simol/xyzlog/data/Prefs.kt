package dev.simol.xyzlog.data

import android.content.Context

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("xyzlog", Context.MODE_PRIVATE)

    /** SAF (tree) URI of the vault root */
    var treeUri: String?
        get() = sp.getString("treeUri", null)
        set(value) = sp.edit().putString("treeUri", value).apply()

    /** Data subfolder inside the vault (same setting as the Obsidian plugin) */
    var folder: String
        get() = sp.getString("folder", "xyz.log")!!
        set(value) = sp.edit().putString("folder", value.trim().ifEmpty { "xyz.log" }).apply()

    /** Widget background opacity, 0–100 (text always stays opaque) */
    var widgetAlpha: Int
        get() = sp.getInt("widgetAlpha", 100)
        set(value) = sp.edit().putInt("widgetAlpha", value.coerceIn(0, 100)).apply()

    /** Accent color (#RRGGBB); in the Obsidian plugin it follows the theme accent instead */
    var accentHex: String
        get() = sp.getString("accentHex", DEFAULT_ACCENT)!!
        set(value) = sp.edit().putString("accentHex", value).apply()

    /** Reminder notifications enabled */
    var notificationsEnabled: Boolean
        get() = sp.getBoolean("notifications", true)
        set(value) = sp.edit().putBoolean("notifications", value).apply()

    companion object {
        const val DEFAULT_ACCENT = "#44437A"
    }
}
