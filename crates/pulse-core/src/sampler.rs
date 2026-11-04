//! The sampling engine.
//!
//! A [`Sampler`] owns every `sysinfo` handle plus the GPU and sensor
//! collectors. It is created and driven by a single background thread (the
//! Windows sensor backend holds a thread-bound COM connection), so it is
//! intentionally not `Send`-dependent.
//!
//! Cost control — the main contributors to idle CPU are kept in check by:
//! * refreshing processes in full only when the process page is visible
//!   (otherwise only Pulse's own process, plus a cheap list refresh every 5 s
//!   for the process count),
//! * refreshing disk/interface *lists* every 30 s and only counters per tick,
//! * reading sensors every `sensor_every` ticks with cached hwmon paths,
//! * caching per-interface "is virtual" lookups.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{
    Components, CpuRefreshKind, DiskKind, DiskRefreshKind, Disks, InterfaceOperationalState,
    MemoryRefreshKind, Networks, Pid, ProcessRefreshKind, ProcessStatus, ProcessesToUpdate, System,
    ThreadKind, UpdateKind, Users,
};

use crate::error::{PulseError, Result};
use crate::gpu::GpuCollector;
use crate::models::*;
use crate::platform::{self, SensorCollector};

/// What to collect on a given tick.
#[derive(Debug, Clone, Copy)]
pub struct SampleOptions {
    pub disks: bool,
    pub network: bool,
    pub gpu: bool,
    /// Poll sensors on this tick (otherwise the cached reading is returned
    /// when `sensors_enabled`).
    pub sensors_due: bool,
    pub sensors_enabled: bool,
}

impl Default for SampleOptions {
    fn default() -> Self {
        Self {
            disks: true,
            network: true,
            gpu: true,
            sensors_due: true,
            sensors_enabled: true,
        }
    }
}

const LIST_REFRESH: Duration = Duration::from_secs(30);
const PROC_COUNT_REFRESH: Duration = Duration::from_secs(5);
const USERS_REFRESH: Duration = Duration::from_secs(60);
const MAX_CMD_LEN: usize = 1024;

pub struct Sampler {
    sys: System,
    disks: Disks,
    networks: Networks,
    users: Users,
    components: Option<Components>,
    gpu: Option<GpuCollector>,
    sensors: SensorCollector,
    self_pid: Pid,
    logical_cores: usize,
    last_sample: Option<Instant>,
    last_proc_refresh: Option<Instant>,
    last_count_refresh: Option<Instant>,
    lists_refreshed: Instant,
    users_refreshed: Instant,
    virtual_cache: HashMap<String, bool>,
    cached_sensors: Option<SensorData>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sys_err(e: sysinfo::Error) -> PulseError {
    PulseError::Other(format!("system information is unavailable: {e}"))
}

fn status_name(s: ProcessStatus) -> String {
    match s {
        ProcessStatus::Run => "running".into(),
        ProcessStatus::Sleep => "sleeping".into(),
        ProcessStatus::Idle => "idle".into(),
        ProcessStatus::Stop => "stopped".into(),
        ProcessStatus::Zombie => "zombie".into(),
        ProcessStatus::Tracing => "tracing".into(),
        ProcessStatus::Dead => "dead".into(),
        other => {
            let s = format!("{other:?}");
            // e.g. UninterruptibleDiskSleep -> "uninterruptibleDiskSleep"
            let mut c = s.chars();
            match c.next() {
                Some(f) => f.to_lowercase().collect::<String>() + c.as_str(),
                None => "unknown".into(),
            }
        }
    }
}

fn state_name(s: InterfaceOperationalState) -> String {
    match s {
        InterfaceOperationalState::Up => "up",
        InterfaceOperationalState::Down => "down",
        InterfaceOperationalState::Testing => "testing",
        InterfaceOperationalState::Dormant => "dormant",
        InterfaceOperationalState::NotPresent => "notPresent",
        InterfaceOperationalState::LowerLayerDown => "lowerLayerDown",
        _ => "unknown",
    }
    .to_string()
}

impl Sampler {
    pub fn new() -> Result<Self> {
        let mut sys = System::new().map_err(sys_err)?;
        sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        sys.refresh_memory();
        let self_pid = sysinfo::get_current_pid().map_err(sys_err)?;
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        let logical_cores = sys.cpus().len().max(1);
        let disks = Disks::new_with_refreshed_list_specifics(DiskRefreshKind::everything())
            .map_err(sys_err)?;
        let networks = Networks::new_with_refreshed_list().map_err(sys_err)?;
        let users =
            Users::new_with_refreshed_list().unwrap_or_else(|_| Users::new().expect("users"));
        Ok(Self {
            sys,
            disks,
            networks,
            users,
            components: None,
            gpu: None,
            sensors: SensorCollector::new(),
            self_pid,
            logical_cores,
            last_sample: None,
            last_proc_refresh: None,
            last_count_refresh: Some(Instant::now()),
            lists_refreshed: Instant::now(),
            users_refreshed: Instant::now(),
            virtual_cache: HashMap::new(),
            cached_sensors: None,
        })
    }

