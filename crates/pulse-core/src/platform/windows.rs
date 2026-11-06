//! Windows implementation: Win32 APIs and WMI.

use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::size_of;
use std::time::{Duration, Instant};

use serde::Deserialize;
use windows::core::BOOL;
use windows::Win32::Foundation::{
    CloseHandle, ERROR_INSUFFICIENT_BUFFER, HANDLE, HWND, LPARAM, NO_ERROR, WPARAM,
};
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID,
    MIB_UDP6ROW_OWNER_PID, MIB_UDPROW_OWNER_PID, TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::{AF_INET, AF_INET6};
use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
};
use windows::Win32::System::ProcessStatus::{GetPerformanceInfo, PERFORMANCE_INFORMATION};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetExitCodeProcess, GetPriorityClass, OpenProcess, OpenProcessToken,
    OpenThread, ResumeThread, SetPriorityClass, SuspendThread, TerminateProcess,
    ABOVE_NORMAL_PRIORITY_CLASS, BELOW_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS,
    IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, PROCESS_ACCESS_RIGHTS,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION, PROCESS_TERMINATE,
    REALTIME_PRIORITY_CLASS, THREAD_SUSPEND_RESUME,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, PostMessageW, GWL_EXSTYLE, GW_OWNER, WM_CLOSE,
    WS_EX_TOOLWINDOW,
};
use wmi::WMIConnection;

use crate::error::{PulseError, Result};
use crate::models::{
    ConnectionSummary, ListeningPort, MemoryBreakdown, Priority, SensorData, SensorKind,
    SensorReading,
};

// ------------------------------------------------------------- handles ----

/// RAII wrapper so handles are closed on every path.
struct Owned(HANDLE);

impl Drop for Owned {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            // SAFETY: the handle was returned by a successful Open* call.
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

const E_ACCESSDENIED: u32 = 0x8007_0005;
const E_INVALIDARG_WIN32: u32 = 0x8007_0057; // ERROR_INVALID_PARAMETER: no such PID

fn win_err(e: windows::core::Error, action: &str, pid: u32) -> PulseError {
    match e.code().0 as u32 {
        E_ACCESSDENIED => PulseError::PermissionDenied(format!(
            "cannot {action} process {pid}: access is denied. It may be a protected or \
             elevated process; restart Pulse with \"Run as administrator\" to manage it."
        )),
        E_INVALIDARG_WIN32 => PulseError::NotFound(format!("process {pid} no longer exists")),
        _ => PulseError::Other(format!("cannot {action} process {pid}: {}", e.message())),
    }
}

fn open_process(pid: u32, access: PROCESS_ACCESS_RIGHTS, action: &str) -> Result<Owned> {
    // SAFETY: plain Win32 call; the handle is owned by `Owned`.
    unsafe { OpenProcess(access, false, pid) }
        .map(Owned)
        .map_err(|e| win_err(e, action, pid))
}

// ------------------------------------------------------------ processes ---

struct CloseSearch {
    pid: u32,
    posted: u32,
}

unsafe extern "system" fn post_close(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: lparam is the address of a live CloseSearch for the duration
    // of the EnumWindows call.
    let search = unsafe { &mut *(lparam.0 as *mut CloseSearch) };
    let mut owner = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut owner)) };
    if owner == search.pid
        && unsafe { IsWindowVisible(hwnd) }.as_bool()
        && unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) }.is_ok()
    {
        search.posted += 1;
    }
    BOOL::from(true)
}

/// Post `WM_CLOSE` to every visible top-level window of `pid`; returns how
/// many windows were asked to close.
fn post_close_to_windows(pid: u32) -> u32 {
    let mut search = CloseSearch { pid, posted: 0 };
    // SAFETY: the callback only dereferences `search`, which outlives the call.
    let _ = unsafe { EnumWindows(Some(post_close), LPARAM(&mut search as *mut _ as isize)) };
    search.posted
}

