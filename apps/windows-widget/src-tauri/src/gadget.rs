//! "Desktop gadget" behavior on Windows: window opacity and pinning to the
//! wallpaper layer (WorkerW) so the widget stays visible even with "show desktop"
//! and doesn't appear in the taskbar (skip_taskbar + alwaysOnBottom are already
//! set in tauri.conf.json).
//!
//! NB: the Win32 APIs change between versions of the `windows` crate; if the build
//! reports signature differences, this is where to align them. Outside Windows all
//! functions are no-ops, so the code stays cross-platform.

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
    // in gadget mode the window stays at the bottom (on the desktop); turning it
    // off makes it normal again. The taskbar icon is kept so it's never "lost".
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
                // ask Progman to create the WorkerW behind the desktop icons
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
                // detach from the wallpaper: back to a normal window (still at the bottom)
                let _ = SetParent(hwnd, HWND(std::ptr::null_mut()));
            }
        }
    }
}
