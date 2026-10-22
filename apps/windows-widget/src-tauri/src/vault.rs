use serde::Serialize;
use std::path::{Path, PathBuf};

/// I tre file del tracker come testo grezzo (il parsing è lato frontend).
#[derive(Debug, Clone, Serialize)]
pub struct VaultFiles {
    pub habits: String,
    pub log: String,
    pub todo: String,
}

pub const HABITS_FILE: &str = "Habits.md";
pub const LOG_FILE: &str = "Habit Log.md";
pub const TODO_FILE: &str = "Todo.md";

fn file_name(which: &str) -> Option<&'static str> {
    match which {
        "habits" => Some(HABITS_FILE),
        "log" => Some(LOG_FILE),
        "todo" => Some(TODO_FILE),
        _ => None,
    }
}

pub fn file_path(folder: &str, which: &str) -> Option<PathBuf> {
    let name = file_name(which)?;
    if folder.trim().is_empty() {
        return None;
    }
    Some(Path::new(folder).join(name))
}

fn read_or_empty(folder: &str, name: &str) -> String {
    if folder.trim().is_empty() {
        return String::new();
    }
    std::fs::read_to_string(Path::new(folder).join(name)).unwrap_or_default()
}

pub fn read_files(folder: &str) -> VaultFiles {
    VaultFiles {
        habits: read_or_empty(folder, HABITS_FILE),
        log: read_or_empty(folder, LOG_FILE),
        todo: read_or_empty(folder, TODO_FILE),
    }
}

pub fn write_file(folder: &str, which: &str, content: &str) -> std::io::Result<()> {
    let path = file_path(folder, which).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "cartella o file non valido")
    })?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)
}

/// mtime combinato dei tre file, per il polling delle modifiche esterne.
pub fn signature(folder: &str) -> u128 {
    let mut sig: u128 = 0;
    for name in [HABITS_FILE, LOG_FILE, TODO_FILE] {
        if let Ok(meta) = std::fs::metadata(Path::new(folder).join(name)) {
            if let Ok(modified) = meta.modified() {
                if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                    sig = sig.wrapping_add(dur.as_millis());
                }
            }
            sig = sig.wrapping_add(meta.len() as u128);
        }
    }
    sig
}