/// Graceful: ask every visible top-level window to close (like `taskkill`
/// without `/F`). Processes without windows are terminated.
pub fn kill_process(pid: u32, force: bool) -> Result<()> {
    if !force && post_close_to_windows(pid) > 0 {
        return Ok(());
    }
    let h = open_process(pid, PROCESS_TERMINATE, "end")?;
    // SAFETY: valid handle with PROCESS_TERMINATE access.
    unsafe { TerminateProcess(h.0, 1) }.map_err(|e| win_err(e, "end", pid))
}

/// Close request only (never terminates): `WM_CLOSE` to the process's windows.
pub fn request_close(pid: u32) -> Result<bool> {
    Ok(post_close_to_windows(pid) > 0)
}

pub fn is_running(pid: u32) -> bool {
    const STILL_ACTIVE: u32 = 259;
    let Ok(h) = open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION, "query") else {
        return false;
    };
    let mut code = 0u32;
    // SAFETY: valid handle with query access; `code` is a valid out pointer.
    unsafe { GetExitCodeProcess(h.0, &mut code) }.is_ok() && code == STILL_ACTIVE
}

unsafe extern "system" fn collect_title(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: lparam is the address of a live HashMap for the duration of
    // the EnumWindows call.
    let titles = unsafe { &mut *(lparam.0 as *mut HashMap<u32, String>) };
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();
    // Owned windows (dialogs) and tool windows are not "app" windows.
    let owned = unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok_and(|o| !o.is_invalid());
    let tool = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32 & WS_EX_TOOLWINDOW.0 != 0;
    if visible && !owned && !tool {
        let len = unsafe { GetWindowTextLengthW(hwnd) };
        if len > 0 {
            let mut buf = vec![0u16; len as usize + 1];
            let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
            if n > 0 {
                let mut pid = 0u32;
                unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
                titles
                    .entry(pid)
                    .or_insert_with(|| String::from_utf16_lossy(&buf[..n as usize]));
            }
        }
    }
    BOOL::from(true)
}

/// Title of the first visible, unowned, non-tool top-level window per PID.
pub fn window_titles() -> HashMap<u32, String> {
    let mut titles: HashMap<u32, String> = HashMap::new();
    // SAFETY: the callback only dereferences `titles`, which outlives the call.
    let _ = unsafe { EnumWindows(Some(collect_title), LPARAM(&mut titles as *mut _ as isize)) };
    titles
}

/// Windows uses real window ownership (`window_titles`) instead.
pub fn uses_gui_toolkit(_pid: u32) -> bool {
    false
}

/// Suspend or resume every thread of `pid`.
fn for_each_thread(pid: u32, suspend: bool) -> Result<()> {
    let action = if suspend { "suspend" } else { "resume" };
    // Fail early with a precise error if the process is gone or protected.
    drop(open_process(
        pid,
        PROCESS_QUERY_LIMITED_INFORMATION,
        action,
    )?);

    // SAFETY: snapshot handle is owned by `Owned`; THREADENTRY32 is POD.
    let snap = Owned(
        unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) }
            .map_err(|e| win_err(e, action, pid))?,
    );
    let mut entry = THREADENTRY32 {
        dwSize: size_of::<THREADENTRY32>() as u32,
        ..Default::default()
    };
    let mut ok = 0u32;
    let mut last_err: Option<windows::core::Error> = None;
    let mut more = unsafe { Thread32First(snap.0, &mut entry) }.is_ok();
    while more {
        if entry.th32OwnerProcessID == pid {
            match unsafe { OpenThread(THREAD_SUSPEND_RESUME, false, entry.th32ThreadID) } {
                Ok(h) => {
                    let h = Owned(h);
                    let rc = unsafe {
                        if suspend {
                            SuspendThread(h.0)
                        } else {
                            ResumeThread(h.0)
                        }
                    };
                    if rc != u32::MAX {
                        ok += 1;
                    } else {
                        last_err = Some(windows::core::Error::from_thread());
                    }
                }
                Err(e) => last_err = Some(e),
            }
        }
        more = unsafe { Thread32Next(snap.0, &mut entry) }.is_ok();
    }
    match (ok, last_err) {
        (0, Some(e)) => Err(win_err(e, action, pid)),
        (0, None) => Err(PulseError::NotFound(format!(
            "process {pid} has no threads"
        ))),
        _ => Ok(()),
    }
}

