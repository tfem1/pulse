//! Linux implementation: procfs and sysfs.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::error::{PulseError, Result};
use crate::models::{
    ConnectionSummary, ListeningPort, MemoryBreakdown, SensorData, SensorKind, SensorReading,
};

pub use super::unix_proc::{
    get_priority, is_elevated, kill_process, resume_process, set_priority, suspend_process,
};

// ---------------------------------------------------------------- memory ---

/// Parse `/proc/meminfo` content (values are in kB).
pub fn parse_meminfo(text: &str) -> MemoryBreakdown {
    let mut map: HashMap<&str, u64> = HashMap::new();
    for line in text.lines() {
        let Some((key, rest)) = line.split_once(':') else {
            continue;
        };
        let Some(num) = rest.split_whitespace().next() else {
            continue;
        };
        if let Ok(v) = num.parse::<u64>() {
            map.insert(key.trim(), v * 1024);
        }
    }
    let get = |k: &str| map.get(k).copied();
    let cached = match (get("Cached"), get("SReclaimable")) {
        (Some(c), Some(s)) => Some(c + s),
        (c, _) => c,
    };
    let kernel = match (get("Slab"), get("KernelStack"), get("PageTables")) {
        (Some(a), b, c) => Some(a + b.unwrap_or(0) + c.unwrap_or(0)),
        _ => None,
    };
    MemoryBreakdown {
        cached,
        buffers: get("Buffers"),
        shared: get("Shmem"),
        committed: get("Committed_AS"),
        commit_limit: get("CommitLimit"),
        kernel,
        dirty: get("Dirty"),
    }
}

pub fn memory_breakdown() -> Option<MemoryBreakdown> {
    fs::read_to_string("/proc/meminfo")
        .ok()
        .map(|t| parse_meminfo(&t))
}

// ----------------------------------------------------------- connections ---

fn parse_hex_ipv4(hex: &str) -> Option<String> {
    let v = u32::from_str_radix(hex, 16).ok()?;
    // Stored in host (little-endian) byte order by the kernel.
    Some(std::net::Ipv4Addr::from(v.to_le_bytes()).to_string())
}

fn parse_hex_ipv6(hex: &str) -> Option<String> {
    if hex.len() != 32 {
        return None;
    }
    let mut bytes = [0u8; 16];
    // Four 32-bit words, each in host byte order.
    for word in 0..4 {
        let w = u32::from_str_radix(&hex[word * 8..word * 8 + 8], 16).ok()?;
        bytes[word * 4..word * 4 + 4].copy_from_slice(&w.to_le_bytes());
    }
    Some(std::net::Ipv6Addr::from(bytes).to_string())
}

/// One parsed row of `/proc/net/{tcp,udp}{,6}`: (local addr, port, state).
pub fn parse_proc_net(text: &str, v6: bool) -> Vec<(String, u16, u32)> {
    text.lines()
        .skip(1)
        .filter_map(|line| {
            let mut cols = line.split_whitespace();
            let _slot = cols.next()?;
            let local = cols.next()?;
            let _remote = cols.next()?;
            let state = u32::from_str_radix(cols.next()?, 16).ok()?;
            let (addr, port) = local.split_once(':')?;
            let port = u16::from_str_radix(port, 16).ok()?;
            let addr = if v6 {
                parse_hex_ipv6(addr)?
            } else {
                parse_hex_ipv4(addr)?
            };
            Some((addr, port, state))
        })
        .collect()
}

