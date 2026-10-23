//! Comportamento "gadget da desktop" su Windows: opacità della finestra e
//! aggancio al livello del wallpaper (WorkerW) così che il widget resti visibile
//! anche con "mostra desktop" e non compaia nella barra delle applicazioni
//! (skip_taskbar + alwaysOnBottom sono già impostati in tauri.conf.json).
//!
//! NB: le API Win32 cambiano tra le versioni del crate `windows`; se la build
//! segnala differenze di firma, è qui che vanno allineate. Fuori da Windows
//! tutte le funzioni sono no-op, così il codice resta multipiattaforma.

use tauri::WebviewWindow;

pub fn set_opacity(window: &WebviewWindow, pct: u32) {
    #[cfg(windows)]
    {
        if let Ok(h) = window.hwnd() {
            win::set_opacity(h.0 as isize, pct);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (window, pct);
    }
}

pub fn set_pinned(window: &WebviewWindow, on: bool) {
    // in modalità gadget la finestra resta in fondo (sul desktop); disattivandola
    // torna normale. Si tiene l'icona nella taskbar così non va mai "persa".
    let _ = window.set_always_on_bottom(on);
    #[cfg(windows)]
    {
        if let Ok(h) = window.hwnd() {
            win::set_pinned(h.0 as isize, on);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (window, on);
    }
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{BOOL, COLORREF, HWND, LPARAM, TRUE, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetWindowLongPtrW, SendMessageTimeoutW,
        SetLayeredWindowAttributes, SetParent, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA,
        SMTO_NORMAL, WS_EX_LAYERED,
    };

    static WORKERW: AtomicIsize = AtomicIsize::new(0);

    pub fn set_opacity(hwnd: isize, pct: u32) {
        let hwnd = HWND(hwnd as *mut _);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | (WS_EX_LAYERED.0 as isize));
            let alpha = ((pct.min(100) * 255) / 100) as u8;
            let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA);
        }
    }

    unsafe extern "system" fn enum_proc(top: HWND, _l: LPARAM) -> BOOL {
        let shell = FindWindowExW(top, HWND(std::ptr::null_mut()), w!("SHELLDLL_DefView"), PCWSTR::null());
        if let Ok(sh) = shell {
            if !sh.0.is_null() {
                if let Ok(worker) =
                    FindWindowExW(HWND(std::ptr::null_mut()), top, w!("WorkerW"), PCWSTR::null())
                {
                    WORKERW.store(worker.0 as isize, Ordering::SeqCst);
                }
            }
        }
        TRUE
    }

    pub fn set_pinned(hwnd: isize, on: bool) {
        let hwnd = HWND(hwnd as *mut _);
        unsafe {
            if on {
                // chiede a Progman di creare il WorkerW dietro le icone del desktop
                if let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) {
                    let mut res: usize = 0;
                    let _ = SendMessageTimeoutW(
                        progman,
                        0x052C,
                        WPARAM(0),
                        LPARAM(0),
                        SMTO_NORMAL,
                        1000,
                        Some(&mut res as *mut usize),
                    );
                }
                WORKERW.store(0, Ordering::SeqCst);
                let _ = EnumWindows(Some(enum_proc), LPARAM(0));
                let w = WORKERW.load(Ordering::SeqCst);
                if w != 0 {
                    let _ = SetParent(hwnd, HWND(w as *mut _));
                }
            } else {
                // stacca dal wallpaper: torna finestra normale (sempre in fondo)
                let _ = SetParent(hwnd, HWND(std::ptr::null_mut()));
            }
        }
    }
}