pub fn suspend_process(pid: u32) -> Result<()> {
    for_each_thread(pid, true)
}

pub fn resume_process(pid: u32) -> Result<()> {
    for_each_thread(pid, false)
}

pub fn set_priority(pid: u32, priority: Priority) -> Result<()> {
    let class = match priority {
        Priority::Idle => IDLE_PRIORITY_CLASS,
        Priority::BelowNormal => BELOW_NORMAL_PRIORITY_CLASS,
        Priority::Normal => NORMAL_PRIORITY_CLASS,
        Priority::AboveNormal => ABOVE_NORMAL_PRIORITY_CLASS,
        Priority::High => HIGH_PRIORITY_CLASS,
        Priority::Realtime => REALTIME_PRIORITY_CLASS,
    };
    let h = open_process(pid, PROCESS_SET_INFORMATION, "change the priority of")?;
    // SAFETY: valid handle with PROCESS_SET_INFORMATION access.
    unsafe { SetPriorityClass(h.0, class) }.map_err(|e| win_err(e, "change the priority of", pid))
}

pub fn get_priority(pid: u32) -> Result<Priority> {
    let h = open_process(pid, PROCESS_QUERY_LIMITED_INFORMATION, "query")?;
    // SAFETY: valid handle with query access.
    let class = unsafe { GetPriorityClass(h.0) };
    Ok(match class {
        c if c == IDLE_PRIORITY_CLASS.0 => Priority::Idle,
        c if c == BELOW_NORMAL_PRIORITY_CLASS.0 => Priority::BelowNormal,
        c if c == ABOVE_NORMAL_PRIORITY_CLASS.0 => Priority::AboveNormal,
        c if c == HIGH_PRIORITY_CLASS.0 => Priority::High,
        c if c == REALTIME_PRIORITY_CLASS.0 => Priority::Realtime,
        0 => return Err(win_err(windows::core::Error::from_thread(), "query", pid)),
        _ => Priority::Normal,
    })
}

pub fn is_elevated() -> bool {
    let mut token = HANDLE::default();
    // SAFETY: pseudo-handle from GetCurrentProcess needs no closing; the
    // token handle is owned by `Owned`.
    unsafe {
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let token = Owned(token);
        let mut elevation = TOKEN_ELEVATION::default();
        let mut len = 0u32;
        GetTokenInformation(
            token.0,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut c_void),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut len,
        )
        .is_ok()
            && elevation.TokenIsElevated != 0
    }
}

pub fn is_system_process(_uid: Option<&sysinfo::Uid>, user: Option<&str>, _kernel: bool) -> bool {
    match user {
        None => true,
        Some(u) => {
            let u = u.to_ascii_uppercase();
            matches!(
                u.as_str(),
                "SYSTEM"
                    | "LOCAL SERVICE"
                    | "NETWORK SERVICE"
                    | "SYSTÈME"
                    | "SERVICE LOCAL"
                    | "SERVICE RÉSEAU"
            ) || u.starts_with("DWM-")
                || u.starts_with("UMFD-")
        }
    }
}

// --------------------------------------------------------------- memory ---

pub fn memory_breakdown() -> Option<MemoryBreakdown> {
    let mut pi = PERFORMANCE_INFORMATION {
        cb: size_of::<PERFORMANCE_INFORMATION>() as u32,
        ..Default::default()
    };
    // SAFETY: pi is a correctly sized, writable struct.
    unsafe { GetPerformanceInfo(&mut pi, pi.cb) }.ok()?;
    let page = pi.PageSize as u64;
    Some(MemoryBreakdown {
        cached: Some(pi.SystemCache as u64 * page),
        buffers: None,
        shared: None,
        committed: Some(pi.CommitTotal as u64 * page),
        commit_limit: Some(pi.CommitLimit as u64 * page),
        kernel: Some(pi.KernelTotal as u64 * page),
        dirty: None,
    })
}

// ---------------------------------------------------------- connections ---