pub fn connections() -> Result<ConnectionSummary> {
    let read = |name: &str| fs::read_to_string(format!("/proc/net/{name}")).unwrap_or_default();
    let tcp = parse_proc_net(&read("tcp"), false);
    let tcp6 = parse_proc_net(&read("tcp6"), true);
    let udp = parse_proc_net(&read("udp"), false);
    let udp6 = parse_proc_net(&read("udp6"), true);
    if tcp.is_empty()
        && tcp6.is_empty()
        && udp.is_empty()
        && udp6.is_empty()
        && !Path::new("/proc/net/tcp").exists()
    {
        return Err(PulseError::Unsupported("/proc/net is not readable".into()));
    }

    let mut states: HashMap<&'static str, u32> = HashMap::new();
    let mut listening = Vec::new();
    for (proto, rows) in [("tcp", &tcp), ("tcp6", &tcp6)] {
        for (addr, port, st) in rows {
            *states.entry(super::tcp_state_name(*st, false)).or_default() += 1;
            if *st == 0x0A {
                listening.push(ListeningPort {
                    protocol: proto.into(),
                    address: addr.clone(),
                    port: *port,
                    pid: None,
                });
            }
        }
    }
    // UDP sockets in state 07 (unconnected) bound to a port are "listening".
    for (proto, rows) in [("udp", &udp), ("udp6", &udp6)] {
        for (addr, port, st) in rows {
            if *st == 0x07 && *port != 0 {
                listening.push(ListeningPort {
                    protocol: proto.into(),
                    address: addr.clone(),
                    port: *port,
                    pid: None,
                });
            }
        }
    }
    listening.sort_by(|a, b| {
        a.port
            .cmp(&b.port)
            .then_with(|| a.protocol.cmp(&b.protocol))
    });
    listening
        .dedup_by(|a, b| a.port == b.port && a.protocol == b.protocol && a.address == b.address);
    listening.truncate(200);

    Ok(ConnectionSummary {
        tcp_states: super::sorted_states(states),
        tcp_total: tcp.len() as u32,
        tcp6_total: tcp6.len() as u32,
        udp_total: udp.len() as u32,
        udp6_total: udp6.len() as u32,
        listening,
    })
}

// --------------------------------------------------------------- network ---

pub fn is_virtual_interface(name: &str) -> bool {
    if name == "lo" {
        return true;
    }
    // Physical NICs have a `device` link; bridges, veths, tun/tap, docker,
    // wireguard... do not.
    !Path::new("/sys/class/net")
        .join(name)
        .join("device")
        .exists()
}

pub fn is_system_process(
    uid: Option<&sysinfo::Uid>,
    _user: Option<&str>,
    kernel_thread: bool,
) -> bool {
    // Kernel threads, root and system accounts (UID < 1000 on most distros).
    kernel_thread || uid.is_none_or(|u| **u < 1000)
}

// --------------------------------------------------------------- sensors ---

#[derive(Debug, Clone)]
struct HwmonChannel {
    id: String,
    chip: String,
    label: String,
    kind: SensorKind,
    input: PathBuf,
    min: Option<f64>,
    max: Option<f64>,
    critical: Option<f64>,
}

impl HwmonChannel {
    fn scale(&self) -> f64 {
        match self.kind {
            SensorKind::Temperature | SensorKind::Voltage | SensorKind::Current => 1000.0,
            SensorKind::Power => 1_000_000.0,
            _ => 1.0,
        }
    }

    fn unit(&self) -> &'static str {
        match self.kind {
            SensorKind::Temperature => "°C",
            SensorKind::Fan => "RPM",
            SensorKind::Voltage => "V",
            SensorKind::Power => "W",
            SensorKind::Current => "A",
            _ => "",
        }
    }
}

fn read_trim(p: &Path) -> Option<String> {
    fs::read_to_string(p).ok().map(|s| s.trim().to_string())
}

fn read_num(p: &Path) -> Option<f64> {
    read_trim(p)?.parse::<f64>().ok()
}

