//! System tray icon with live quick stats.
//!
//! Linux needs an AppIndicator/StatusNotifier host (libayatana-appindicator).
//! When the tray cannot be created Pulse keeps working, and closing the window
//! quits the app instead of hiding it, so it can never become unreachable.

use pulse_core::models::Snapshot;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindowBuilder, Wry};

pub const TRAY_ID: &str = "pulse-tray";

/// Menu items whose text is refreshed with live stats.
pub struct TrayItems {
    pub cpu: MenuItem<Wry>,
    pub mem: MenuItem<Wry>,
    pub net: MenuItem<Wry>,
}

/// Show the main window, re-creating it if it was released to the tray.
pub fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // Closing to the tray destroys the webview to free its memory; rebuild it
    // from the window definition in tauri.conf.json. The UI re-seeds its
    // charts from the backend history, so nothing is lost.
    let Some(config) = app.config().app.windows.iter().find(|w| w.label == "main") else {
        log::error!("no `main` window in tauri.conf.json");
        return;
    };
    match WebviewWindowBuilder::from_config(app, config).and_then(|b| b.build()) {
        Ok(w) => {
            let _ = w.set_focus();
        }
        Err(e) => log::error!("could not re-create the main window: {e}"),
    }
}

fn toggle_main_window(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(w) if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) => {
            let _ = w.close();
        }
        _ => show_main_window(app),
    }
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let cpu = MenuItem::with_id(app, "stat-cpu", "CPU —", false, None::<&str>)?;
    let mem = MenuItem::with_id(app, "stat-mem", "Memory —", false, None::<&str>)?;
    let net = MenuItem::with_id(app, "stat-net", "Network —", false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Pulse", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Pulse", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &cpu,
            &mem,
            &net,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Pulse")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(TrayItems { cpu, mem, net });
    Ok(())
}

fn gib(b: u64) -> f64 {
    b as f64 / 1024f64.powi(3)
}

pub fn rate(bps: f64) -> String {
    const UNITS: [&str; 5] = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    let mut v = bps.max(0.0);
    let mut i = 0;
    while v >= 1024.0 && i < UNITS.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 {
        format!("{v:.0} {}", UNITS[i])
    } else {
        format!("{v:.1} {}", UNITS[i])
    }
}

pub fn update(app: &AppHandle, s: &Snapshot) {
    let cpu = format!("CPU {:.0}%", s.cpu.total);
    let mem = format!(
        "Memory {:.1} / {:.1} GiB",
        gib(s.memory.used),
        gib(s.memory.total)
    );
    let net = format!("Network ↓ {}  ↑ {}", rate(s.net_rx_bps), rate(s.net_tx_bps));
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.cpu.set_text(&cpu);
        let _ = items.mem.set_text(&mem);
        let _ = items.net.set_text(&net);
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(format!("Pulse — {cpu} · {mem}")));
    }
}

#[cfg(test)]
mod tests {
    use super::rate;

    #[test]
    fn formats_rates() {
        assert_eq!(rate(0.0), "0 B/s");
        assert_eq!(rate(1536.0), "1.5 KB/s");
        assert_eq!(rate(5.0 * 1024.0 * 1024.0), "5.0 MB/s");
    }
}
