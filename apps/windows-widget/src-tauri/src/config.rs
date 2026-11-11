use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Persistent widget config. `tabs` is opaque (the tile layout lives in the
/// TypeScript frontend): we store it as-is.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub folder: String,
    #[serde(default = "default_lang")]
    pub lang: String,
    #[serde(default = "default_date_format")]
    pub date_format: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    #[serde(default = "default_opacity")]
    pub opacity: u32,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default = "default_true")]
    pub autostart: bool,
    #[serde(default = "default_true")]
    pub notifications: bool,
    /// sync the accent with Obsidian's color (read from appearance.json)
    #[serde(default = "default_true")]
    pub sync_accent: bool,
    /// where the accent comes from: "obsidian" | "windows" | "custom"
    #[serde(default = "default_accent_source")]
    pub accent_source: String,
    /// id of the sound played when a reminder fires ("none" to stay silent)
    #[serde(default = "default_notif_sound")]
    pub notif_sound: String,
    /// To-do ordering ("date" | "added-desc" | ... )
    #[serde(default = "default_todo_sort")]
    pub todo_sort: String,
    /// manual drag-to-reorder on top of the sort
    #[serde(default)]
    pub todo_draggable: bool,
    /// pin overdue tasks to the top, statically, in every sort mode
    #[serde(default)]
    pub overdue_top: bool,
    /// index of the tab left open
    #[serde(default)]
    pub active_tab: u32,
    #[serde(default)]
    pub tabs: serde_json::Value,
}

fn default_lang() -> String {
    "en".into()
}
fn default_date_format() -> String {
    "dmy".into()
}
fn default_accent_source() -> String {
    "obsidian".into()
}
fn default_notif_sound() -> String {
    "chime".into()
}
fn default_todo_sort() -> String {
    "date".into()
}
fn default_accent() -> String {
    "#44437a".into()
}
fn default_opacity() -> u32 {
    95
}
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            folder: String::new(),
            lang: "en".into(),
            date_format: default_date_format(),
            accent: default_accent(),
            opacity: default_opacity(),
            pinned: false,
            autostart: true,
            notifications: true,
            sync_accent: true,
            accent_source: default_accent_source(),
            notif_sound: default_notif_sound(),
            todo_sort: default_todo_sort(),
            todo_draggable: false,
            overdue_top: false,
            active_tab: 0,
            tabs: serde_json::Value::Null,
        }
    }
}

pub fn config_path(dir: &PathBuf) -> PathBuf {
    dir.join("config.json")
}

pub fn load(dir: &PathBuf) -> AppConfig {
    let path = config_path(dir);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<AppConfig>(&s).ok())
        .unwrap_or_default()
}

pub fn save(dir: &PathBuf, cfg: &AppConfig) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = config_path(dir);
    let json = serde_json::to_string_pretty(cfg).unwrap_or_else(|_| "{}".into());
    std::fs::write(path, json)
}
