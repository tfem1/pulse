//! Tauri commands — the IPC surface used by `src/lib/api.ts`.
//!
//! Every fallible command returns `Result<T, PulseError>`; the error is
//! serialised as `{ kind, message }` so the UI can show precise messages
//! (permission denied, process gone, unsupported...).

use std::path::PathBuf;
use std::sync::atomic::Ordering;

use pulse_core::alerts::{AlertEvent, RuleStatus};
use pulse_core::apps;
use pulse_core::config::Config;
use pulse_core::export::{self, ExportFormat};
use pulse_core::history::HistoryPoint;
use pulse_core::models::{
    ConnectionSummary, Priority, ProcessInfo, ScanResult, Snapshot, SystemInfo,
};
use pulse_core::storage::{self, ScanLimits};
use pulse_core::{platform, PulseError};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::state::{AppState, WorkerMsg};

type CmdResult<T> = Result<T, PulseError>;

#[tauri::command]
pub fn get_system_info(state: State<'_, AppState>) -> Option<SystemInfo> {
    state.0.system_info.read().clone()
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Option<Snapshot> {
    state.0.snapshot.read().as_ref().map(|s| s.as_ref().clone())
}

#[tauri::command]
pub fn get_history(state: State<'_, AppState>, since_ms: Option<u64>) -> Vec<HistoryPoint> {
    state.0.history.read().since(since_ms)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) {
    state.0.history.write().clear();
}

#[tauri::command]
pub fn get_processes(state: State<'_, AppState>) -> Vec<ProcessInfo> {
    state.0.processes.read().as_ref().clone()
}

/// The process page calls this on mount/unmount so full process refreshes
/// (the most expensive part of sampling) only happen while it is visible.
#[tauri::command]
pub fn set_process_streaming(state: State<'_, AppState>, enabled: bool) {
    let was = state.0.process_streaming.swap(enabled, Ordering::Relaxed);
    if enabled && !was {
        state.0.notify_worker(WorkerMsg::SampleNow);
    }
}

#[tauri::command]
pub fn kill_process(pid: u32, force: bool) -> CmdResult<()> {
    platform::kill_process(pid, force)
}

/// End a whole application (Apps view). `pids`: every process of the app,
/// root first; `primary`: the window owners to ask to close first. Without
/// `force`, survivors are terminated after a 5 s grace period.
#[tauri::command]
pub async fn end_app(
    pids: Vec<u32>,
    primary: Vec<u32>,
    force: bool,
) -> CmdResult<apps::EndAppOutcome> {
    tauri::async_runtime::spawn_blocking(move || {
        apps::end_app(&pids, &primary, force, apps::DEFAULT_GRACE)
    })
    .await
    .map_err(|e| PulseError::Other(e.to_string()))?
}

#[tauri::command]
pub fn suspend_process(state: State<'_, AppState>, pid: u32) -> CmdResult<()> {
    platform::suspend_process(pid)?;
    state.0.suspended.lock().insert(pid);
    Ok(())
}

#[tauri::command]
pub fn resume_process(state: State<'_, AppState>, pid: u32) -> CmdResult<()> {
    platform::resume_process(pid)?;
    state.0.suspended.lock().remove(&pid);
    Ok(())
}

#[tauri::command]
pub fn set_process_priority(pid: u32, priority: Priority) -> CmdResult<()> {
    platform::set_priority(pid, priority)
}

#[tauri::command]
pub fn get_process_priority(pid: u32) -> CmdResult<Priority> {
    platform::get_priority(pid)
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.0.config.read().clone()
}

/// Validate, persist and apply a new configuration. Returns the sanitised
/// version actually stored, so the UI reflects clamped values.
#[tauri::command]
pub fn update_config(state: State<'_, AppState>, config: Config) -> CmdResult<Config> {
    let config = config.sanitized();
    config.save(&state.0.config_path)?;
    *state.0.config.write() = config.clone();
    state.0.notify_worker(WorkerMsg::ConfigChanged);
    Ok(config)
}

#[tauri::command]
pub async fn get_connections() -> CmdResult<ConnectionSummary> {
    tauri::async_runtime::spawn_blocking(platform::connections)
        .await
        .map_err(|e| PulseError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn scan_directory(path: String) -> CmdResult<ScanResult> {
    let path = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || {
        storage::scan_directory(&path, ScanLimits::default())
    })
    .await
    .map_err(|e| PulseError::Other(e.to_string()))?
}

#[tauri::command]
pub fn export_metrics(
    state: State<'_, AppState>,
    path: String,
    format: ExportFormat,
) -> CmdResult<usize> {
    if path.trim().is_empty() {
        return Err(PulseError::InvalidInput("no export path given".into()));
    }
    let points = state.0.history.read().since(None);
    if points.is_empty() {
        return Err(PulseError::InvalidInput(
            "there is no history to export yet".into(),
        ));
    }
    export::export_to_file(&points, &PathBuf::from(path), format)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub config_file: String,
    pub config_dir: String,
}

#[tauri::command]
pub fn get_paths(state: State<'_, AppState>) -> AppPaths {
    let file = &state.0.config_path;
    AppPaths {
        config_file: file.to_string_lossy().into_owned(),
        config_dir: file
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}

#[tauri::command]
pub fn get_alert_events(state: State<'_, AppState>) -> Vec<AlertEvent> {
    state.0.alert_events.lock().iter().cloned().collect()
}

#[tauri::command]
pub fn clear_alert_events(state: State<'_, AppState>) {
    state.0.alert_events.lock().clear();
}

#[tauri::command]
pub fn get_alert_status(state: State<'_, AppState>) -> Vec<RuleStatus> {
    state.0.alert_status.read().clone()
}

#[tauri::command]
pub fn send_test_notification(app: AppHandle, title: String, body: String) -> CmdResult<()> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| PulseError::Other(format!("the desktop refused the notification: {e}")))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri_version: String,
    pub target_os: String,
    pub target_arch: String,
    pub debug: bool,
    pub tray_available: bool,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        target_os: std::env::consts::OS.to_string(),
        target_arch: std::env::consts::ARCH.to_string(),
        debug: cfg!(debug_assertions),
        tray_available: state.0.tray_available.load(Ordering::Relaxed),
    }
}