/// Discover every sensor channel below a hwmon class directory
/// (normally `/sys/class/hwmon`). Thresholds are read once here.
fn discover(root: &Path) -> Vec<HwmonChannel> {
    let mut out = Vec::new();
    let Ok(dirs) = fs::read_dir(root) else {
        return out;
    };
    let mut dirs: Vec<PathBuf> = dirs.flatten().map(|e| e.path()).collect();
    dirs.sort();
    for dir in dirs {
        let hw = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let chip = read_trim(&dir.join("name")).unwrap_or_else(|| hw.clone());
        let Ok(files) = fs::read_dir(&dir) else {
            continue;
        };
        let mut names: Vec<String> = files
            .flatten()
            .map(|f| f.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        for file in names {
            let Some(prefix) = file.strip_suffix("_input") else {
                continue;
            };
            let kind = if prefix.starts_with("temp") {
                SensorKind::Temperature
            } else if prefix.starts_with("fan") {
                SensorKind::Fan
            } else if prefix.starts_with("in") {
                SensorKind::Voltage
            } else if prefix.starts_with("power") {
                SensorKind::Power
            } else if prefix.starts_with("curr") {
                SensorKind::Current
            } else {
                continue;
            };
            let label = read_trim(&dir.join(format!("{prefix}_label")))
                .unwrap_or_else(|| prefix.to_string());
            let mut ch = HwmonChannel {
                id: format!("{hw}/{prefix}"),
                chip: chip.clone(),
                label,
                kind,
                input: dir.join(&file),
                min: None,
                max: None,
                critical: None,
            };
            let scale = ch.scale();
            let thr =
                |suffix: &str| read_num(&dir.join(format!("{prefix}_{suffix}"))).map(|v| v / scale);
            ch.min = thr("min");
            ch.max = thr("max");
            ch.critical = thr("crit");
            out.push(ch);
        }
    }
    out
}

/// Read every hwmon channel below `root` once. Exposed for tests and tooling.
pub fn parse_hwmon(root: &Path) -> Vec<SensorReading> {
    discover(root).iter().filter_map(read_channel).collect()
}

fn read_channel(ch: &HwmonChannel) -> Option<SensorReading> {
    let raw = read_num(&ch.input)?;
    let value = raw / ch.scale();
    // Filter obviously bogus readings (disconnected probes report -128 °C or
    // 0xFFFF RPM on some boards).
    if ch.kind == SensorKind::Temperature && !(-60.0..=200.0).contains(&value) {
        return None;
    }
    // Ignore implausible max/crit values (e.g. 255 °C placeholders).
    let sane = |v: Option<f64>| {
        v.filter(|x| x.is_finite() && *x > 0.0 && *x < 250.0 || ch.kind != SensorKind::Temperature)
    };
    Some(SensorReading {
        id: ch.id.clone(),
        chip: ch.chip.clone(),
        label: ch.label.clone(),
        kind: ch.kind,
        value,
        unit: ch.unit().to_string(),
        min: ch.min,
        max: sane(ch.max),
        critical: sane(ch.critical),
    })
}

pub struct Sensors {
    root: PathBuf,
    channels: Vec<HwmonChannel>,
    discovered_at: Option<Instant>,
}

const REDISCOVER_EVERY: Duration = Duration::from_secs(60);

impl Sensors {
    pub fn new() -> Self {
        Self::with_root(PathBuf::from("/sys/class/hwmon"))
    }

    pub fn with_root(root: PathBuf) -> Self {
        Self {
            root,
            channels: Vec::new(),
            discovered_at: None,
        }
    }

    pub fn read(&mut self) -> SensorData {
        // Re-discover periodically (hot-plugged devices, drivers loaded late)
        // but read only the cached `_input` files on every poll.
        if self
            .discovered_at
            .is_none_or(|t| t.elapsed() > REDISCOVER_EVERY)
        {
            self.channels = discover(&self.root);
            self.discovered_at = Some(Instant::now());
        }
        let readings: Vec<SensorReading> = self.channels.iter().filter_map(read_channel).collect();
        let message = if !self.root.exists() {
            Some("The kernel does not expose /sys/class/hwmon on this system.".to_string())
        } else if readings.is_empty() {
            Some(
                "No hwmon sensors were found. Load the matching driver (e.g. run `sudo sensors-detect` \
                 from lm-sensors) to expose temperatures, fans and voltages."
                    .to_string(),
            )
        } else {
            None
        };
        SensorData {
            readings,
            source: self.source(),
            message,
        }
    }

    pub fn source(&self) -> Option<String> {
        Some("hwmon (sysfs)".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meminfo_parsing() {
        let text = "MemTotal:       16000000 kB\nCached:          2000 kB\nSReclaimable:     500 kB\nBuffers:          100 kB\nShmem: 50 kB\nCommitted_AS: 3000 kB\nCommitLimit: 9000 kB\nSlab: 10 kB\n";
        let b = parse_meminfo(text);
        assert_eq!(b.cached, Some(2500 * 1024));
        assert_eq!(b.buffers, Some(100 * 1024));
        assert_eq!(b.shared, Some(50 * 1024));
        assert_eq!(b.committed, Some(3000 * 1024));
        assert_eq!(b.kernel, Some(10 * 1024));
        assert_eq!(b.dirty, None);
    }

    #[test]
    fn proc_net_parsing() {
        let tcp = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 0100007F:0277 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 1 1 0 100 0 0 10 0\n   1: 0100007F:A1B2 0100007F:0277 01 00000000:00000000 00:00000000 00000000  1000        0 2 1 0 20 4 30 10 -1\n";
        let rows = parse_proc_net(tcp, false);
        assert_eq!(rows[0], ("127.0.0.1".to_string(), 631, 0x0A));
        assert_eq!(rows[1].2, 0x01);

        let tcp6 = "header\n   0: 00000000000000000000000001000000:0016 00000000000000000000000000000000:0000 0A 0 0 0 0 0 0 0\n";
        let rows6 = parse_proc_net(tcp6, true);
        assert_eq!(rows6[0], ("::1".to_string(), 22, 0x0A));
    }

    #[test]
    fn hwmon_fixture() {
        let dir = tempfile::tempdir().unwrap();
        let hw = dir.path().join("hwmon0");
        fs::create_dir(&hw).unwrap();
        fs::write(hw.join("name"), "coretemp\n").unwrap();
        fs::write(hw.join("temp1_input"), "45000\n").unwrap();
        fs::write(hw.join("temp1_label"), "Package id 0\n").unwrap();
        fs::write(hw.join("temp1_crit"), "100000\n").unwrap();
        fs::write(hw.join("fan1_input"), "1200\n").unwrap();
        fs::write(hw.join("in0_input"), "1250\n").unwrap();
        fs::write(hw.join("power1_input"), "15500000\n").unwrap();
        fs::write(hw.join("temp2_input"), "-128000\n").unwrap(); // bogus probe

        let r = parse_hwmon(dir.path());
        let find = |id: &str| r.iter().find(|s| s.id == id).cloned().unwrap();
        let t = find("hwmon0/temp1");
        assert_eq!(t.label, "Package id 0");
        assert_eq!(t.chip, "coretemp");
        assert!((t.value - 45.0).abs() < 1e-9);
        assert_eq!(t.critical, Some(100.0));
        assert_eq!(find("hwmon0/fan1").value, 1200.0);
        assert!((find("hwmon0/in0").value - 1.25).abs() < 1e-9);
        assert!((find("hwmon0/power1").value - 15.5).abs() < 1e-9);
        assert!(
            r.iter().all(|s| s.id != "hwmon0/temp2"),
            "bogus reading must be dropped"
        );

        let mut s = Sensors::with_root(dir.path().to_path_buf());
        let data = s.read();
        assert_eq!(data.readings.len(), 4);
        assert!(data.message.is_none());
    }

    #[test]
    fn missing_hwmon_has_message() {
        let mut s = Sensors::with_root(PathBuf::from("/definitely/not/here"));
        let data = s.read();
        assert!(data.readings.is_empty());
        assert!(data.message.is_some());
    }
}