/// Call an IP Helper "get table" function with a growing buffer. The buffer
/// is u64-backed so rows are suitably aligned.
fn fetch_table(f: impl Fn(Option<*mut c_void>, *mut u32) -> u32) -> Option<Vec<u64>> {
    let mut size = 0u32;
    let rc = f(None, &mut size);
    if rc != ERROR_INSUFFICIENT_BUFFER.0 && rc != NO_ERROR.0 {
        return None;
    }
    for _ in 0..4 {
        let mut buf = vec![0u64; (size as usize).div_ceil(8) + 1];
        let mut len = (buf.len() * 8) as u32;
        let rc = f(Some(buf.as_mut_ptr() as *mut c_void), &mut len);
        if rc == NO_ERROR.0 {
            return Some(buf);
        }
        if rc != ERROR_INSUFFICIENT_BUFFER.0 {
            return None;
        }
        size = len; // table grew between calls; retry
    }
    None
}

/// Iterate `MIB_*TABLE_*` rows: a u32 count followed by the row array.
fn rows<R: Copy>(buf: &[u64]) -> Vec<R> {
    let base = buf.as_ptr() as *const u8;
    let bytes = buf.len() * 8;
    // SAFETY: the count is the first u32 of a table written by the OS.
    let count = unsafe { std::ptr::read_unaligned(base as *const u32) } as usize;
    // Rows start after the count, at the row type's alignment (4 for all of these).
    let offset = std::mem::align_of::<R>().max(4);
    let max_rows = bytes.saturating_sub(offset) / size_of::<R>();
    (0..count.min(max_rows))
        .map(|i| unsafe {
            std::ptr::read_unaligned(base.add(offset + i * size_of::<R>()) as *const R)
        })
        .collect()
}

fn port(p: u32) -> u16 {
    u16::from_be((p & 0xFFFF) as u16)
}

