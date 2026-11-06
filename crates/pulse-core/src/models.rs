//! Typed data models exchanged between the backend and the UI.
//!
//! Every struct is serialised in camelCase so it maps 1:1 onto the
//! TypeScript definitions in `src/lib/types.ts`. Values that a platform cannot
//! provide are `Option`s (rendered as "unavailable" in the UI) rather than
//! zeroes, so the UI can degrade gracefully instead of showing fake data.

use serde::{Deserialize, Serialize};

/// Static information about the machine, collected once at startup.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub long_os_version: Option<String>,
    pub kernel_version: Option<String>,
    pub arch: String,
    pub cpu_brand: String,
    pub cpu_vendor: String,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
    pub total_memory: u64,
    pub total_swap: u64,
    pub boot_time: Option<u64>,
    pub gpu_backends: Vec<String>,
    pub sensor_source: Option<String>,
    pub is_elevated: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CpuSnapshot {
    /// Total utilisation in percent (0-100).
    pub total: f32,
    /// Per logical core utilisation in percent (0-100).
    pub per_core: Vec<f32>,
    /// Per logical core frequency in MHz (0 when unknown).
    pub frequencies_mhz: Vec<u64>,
    /// 1, 5 and 15 minute load average (Unix only).
    pub load_avg: Option<[f64; 3]>,
}

/// Extra memory detail that only some platforms expose.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryBreakdown {
    pub cached: Option<u64>,
    pub buffers: Option<u64>,
    pub shared: Option<u64>,
    pub committed: Option<u64>,
    pub commit_limit: Option<u64>,
    pub kernel: Option<u64>,
    pub dirty: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub free: u64,
    pub swap_total: u64,
    pub swap_used: u64,
    pub breakdown: Option<MemoryBreakdown>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSnapshot {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    /// "ssd", "hdd" or "unknown".
    pub kind: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
    pub read_only: bool,
    pub read_bps: f64,
    pub write_bps: f64,
    pub total_read: u64,
    pub total_written: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSnapshot {
    pub name: String,
    pub rx_bps: f64,
    pub tx_bps: f64,
    pub total_rx: u64,
    pub total_tx: u64,
    pub packets_rx_ps: f64,
    pub packets_tx_ps: f64,
    pub total_errors_rx: u64,
    pub total_errors_tx: u64,
    pub mac: String,
    pub ips: Vec<String>,
    pub mtu: u64,
    pub link_speed_bps: Option<u64>,
    /// "up", "down", "unknown", ...
    pub state: String,
    pub is_loopback: bool,
    pub is_virtual: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuSnapshot {
    pub index: u32,
    pub name: String,
    pub vendor: String,
    /// Which backend produced the data ("nvml", "sysinfo", ...).
    pub backend: String,
    pub usage: Option<f32>,
    pub memory_used: Option<u64>,
    pub memory_total: Option<u64>,
    pub temperature_c: Option<f32>,
    pub power_w: Option<f32>,
    pub power_limit_w: Option<f32>,
    pub fan_percent: Option<u32>,
    pub clock_mhz: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum SensorKind {
    Temperature,
    Fan,
    Voltage,
    Power,
    Current,
    Load,
    Clock,
    Other,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    /// Stable identifier, unique within a sample.
    pub id: String,
    /// Chip / hardware group (e.g. "coretemp", "nct6798", "AMD Ryzen 7").
    pub chip: String,
    pub label: String,
    pub kind: SensorKind,
    pub value: f64,
    /// Display unit: "°C", "RPM", "V", "W", "A", "%", "MHz".
    pub unit: String,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub critical: Option<f64>,
}

/// Result of a sensor poll. `message` explains why the list may be empty.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SensorData {
    pub readings: Vec<SensorReading>,
    pub source: Option<String>,
    pub message: Option<String>,
}

/// Resource usage of Pulse itself, so users can verify the overhead.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SelfUsage {
    pub cpu_percent: f32,
    pub memory_bytes: u64,
}

/// One live sample of the whole machine.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub timestamp_ms: u64,
    pub uptime_secs: u64,
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    /// `None` when disk sampling is disabled.
    pub disks: Option<Vec<DiskSnapshot>>,
    /// `None` when network sampling is disabled.
    pub networks: Option<Vec<NetworkSnapshot>>,
    /// `None` when GPU polling is disabled.
    pub gpus: Option<Vec<GpuSnapshot>>,
    /// `None` when sensor polling is disabled.
    pub sensors: Option<SensorData>,
    pub disk_read_bps: f64,
    pub disk_write_bps: f64,
    pub net_rx_bps: f64,
    pub net_tx_bps: f64,
    pub process_count: usize,
    pub self_usage: SelfUsage,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent: Option<u32>,
    pub name: String,
    pub user: Option<String>,
    /// CPU usage normalised to the whole machine (0-100).
    pub cpu: f32,
    pub memory: u64,
    pub virtual_memory: u64,
    pub disk_read_bps: f64,
    pub disk_write_bps: f64,
    pub status: String,
    pub start_time: u64,
    pub run_time: u64,
    pub cmd: String,
    pub exe: Option<String>,
    pub threads: Option<usize>,
    pub is_system: bool,
    /// A user-facing application: owns a window (Windows) or uses a GUI
    /// toolkit (Linux). Drives the "Apps" view.
    pub gui: bool,
    /// Title of its main window, when known (Windows).
    pub title: Option<String>,
}

/// Process scheduling priority, mapped to nice values on Unix and to
/// priority classes on Windows.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Priority {
    Idle,
    BelowNormal,
    Normal,
    AboveNormal,
    High,
    Realtime,
}

impl Priority {
    /// Unix nice value used for this priority.
    pub fn nice(self) -> i32 {
        match self {
            Priority::Idle => 19,
            Priority::BelowNormal => 10,
            Priority::Normal => 0,
            Priority::AboveNormal => -5,
            Priority::High => -10,
            Priority::Realtime => -20,
        }
    }

    /// Closest priority for a given nice value.
    pub fn from_nice(nice: i32) -> Self {
        match nice {
            n if n >= 15 => Priority::Idle,
            n if n >= 5 => Priority::BelowNormal,
            n if n > -3 => Priority::Normal,
            n if n > -8 => Priority::AboveNormal,
            n if n > -15 => Priority::High,
            _ => Priority::Realtime,
        }
    }
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListeningPort {
    pub protocol: String,
    pub address: String,
    pub port: u16,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSummary {
    /// TCP connection count per state name ("ESTABLISHED", "LISTEN", ...).
    pub tcp_states: Vec<(String, u32)>,
    pub tcp_total: u32,
    pub tcp6_total: u32,
    pub udp_total: u32,
    pub udp6_total: u32,
    pub listening: Vec<ListeningPort>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntrySize {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub items: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub path: String,
    pub total_size: u64,
    pub total_items: u64,
    pub entries: Vec<DirEntrySize>,
    /// True when the scan hit the item or time limit.
    pub truncated: bool,
    /// Number of entries that could not be read (permissions, races).
    pub errors: u64,
    pub elapsed_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nice_round_trip() {
        for p in [
            Priority::Idle,
            Priority::BelowNormal,
            Priority::Normal,
            Priority::AboveNormal,
            Priority::High,
            Priority::Realtime,
        ] {
            assert_eq!(Priority::from_nice(p.nice()), p);
        }
    }

    #[test]
    fn snapshot_serialises_camel_case() {
        let v = serde_json::to_value(Snapshot::default()).unwrap();
        assert!(v.get("timestampMs").is_some());
        assert!(v.get("diskReadBps").is_some());
        assert!(v["cpu"].get("perCore").is_some());
    }
}
