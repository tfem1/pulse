//! Persistent configuration.
//!
//! Stored as pretty JSON in the platform config directory
//! (`~/.config/dev.pulse.app/config.json` on Linux,
//! `%APPDATA%\dev.pulse.app\config.json` on Windows). Every field has a
//! default so that older or hand-edited files keep loading; values are clamped
//! by [`Config::sanitized`] so a bad file can never put the sampler in a
//! pathological state.
//!
//! Appearance settings (theme, accent, density, language) intentionally live
//! in the webview's localStorage so the first paint already uses the right
//! theme without waiting for IPC.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::alerts::AlertRule;
use crate::error::{PulseError, Result};

pub const MIN_REFRESH_MS: u64 = 250;
pub const MAX_REFRESH_MS: u64 = 10_000;
pub const MIN_HISTORY_MINUTES: u32 = 1;
pub const MAX_HISTORY_MINUTES: u32 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MonitoringConfig {
    pub refresh_ms: u64,
    pub history_minutes: u32,
    pub sample_disks: bool,
    pub sample_network: bool,
    pub sample_gpu: bool,
    pub sample_sensors: bool,
    /// Sensors are slower to read; poll them every N samples.
    pub sensor_every: u32,
    pub close_to_tray: bool,
    pub tray_stats: bool,
}

impl Default for MonitoringConfig {
    fn default() -> Self {
        Self {
            refresh_ms: 1000,
            history_minutes: 15,
            sample_disks: true,
            sample_network: true,
            sample_gpu: true,
            sample_sensors: true,
            sensor_every: 2,
            close_to_tray: true,
            tray_stats: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProcessConfig {
    /// Column key used by the UI ("cpu", "memory", "name", "pid", ...).
    pub default_sort: String,
    pub sort_descending: bool,
    pub confirm_kill: bool,
    pub show_system: bool,
    pub tree_view: bool,
}

impl Default for ProcessConfig {
    fn default() -> Self {
        Self {
            default_sort: "cpu".into(),
            sort_descending: true,
            confirm_kill: true,
            show_system: true,
            tree_view: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationConfig {
    pub enabled: bool,
    pub quiet_hours_enabled: bool,
    /// "HH:MM", local time.
    pub quiet_start: String,
    /// "HH:MM", local time.
    pub quiet_end: String,
    /// Default thresholds used to pre-fill new rules.
    pub cpu_threshold: f64,
    pub memory_threshold: f64,
    pub temperature_threshold: f64,
    pub default_cooldown_secs: u32,
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            quiet_hours_enabled: false,
            quiet_start: "22:00".into(),
            quiet_end: "07:00".into(),
            cpu_threshold: 90.0,
            memory_threshold: 90.0,
            temperature_threshold: 85.0,
            default_cooldown_secs: 300,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AboutConfig {
    /// Off by default: Pulse makes no network calls unless this is enabled.
    pub update_check: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub version: u32,
    pub monitoring: MonitoringConfig,
    pub processes: ProcessConfig,
    pub notifications: NotificationConfig,
    pub alerts: Vec<AlertRule>,
    pub about: AboutConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            monitoring: MonitoringConfig::default(),
            processes: ProcessConfig::default(),
            notifications: NotificationConfig::default(),
            alerts: crate::alerts::default_rules(),
            about: AboutConfig::default(),
        }
    }
}

fn valid_hhmm(s: &str) -> bool {
    chrono::NaiveTime::parse_from_str(s, "%H:%M").is_ok()
}

impl Config {
    /// Return a copy with every value forced into its valid range.
    pub fn sanitized(mut self) -> Self {
        let m = &mut self.monitoring;
        m.refresh_ms = m.refresh_ms.clamp(MIN_REFRESH_MS, MAX_REFRESH_MS);
        m.history_minutes = m
            .history_minutes
            .clamp(MIN_HISTORY_MINUTES, MAX_HISTORY_MINUTES);
        m.sensor_every = m.sensor_every.clamp(1, 30);

        let n = &mut self.notifications;
        if !valid_hhmm(&n.quiet_start) {
            n.quiet_start = NotificationConfig::default().quiet_start;
        }
        if !valid_hhmm(&n.quiet_end) {
            n.quiet_end = NotificationConfig::default().quiet_end;
        }
        n.cpu_threshold = n.cpu_threshold.clamp(1.0, 100.0);
        n.memory_threshold = n.memory_threshold.clamp(1.0, 100.0);
        n.temperature_threshold = n.temperature_threshold.clamp(20.0, 150.0);
        n.default_cooldown_secs = n.default_cooldown_secs.min(86_400);

        let mut seen = std::collections::HashSet::new();
        self.alerts
            .retain(|r| !r.id.is_empty() && seen.insert(r.id.clone()));
        for r in &mut self.alerts {
            r.duration_secs = r.duration_secs.min(3600);
            r.cooldown_secs = r.cooldown_secs.min(86_400);
            if !r.threshold.is_finite() {
                r.threshold = 0.0;
            }
        }
        self
    }

    /// Number of samples the history ring buffer must hold.
    pub fn history_capacity(&self) -> usize {
        let ms = self.monitoring.history_minutes as u64 * 60_000;
        (ms / self.monitoring.refresh_ms.max(1)).max(60) as usize
    }

    /// Load from `path`. A missing file yields defaults; a corrupt file is
    /// backed up next to the original and replaced by defaults, so the app
    /// always starts.
    pub fn load(path: &Path) -> Config {
        match fs::read_to_string(path) {
            Ok(text) => match serde_json::from_str::<Config>(&text) {
                Ok(cfg) => cfg.sanitized(),
                Err(e) => {
                    log::warn!(
                        "config at {} is invalid ({e}); using defaults",
                        path.display()
                    );
                    let backup = path.with_extension("json.bak");
                    let _ = fs::rename(path, backup);
                    Config::default()
                }
            },
            Err(_) => Config::default(),
        }
    }

    /// Atomically write the config (write to a temp file, then rename).
    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp: PathBuf = path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(self)
            .map_err(|e| PulseError::Other(format!("cannot serialise config: {e}")))?;
        fs::write(&tmp, text)?;
        fs::rename(&tmp, path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_out_of_range_values() {
        let mut c = Config::default();
        c.monitoring.refresh_ms = 1;
        c.monitoring.history_minutes = 10_000;
        c.notifications.quiet_start = "25:99".into();
        let c = c.sanitized();
        assert_eq!(c.monitoring.refresh_ms, MIN_REFRESH_MS);
        assert_eq!(c.monitoring.history_minutes, MAX_HISTORY_MINUTES);
        assert_eq!(c.notifications.quiet_start, "22:00");
    }

    #[test]
    fn history_capacity_matches_window() {
        let c = Config::default();
        assert_eq!(c.history_capacity(), 15 * 60);
    }

    #[test]
    fn partial_json_uses_defaults() {
        let c: Config = serde_json::from_str(r#"{"monitoring":{"refreshMs":2000}}"#).unwrap();
        assert_eq!(c.monitoring.refresh_ms, 2000);
        assert!(c.processes.confirm_kill);
        assert!(!c.about.update_check, "update check must be off by default");
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("config.json");
        let mut c = Config::default();
        c.monitoring.refresh_ms = 2000;
        c.save(&path).unwrap();
        assert_eq!(Config::load(&path), c);
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        fs::write(&path, "{not json").unwrap();
        assert_eq!(Config::load(&path), Config::default());
        assert!(dir.path().join("config.json.bak").exists());
    }
}