pub fn connections() -> Result<ConnectionSummary> {
    let tcp_table = |af: u16| {
        fetch_table(|ptr, size| unsafe {
            GetExtendedTcpTable(ptr, size, false, af as u32, TCP_TABLE_OWNER_PID_ALL, 0)
        })
    };
    let udp_table = |af: u16| {
        fetch_table(|ptr, size| unsafe {
            GetExtendedUdpTable(ptr, size, false, af as u32, UDP_TABLE_OWNER_PID, 0)
        })
    };

    let tcp: Vec<MIB_TCPROW_OWNER_PID> = tcp_table(AF_INET.0).map(|b| rows(&b)).unwrap_or_default();
    let tcp6: Vec<MIB_TCP6ROW_OWNER_PID> =
        tcp_table(AF_INET6.0).map(|b| rows(&b)).unwrap_or_default();
    let udp: Vec<MIB_UDPROW_OWNER_PID> = udp_table(AF_INET.0).map(|b| rows(&b)).unwrap_or_default();
    let udp6: Vec<MIB_UDP6ROW_OWNER_PID> =
        udp_table(AF_INET6.0).map(|b| rows(&b)).unwrap_or_default();

    let mut states: HashMap<&'static str, u32> = HashMap::new();
    let mut listening = Vec::new();
    for r in &tcp {
        *states
            .entry(super::tcp_state_name(r.dwState, true))
            .or_default() += 1;
        if r.dwState == 2 {
            listening.push(ListeningPort {
                protocol: "tcp".into(),
                address: std::net::Ipv4Addr::from(r.dwLocalAddr.to_le_bytes()).to_string(),
                port: port(r.dwLocalPort),
                pid: Some(r.dwOwningPid),
            });
        }
    }
    for r in &tcp6 {
        *states
            .entry(super::tcp_state_name(r.dwState, true))
            .or_default() += 1;
        if r.dwState == 2 {
            listening.push(ListeningPort {
                protocol: "tcp6".into(),
                address: std::net::Ipv6Addr::from(r.ucLocalAddr).to_string(),
                port: port(r.dwLocalPort),
                pid: Some(r.dwOwningPid),
            });
        }
    }
    for r in &udp {
        listening.push(ListeningPort {
            protocol: "udp".into(),
            address: std::net::Ipv4Addr::from(r.dwLocalAddr.to_le_bytes()).to_string(),
            port: port(r.dwLocalPort),
            pid: Some(r.dwOwningPid),
        });
    }
    for r in &udp6 {
        listening.push(ListeningPort {
            protocol: "udp6".into(),
            address: std::net::Ipv6Addr::from(r.ucLocalAddr).to_string(),
            port: port(r.dwLocalPort),
            pid: Some(r.dwOwningPid),
        });
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

// -------------------------------------------------------------- network ---

pub fn is_virtual_interface(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [
        "loopback",
        "virtual",
        "vethernet",
        "vmware",
        "virtualbox",
        "hyper-v",
        "tap",
        "tun",
        "wsl",
        "vpn",
        "wireguard",
        "zerotier",
        "tailscale",
        "pseudo",
        "isatap",
        "teredo",
        "bluetooth",
        "wan miniport",
        "npcap",
    ]
    .iter()
    .any(|k| n.contains(k))
}

// -------------------------------------------------------------- sensors ---

/// `Sensor` class exposed by LibreHardwareMonitor / OpenHardwareMonitor.
#[derive(Deserialize, Debug)]
#[serde(rename = "Sensor")]
#[serde(rename_all = "PascalCase")]
struct HmSensor {
    identifier: String,
    name: String,
    sensor_type: String,
    value: f32,
    min: Option<f32>,
    max: Option<f32>,
    parent: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename = "Hardware")]
#[serde(rename_all = "PascalCase")]
struct HmHardware {
    identifier: String,
    name: String,
}

/// ACPI thermal zones (usually requires administrator rights).
#[derive(Deserialize, Debug)]
#[serde(rename = "MSAcpi_ThermalZoneTemperature")]
#[serde(rename_all = "PascalCase")]
struct ThermalZone {
    instance_name: String,
    current_temperature: u32,
    critical_trip_point: Option<u32>,
}

enum Backend {
    HardwareMonitor {
        conn: WMIConnection,
        name: &'static str,
        hardware: HashMap<String, String>,
        hw_at: Instant,
    },
    ThermalZones(WMIConnection),
}

pub struct Sensors {
    backend: Option<Backend>,
    last_attempt: Option<Instant>,
}

const RETRY_EVERY: Duration = Duration::from_secs(30);
const HARDWARE_REFRESH: Duration = Duration::from_secs(60);

fn kind_of(sensor_type: &str) -> Option<(SensorKind, &'static str)> {
    Some(match sensor_type {
        "Temperature" => (SensorKind::Temperature, "°C"),
        "Fan" => (SensorKind::Fan, "RPM"),
        "Voltage" => (SensorKind::Voltage, "V"),
        "Power" => (SensorKind::Power, "W"),
        "Current" => (SensorKind::Current, "A"),
        "Load" => (SensorKind::Load, "%"),
        "Clock" => (SensorKind::Clock, "MHz"),
        _ => return None,
    })
}

fn kelvin10_to_c(v: u32) -> f64 {
    v as f64 / 10.0 - 273.15
}

impl Sensors {
    pub fn new() -> Self {
        Self {
            backend: None,
            last_attempt: None,
        }
    }

    fn connect(&mut self) {
        self.last_attempt = Some(Instant::now());
        for (ns, name) in [
            ("ROOT\\LibreHardwareMonitor", "LibreHardwareMonitor (WMI)"),
            ("ROOT\\OpenHardwareMonitor", "OpenHardwareMonitor (WMI)"),
        ] {
            if let Ok(conn) = WMIConnection::with_namespace_path(ns) {
                // The namespace exists only while the monitor app is running;
                // make sure it actually answers.
                if conn
                    .raw_query::<HmHardware>("SELECT Identifier, Name FROM Hardware")
                    .is_ok()
                {
                    self.backend = Some(Backend::HardwareMonitor {
                        conn,
                        name,
                        hardware: HashMap::new(),
                        hw_at: Instant::now() - HARDWARE_REFRESH * 2,
                    });
                    return;
                }
            }
        }
        if let Ok(conn) = WMIConnection::with_namespace_path("ROOT\\WMI") {
            if conn
                .raw_query::<ThermalZone>("SELECT InstanceName, CurrentTemperature, CriticalTripPoint FROM MSAcpi_ThermalZoneTemperature")
                .is_ok_and(|v| !v.is_empty())
            {
                self.backend = Some(Backend::ThermalZones(conn));
            }
        }
    }

    pub fn read(&mut self) -> SensorData {
        let wants_upgrade = !matches!(self.backend, Some(Backend::HardwareMonitor { .. }));
        if wants_upgrade && self.last_attempt.is_none_or(|t| t.elapsed() > RETRY_EVERY) {
            self.connect();
        }
        let source = self.source();
        let result = match &mut self.backend {
            Some(Backend::HardwareMonitor { conn, hardware, hw_at, .. }) => {
                if hw_at.elapsed() > HARDWARE_REFRESH {
                    if let Ok(list) = conn.raw_query::<HmHardware>("SELECT Identifier, Name FROM Hardware") {
                        *hardware = list.into_iter().map(|h| (h.identifier, h.name)).collect();
                    }
                    *hw_at = Instant::now();
                }
                conn.raw_query::<HmSensor>(
                    "SELECT Identifier, Name, SensorType, Value, Min, Max, Parent FROM Sensor",
                )
                .map(|list| {
                    let mut readings: Vec<SensorReading> = list
                        .into_iter()
                        .filter_map(|s| {
                            let (kind, unit) = kind_of(&s.sensor_type)?;
                            Some(SensorReading {
                                chip: hardware.get(&s.parent).cloned().unwrap_or_else(|| s.parent.clone()),
                                id: s.identifier,
                                label: s.name,
                                kind,
                                value: s.value as f64,
                                unit: unit.to_string(),
                                min: s.min.map(f64::from),
                                max: s.max.map(f64::from),
                                critical: None,
                            })
                        })
                        .collect();
                    readings.sort_by(|a, b| a.chip.cmp(&b.chip).then_with(|| a.id.cmp(&b.id)));
                    readings
                })
                .map_err(|e| e.to_string())
            }
            Some(Backend::ThermalZones(conn)) => conn
                .raw_query::<ThermalZone>("SELECT InstanceName, CurrentTemperature, CriticalTripPoint FROM MSAcpi_ThermalZoneTemperature")
                .map(|zones| {
                    zones
                        .into_iter()
                        .map(|z| SensorReading {
                            id: z.instance_name.clone(),
                            chip: "ACPI thermal zone".into(),
                            label: z.instance_name,
                            kind: SensorKind::Temperature,
                            value: kelvin10_to_c(z.current_temperature),
                            unit: "°C".into(),
                            min: None,
                            max: None,
                            critical: z.critical_trip_point.map(kelvin10_to_c),
                        })
                        .collect()
                })
                .map_err(|e| e.to_string()),
            None => Ok(Vec::new()),
        };

        match result {
            Ok(readings) => {
                let message = match &self.backend {
                    None => Some(
                        "Windows exposes no sensors to regular applications. Install and run \
                         LibreHardwareMonitor (as administrator) and Pulse will read temperatures, \
                         fans and voltages from it automatically."
                            .to_string(),
                    ),
                    Some(Backend::ThermalZones(_)) => Some(
                        "Only ACPI thermal zones are available. Run LibreHardwareMonitor for \
                         per-core temperatures, fans and voltages."
                            .to_string(),
                    ),
                    _ if readings.is_empty() => {
                        Some("The hardware monitor reported no sensors.".to_string())
                    }
                    _ => None,
                };
                SensorData {
                    readings,
                    source,
                    message,
                }
            }
            Err(e) => {
                // The monitor app was closed: drop the backend and retry later.
                self.backend = None;
                SensorData {
                    readings: Vec::new(),
                    source: None,
                    message: Some(format!(
                        "Sensor provider stopped responding ({e}). Retrying…"
                    )),
                }
            }
        }
    }

    pub fn source(&self) -> Option<String> {
        match &self.backend {
            Some(Backend::HardwareMonitor { name, .. }) => Some((*name).to_string()),
            Some(Backend::ThermalZones(_)) => Some("ACPI thermal zones (WMI)".into()),
            None => None,
        }
    }
}