    pub fn system_info(&mut self) -> SystemInfo {
        let cpu = self.sys.cpus().first();
        let gpu_backends = self.gpu.get_or_insert_with(GpuCollector::new).backends();
        SystemInfo {
            hostname: System::host_name().ok(),
            os_name: System::name().ok(),
            os_version: System::os_version().ok(),
            long_os_version: System::long_os_version().ok(),
            kernel_version: System::kernel_version().ok(),
            arch: System::cpu_arch(),
            cpu_brand: cpu
                .map(|c| c.brand().trim().to_string())
                .unwrap_or_default(),
            cpu_vendor: cpu.map(|c| c.vendor_id().to_string()).unwrap_or_default(),
            physical_cores: System::physical_core_count().ok(),
            logical_cores: self.logical_cores,
            total_memory: self.sys.total_memory(),
            total_swap: self.sys.total_swap(),
            boot_time: System::boot_time().ok(),
            gpu_backends,
            sensor_source: self.sensors.source(),
            is_elevated: platform::is_elevated(),
        }
    }

    fn is_virtual(&mut self, name: &str) -> bool {
        if let Some(v) = self.virtual_cache.get(name) {
            return *v;
        }
        let v = platform::is_virtual_interface(name);
        self.virtual_cache.insert(name.to_string(), v);
        v
    }

