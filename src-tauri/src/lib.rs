//! Pulse desktop shell: wires the `pulse-core` engine into Tauri.

mod commands;
mod state;
mod tray;
mod worker;

use std::sync::atomic::Ordering;
use std::sync::Arc;

use pulse_core::config::Config;
use tauri::{Manager, WindowEvent};

use crate::state::{AppState, Shared, WorkerMsg};

pub fn run() {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("warn,pulse_lib=info,pulse_core=info"),
    )
    .init();

    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("cannot resolve the config directory: {e}"))?;
            let config_path = config_dir.join("config.json");
            let config = Config::load(&config_path);
            if !config_path.exists() {
                if let Err(e) = config.save(&config_path) {
                    log::warn!("could not write default config: {e}");
                }
            }

            let shared = Arc::new(Shared::new(config, config_path));
            app.manage(AppState(shared.clone()));

            match tray::create(app.handle()) {
                Ok(()) => shared.tray_available.store(true, Ordering::Relaxed),
                Err(e) => log::warn!("system tray unavailable ({e}); closing the window will quit"),
            }

            worker::spawn(app.handle().clone(), shared);
            Ok(())
        })
        .on_window_event(|window, event| {
            // With close-to-tray, the window (and its webview process) is
            // destroyed rather than hidden, releasing its memory. The app-exit
            // request that follows is vetoed in `run` below, and the tray
            // re-creates the window on demand.
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                // Nobody is looking at the process table any more.
                state.0.process_streaming.store(false, Ordering::Relaxed);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::get_snapshot,
            commands::get_history,
            commands::clear_history,
            commands::get_processes,
            commands::set_process_streaming,
            commands::kill_process,
            commands::suspend_process,
            commands::resume_process,
            commands::set_process_priority,
            commands::get_process_priority,
            commands::get_config,
            commands::update_config,
            commands::get_connections,
            commands::scan_directory,
            commands::export_metrics,
            commands::get_paths,
            commands::get_alert_events,
            commands::clear_alert_events,
            commands::get_alert_status,
            commands::send_test_notification,
            commands::get_app_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Pulse")
        .run(|app, event| match event {
            // `code: None` = the last window was closed by the user (not Quit).
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } => {
                if let Some(state) = app.try_state::<AppState>() {
                    let keep = state.0.config.read().monitoring.close_to_tray
                        && state.0.tray_available.load(Ordering::Relaxed);
                    if keep {
                        api.prevent_exit();
                    }
                }
            }
            tauri::RunEvent::Exit => {
                if let Some(state) = app.try_state::<AppState>() {
                    state.0.notify_worker(WorkerMsg::Shutdown);
                }
            }
            _ => {}
        });
}
