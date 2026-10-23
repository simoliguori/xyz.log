use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Configurazione persistente del widget. `tabs` è opaco (la forma dei riquadri
/// vive nel frontend TypeScript): lo conserviamo così com'è.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub folder: String,
    #[serde(default = "default_lang")]
    pub lang: String,
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
    /// sincronizza l'accent col colore di Obsidian (letto da appearance.json)
    #[serde(default = "default_true")]
    pub sync_accent: bool,
    #[serde(default)]
    pub tabs: serde_json::Value,
}

fn default_lang() -> String {
    "en".into()
}
fn default_accent() -> String {
    "#44437a".into()
}
fn default_opacity() -> u32 {
    90
}
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            folder: String::new(),
            lang: "en".into(),
            accent: default_accent(),
            opacity: default_opacity(),
            pinned: false,
            autostart: true,
            notifications: true,
            sync_accent: true,
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
