use serde::Serialize;
use std::path::{Path, PathBuf};

/// The three tracker files as raw text (parsing happens on the frontend).
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
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid folder or file")
    })?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)
}

/// Search the vault for a folder named "xyz.log" (recursive, limited depth,
/// skipping hidden folders and node_modules). Returns the path of the first found.
pub fn locate_data_folder(vault: &str) -> Option<String> {
    if vault.trim().is_empty() {
        return None;
    }
    let mut stack = vec![(Path::new(vault).to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.eq_ignore_ascii_case("xyz.log") {
                return Some(p.to_string_lossy().to_string());
            }
            if depth < 5 && !name.starts_with('.') && name != "node_modules" {
                stack.push((p, depth + 1));
            }
        }
    }
    None
}

/// Create `<parent>/xyz.log` with the three tracker files (if missing). Returns the path.
pub fn create_data_folder(parent: &str) -> std::io::Result<String> {
    let dir = Path::new(parent).join("xyz.log");
    std::fs::create_dir_all(&dir)?;
    let seed = |name: &str, content: &str| -> std::io::Result<()> {
        let f = dir.join(name);
        if !f.exists() {
            std::fs::write(f, content)?;
        }
        Ok(())
    };
    seed(HABITS_FILE, "---\nhabits:\n---\n\n# Habits\n")?;
    seed(LOG_FILE, "# Habit history\n\n")?;
    seed(TODO_FILE, "# Todo\n\n")?;
    Ok(dir.to_string_lossy().to_string())
}

/// Read Obsidian's accent color by walking up from the data folder until it finds
/// `.obsidian/appearance.json`. Returns a `#rrggbb` hex or None.
pub fn obsidian_accent(folder: &str) -> Option<String> {
    if folder.trim().is_empty() {
        return None;
    }
    let mut dir = Path::new(folder).to_path_buf();
    for _ in 0..8 {
        let candidate = dir.join(".obsidian").join("appearance.json");
        if candidate.exists() {
            let txt = std::fs::read_to_string(&candidate).ok()?;
            let v: serde_json::Value = serde_json::from_str(&txt).ok()?;
            let acc = v.get("accentColor")?;
            if let Some(s) = acc.as_str() {
                let s = s.trim();
                if s.starts_with('#') && (s.len() == 7 || s.len() == 4) {
                    return Some(s.to_string());
                }
                return None; // "" or unsupported format: use the default
            } else if acc.is_object() {
                let h = acc.get("h")?.as_f64()?;
                let s = acc.get("s")?.as_f64()?;
                let l = acc.get("l")?.as_f64()?;
                return Some(hsl_to_hex(h, s, l));
            }
            return None;
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn hsl_to_hex(h: f64, s: f64, l: f64) -> String {
    let s = s / 100.0;
    let l = l / 100.0;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = (h % 360.0) / 60.0;
    let x = c * (1.0 - (hp % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match hp as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c / 2.0;
    let to = |v: f64| ((v + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    format!("#{:02x}{:02x}{:02x}", to(r1), to(g1), to(b1))
}

/// Combined mtime of the three files, for polling external changes.
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

/// The vault root: the first folder from `folder` upwards that holds `.obsidian`.
fn vault_root(folder: &str) -> Option<PathBuf> {
    if folder.trim().is_empty() {
        return None;
    }
    let mut dir = Path::new(folder).to_path_buf();
    for _ in 0..8 {
        if dir.join(".obsidian").is_dir() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// Percent-encode a URL query value (RFC 3986 unreserved characters kept).
fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Open a vault note in Obsidian through its `obsidian://` URL scheme.
/// `note` is the path relative to the vault, without `.md` (as in `## [[Note]]`).
pub fn open_note(folder: &str, note: &str) -> std::io::Result<()> {
    let url = match vault_root(folder) {
        Some(root) => {
            let rel: PathBuf = format!("{note}.md").split('/').collect();
            format!("obsidian://open?path={}", url_encode(&root.join(rel).to_string_lossy()))
        }
        // vault not found: let Obsidian resolve the path in the last open vault
        None => format!("obsidian://open?file={}", url_encode(note)),
    };
    #[cfg(windows)]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(url).spawn().map(|_| ())
}
