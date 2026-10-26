use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_notification::NotificationExt;

mod config;
mod gadget;
mod notify;
mod vault;

use config::AppConfig;
use notify::Reminder;
use vault::VaultFiles;

#[derive(Default)]
struct AppState {
    config: Mutex<AppConfig>,
    reminders: Mutex<Vec<Reminder>>,
    fired: Mutex<HashSet<String>>,
}

/* ------------------------- comandi ------------------------- */

#[tauri::command]
fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn set_config(app: AppHandle, state: State<AppState>, cfg: AppConfig) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    config::save(&dir, &cfg).map_err(|e| e.to_string())?;
    *state.config.lock().unwrap() = cfg;
    Ok(())
}

#[tauri::command]
fn read_files(state: State<AppState>) -> VaultFiles {
    let folder = state.config.lock().unwrap().folder.clone();
    vault::read_files(&folder)
}

#[tauri::command]
fn write_file(state: State<AppState>, which: String, content: String) -> Result<(), String> {
    let folder = state.config.lock().unwrap().folder.clone();
    vault::write_file(&folder, &which, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_folder(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    // dialog NON bloccante: il comando gira fuori dal thread della UI, quindi
    // aspettare la scelta qui non congela la finestra (il blocking_* sì).
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    rx.recv().ok().flatten().map(|p| p.to_string())
}

#[tauri::command]
fn locate_data_folder(vault: String) -> Option<String> {
    vault::locate_data_folder(&vault)
}

#[tauri::command]
fn create_data_folder(parent: String) -> Result<String, String> {
    vault::create_data_folder(&parent).map_err(|e| e.to_string())
}

#[tauri::command]
fn obsidian_accent(state: State<AppState>) -> Option<String> {
    let folder = state.config.lock().unwrap().folder.clone();
    vault::obsidian_accent(&folder)
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn close_window(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
fn sync_reminders(state: State<AppState>, reminders: Vec<Reminder>) {
    *state.reminders.lock().unwrap() = reminders;
}

#[tauri::command]
fn notify_now(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_opacity(window: WebviewWindow, pct: u32) {
    gadget::set_opacity(&window, pct);
}

#[tauri::command]
fn set_pinned(window: WebviewWindow, on: bool) {
    gadget::set_pinned(&window, on);
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if on {
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

/* ------------------------- supporto ------------------------- */

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostra / Nascondi", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Esci", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("xyz.log")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = if w.is_visible().unwrap_or(false) {
                        w.hide()
                    } else {
                        let _ = w.show();
                        w.set_focus()
                    };
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(20));
        let state = app.state::<AppState>();
        if !state.config.lock().unwrap().notifications {
            continue;
        }
        let reminders = state.reminders.lock().unwrap().clone();
        let due = {
            let mut fired = state.fired.lock().unwrap();
            notify::due_now(chrono::Local::now(), &reminders, &mut fired)
        };
        for (title, body) in due {
            let _ = app.notification().builder().title(title).body(body).show();
        }
    });
}

fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: u128 = 0;
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let folder = app.state::<AppState>().config.lock().unwrap().folder.clone();
            if folder.trim().is_empty() {
                continue;
            }
            let sig = vault::signature(&folder);
            if last == 0 {
                last = sig;
                continue;
            }
            if sig != last {
                last = sig;
                let _ = app.emit("vault-changed", ());
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ricorda posizione e dimensione della finestra tra un avvio e l'altro
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            read_files,
            write_file,
            pick_folder,
            sync_reminders,
            notify_now,
            set_opacity,
            set_pinned,
            set_autostart,
            obsidian_accent,
            locate_data_folder,
            create_data_folder,
            minimize_window,
            close_window
        ])
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            let cfg = config::load(&dir);

            if let Some(window) = app.get_webview_window("main") {
                gadget::set_opacity(&window, cfg.opacity);
                if cfg.pinned {
                    gadget::set_pinned(&window, true);
                } else {
                    let _ = window.set_always_on_bottom(false);
                }
            }

            {
                use tauri_plugin_autostart::ManagerExt;
                let m = app.autolaunch();
                let _ = if cfg.autostart { m.enable() } else { m.disable() };
            }

            *app.state::<AppState>().config.lock().unwrap() = cfg;

            build_tray(app)?;
            start_scheduler(app.handle().clone());
            start_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("errore nell'avvio del widget xyz.log");
}