    /// Collect one snapshot. Rates are computed from the time elapsed since
    /// the previous call; the very first call reports zero rates.
    pub fn sample(&mut self, opts: SampleOptions) -> Snapshot {
        let now = Instant::now();
        let elapsed = self
            .last_sample
            .map(|t| now.duration_since(t).as_secs_f64())
            .unwrap_or(0.0);
        let first = self.last_sample.is_none();
        self.last_sample = Some(now);
        let rate = |bytes: u64| {
            if first || elapsed <= 0.0 {
                0.0
            } else {
                bytes as f64 / elapsed
            }
        };

        let refresh_lists = now.duration_since(self.lists_refreshed) >= LIST_REFRESH;
        if refresh_lists {
            self.lists_refreshed = now;
        }

        // CPU + memory -----------------------------------------------------
        self.sys
            .refresh_cpu_specifics(CpuRefreshKind::nothing().with_usage().with_frequency());
        self.sys
            .refresh_memory_specifics(MemoryRefreshKind::everything());
        let cpu = CpuSnapshot {
            total: self.sys.global_cpu_usage().clamp(0.0, 100.0),
            per_core: self
                .sys
                .cpus()
                .iter()
                .map(|c| c.usage().clamp(0.0, 100.0))
                .collect(),
            frequencies_mhz: self.sys.cpus().iter().map(|c| c.frequency()).collect(),
            load_avg: if cfg!(unix) {
                System::load_average()
                    .ok()
                    .map(|l| [l.one, l.five, l.fifteen])
            } else {
                None
            },
        };
        let memory = MemorySnapshot {
            total: self.sys.total_memory(),
            used: self.sys.used_memory(),
            available: self.sys.available_memory(),
            free: self.sys.free_memory(),
            swap_total: self.sys.total_swap(),
            swap_used: self.sys.used_swap(),
            breakdown: platform::memory_breakdown(),
        };

        // Own process (always) + process count (cheap, every 5 s) ------------
        let proc_fresh = self
            .last_proc_refresh
            .is_some_and(|t| now.duration_since(t) < Duration::from_millis(200));
        if !proc_fresh {
            self.sys.refresh_processes_specifics(
                ProcessesToUpdate::Some(&[self.self_pid]),
                false,
                ProcessRefreshKind::nothing().with_cpu().with_memory(),
            );
            if self
                .last_count_refresh
                .is_none_or(|t| now.duration_since(t) >= PROC_COUNT_REFRESH)
            {
                self.last_count_refresh = Some(now);
                self.sys.refresh_processes_specifics(
                    ProcessesToUpdate::All,
                    true,
                    ProcessRefreshKind::nothing(),
                );
            }
        }
        let process_count = self
            .sys
            .processes()
            .values()
            .filter(|p| p.thread_kind() != Some(ThreadKind::Userland))
            .count();
        let self_usage = self
            .sys
            .process(self.self_pid)
            .map(|p| SelfUsage {
                cpu_percent: p.cpu_usage() / self.logical_cores as f32,
                memory_bytes: p.memory(),
            })
            .unwrap_or_default();

        // Disks -------------------------------------------------------------
        let (mut disk_read_bps, mut disk_write_bps) = (0.0, 0.0);
        let disks = if opts.disks {
            if refresh_lists {
                self.disks
                    .refresh_specifics(true, DiskRefreshKind::everything());
            } else {
                self.disks.refresh_specifics(
                    false,
                    DiskRefreshKind::nothing().with_storage().with_io_usage(),
                );
            }
            let mut seen_devices = HashSet::new();
            let mut list = Vec::new();
            for d in self.disks.iter() {
                let fs = d.file_system().to_string_lossy().into_owned();
                if d.total_space() == 0 || fs == "squashfs" || fs == "overlay" {
                    continue;
                }
                let u = d.usage();
                let name = d.name().to_string_lossy().into_owned();
                let (r, w) = (rate(u.read_bytes), rate(u.written_bytes));
                // Several mount points can share a block device (btrfs
                // subvolumes, bind mounts): count its I/O once.
                if seen_devices.insert(name.clone()) {
                    disk_read_bps += r;
                    disk_write_bps += w;
                }
                list.push(DiskSnapshot {
                    name,
                    mount_point: d.mount_point().to_string_lossy().into_owned(),
                    file_system: fs,
                    kind: match d.kind() {
                        DiskKind::SSD => "ssd".into(),
                        DiskKind::HDD => "hdd".into(),
                        _ => "unknown".into(),
                    },
                    total: d.total_space(),
                    available: d.available_space(),
                    removable: d.is_removable(),
                    read_only: d.is_read_only(),
                    read_bps: r,
                    write_bps: w,
                    total_read: u.total_read_bytes,
                    total_written: u.total_written_bytes,
                });
            }
            list.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
            Some(list)
        } else {
            None
        };

        // Network -----------------------------------------------------------
        let (mut net_rx_bps, mut net_tx_bps) = (0.0, 0.0);
        let networks = if opts.network {
            self.networks.refresh(refresh_lists);
            let names: Vec<String> = self
                .networks
                .keys()
                .map(|k| k.to_string_lossy().into_owned())
                .collect();
            let virt: HashMap<String, bool> = names
                .iter()
                .map(|n| (n.clone(), self.is_virtual(n)))
                .collect();
            let mut list = Vec::new();
            for (name, n) in self.networks.iter() {
                let name = name.to_string_lossy().into_owned();
                let is_virtual = virt.get(&name).copied().unwrap_or(false);
                let is_loopback = name == "lo" || name.to_ascii_lowercase().contains("loopback");
                list.push(NetworkSnapshot {
                    rx_bps: rate(n.received()),
                    tx_bps: rate(n.transmitted()),
                    total_rx: n.total_received(),
                    total_tx: n.total_transmitted(),
                    packets_rx_ps: rate(n.packets_received()),
                    packets_tx_ps: rate(n.packets_transmitted()),
                    total_errors_rx: n.total_errors_on_received(),
                    total_errors_tx: n.total_errors_on_transmitted(),
                    mac: n.mac_address().to_string(),
                    ips: n.ip_networks().iter().map(|ip| ip.to_string()).collect(),
                    mtu: n.mtu(),
                    link_speed_bps: n.receive_link_speed().or_else(|| n.transmit_link_speed()),
                    state: state_name(n.operational_state()),
                    is_loopback,
                    is_virtual,
                    name,
                });
            }
            // Aggregate physical interfaces (like Task Manager); fall back to
            // every non-loopback interface when none is physical (VMs, containers).
            let physical: Vec<&NetworkSnapshot> = list
                .iter()
                .filter(|n| !n.is_virtual && !n.is_loopback)
                .collect();
            let pool: Vec<&NetworkSnapshot> = if physical.is_empty() {
                list.iter().filter(|n| !n.is_loopback).collect()
            } else {
                physical
            };
            net_rx_bps = pool.iter().map(|n| n.rx_bps).sum();
            net_tx_bps = pool.iter().map(|n| n.tx_bps).sum();
            list.sort_by(|a, b| {
                (a.is_loopback, a.is_virtual, &a.name).cmp(&(b.is_loopback, b.is_virtual, &b.name))
            });
            Some(list)
        } else {
            None
        };

        // GPU ---------------------------------------------------------------
        let gpus = if opts.gpu {
            Some(self.gpu.get_or_insert_with(GpuCollector::new).sample())
        } else {
            None
        };

        // Sensors -----------------------------------------------------------
        let sensors = if !opts.sensors_enabled {
            self.cached_sensors = None;
            None
        } else if opts.sensors_due || self.cached_sensors.is_none() {
            let mut data = self.sensors.read();
            if data.readings.is_empty() && data.source.is_none() {
                // No dedicated backend: fall back to sysinfo's components.
                let comps = self.components.get_or_insert_with(|| {
                    Components::new_with_refreshed_list()
                        .unwrap_or_else(|_| Components::new().expect("components"))
                });
                comps.refresh(refresh_lists);
                for (i, c) in comps.iter().enumerate() {
                    if let Some(t) = c.temperature() {
                        data.readings.push(SensorReading {
                            id: c
                                .id()
                                .map(str::to_string)
                                .unwrap_or_else(|| format!("component{i}")),
                            chip: "System".into(),
                            label: c.label().to_string(),
                            kind: SensorKind::Temperature,
                            value: t as f64,
                            unit: "°C".into(),
                            min: None,
                            max: c.max().map(f64::from),
                            critical: c.critical().map(f64::from),
                        });
                    }
                }
                if !data.readings.is_empty() {
                    data.source = Some("sysinfo components".into());
                }
            }
            // NVIDIA cards have no hwmon node: surface NVML readings here too.
            if let Some(gpus) = &gpus {
                for g in gpus.iter().filter(|g| g.backend == "nvml") {
                    let chip = format!("GPU {} · {}", g.index, g.name);
                    let mut push = |key: &str,
                                    label: &str,
                                    kind: SensorKind,
                                    value: Option<f64>,
                                    unit: &str,
                                    max: Option<f64>| {
                        if let Some(value) = value {
                            data.readings.push(SensorReading {
                                id: format!("gpu{}/{key}", g.index),
                                chip: chip.clone(),
                                label: label.into(),
                                kind,
                                value,
                                unit: unit.into(),
                                min: None,
                                max,
                                critical: None,
                            });
                        }
                    };
                    push(
                        "temp",
                        "GPU core",
                        SensorKind::Temperature,
                        g.temperature_c.map(f64::from),
                        "°C",
                        None,
                    );
                    push(
                        "power",
                        "Board power",
                        SensorKind::Power,
                        g.power_w.map(f64::from),
                        "W",
                        g.power_limit_w.map(f64::from),
                    );
                    push(
                        "fan",
                        "Fan",
                        SensorKind::Load,
                        g.fan_percent.map(f64::from),
                        "%",
                        Some(100.0),
                    );
                }
            }
            if !data.readings.is_empty()
                && data
                    .message
                    .as_deref()
                    .is_some_and(|m| m.starts_with("No hwmon"))
            {
                data.message = None;
            }
            self.cached_sensors = Some(data.clone());
            Some(data)
        } else {
            self.cached_sensors.clone()
        };

        Snapshot {
            timestamp_ms: now_ms(),
            uptime_secs: System::uptime().unwrap_or(0),
            cpu,
            memory,
            disks,
            networks,
            gpus,
            sensors,
            disk_read_bps,
            disk_write_bps,
            net_rx_bps,
            net_tx_bps,
            process_count,
            self_usage,
        }
    }

    /// Full process refresh. Call at most once per tick.
    pub fn processes(&mut self, suspended: &HashSet<u32>) -> Vec<ProcessInfo> {
        let now = Instant::now();
        let elapsed = self
            .last_proc_refresh
            .map(|t| now.duration_since(t).as_secs_f64())
            .unwrap_or(0.0);
        self.last_proc_refresh = Some(now);
        self.last_count_refresh = Some(now);

        if now.duration_since(self.users_refreshed) >= USERS_REFRESH {
            self.users.refresh();
            self.users_refreshed = now;
        }

        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing()
                .with_cpu()
                .with_memory()
                .with_disk_usage()
                .with_user(UpdateKind::OnlyIfNotSet)
                .with_cmd(UpdateKind::OnlyIfNotSet)
                .with_exe(UpdateKind::OnlyIfNotSet),
        );
        let rate = |b: u64| {
            if elapsed > 0.0 {
                b as f64 / elapsed
            } else {
                0.0
            }
        };
        let cores = self.logical_cores as f32;

        self.sys
            .processes()
            .values()
            .filter(|p| p.thread_kind() != Some(ThreadKind::Userland))
            .map(|p| {
                let pid = p.pid().as_u32();
                let user = p
                    .user_id()
                    .and_then(|uid| self.users.get_user_by_id(uid))
                    .map(|u| u.name().to_string());
                let mut cmd = p
                    .cmd()
                    .iter()
                    .map(|s| s.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(" ");
                if cmd.len() > MAX_CMD_LEN {
                    let mut cut = MAX_CMD_LEN;
                    while !cmd.is_char_boundary(cut) {
                        cut -= 1;
                    }
                    cmd.truncate(cut);
                    cmd.push('…');
                }
                let disk = p.disk_usage();
                let kernel = p.thread_kind() == Some(ThreadKind::Kernel);
                let mut status = status_name(p.status());
                if suspended.contains(&pid) && status != "stopped" {
                    status = "suspended".into();
                }
                ProcessInfo {
                    pid,
                    parent: p.parent().map(|pp| pp.as_u32()),
                    name: p.name().to_string_lossy().into_owned(),
                    is_system: platform::is_system_process(p.user_id(), user.as_deref(), kernel),
                    user,
                    cpu: (p.cpu_usage() / cores).clamp(0.0, 100.0),
                    memory: p.memory(),
                    virtual_memory: p.virtual_memory(),
                    disk_read_bps: rate(disk.read_bytes),
                    disk_write_bps: rate(disk.written_bytes),
                    status,
                    start_time: p.start_time(),
                    run_time: p.run_time(),
                    cmd,
                    exe: p.exe().map(|e| e.to_string_lossy().into_owned()),
                    threads: p.tasks().map(|t| t.len()),
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_real_system() {
        let mut s = Sampler::new().expect("sampler");
        let info = s.system_info();
        assert!(info.logical_cores >= 1);
        assert!(info.total_memory > 0);

        let first = s.sample(SampleOptions::default());
        assert_eq!(
            first.disk_read_bps, 0.0,
            "first sample has no rate baseline"
        );
        std::thread::sleep(Duration::from_millis(250));
        let snap = s.sample(SampleOptions::default());
        assert_eq!(snap.cpu.per_core.len(), info.logical_cores);
        assert!(snap.memory.total > 0);
        assert!(snap.memory.used <= snap.memory.total);
        assert!(snap.process_count > 0);
        assert!(snap.disks.is_some() && snap.networks.is_some() && snap.gpus.is_some());
        assert!(snap.sensors.is_some());

        let procs = s.processes(&HashSet::new());
        assert!(procs.iter().any(|p| p.pid == std::process::id()));
        assert!(procs.iter().all(|p| p.cpu >= 0.0 && p.cpu <= 100.0));
    }

    #[test]
    fn disabled_families_are_none() {
        let mut s = Sampler::new().unwrap();
        let snap = s.sample(SampleOptions {
            disks: false,
            network: false,
            gpu: false,
            sensors_due: false,
            sensors_enabled: false,
        });
        assert!(snap.disks.is_none() && snap.networks.is_none());
        assert!(snap.gpus.is_none() && snap.sensors.is_none());
    }

    #[test]
    fn status_names_are_camel_case() {
        assert_eq!(status_name(ProcessStatus::Run), "running");
        assert_eq!(
            status_name(ProcessStatus::UninterruptibleDiskSleep),
            "uninterruptibleDiskSleep"
        );
    }
}
