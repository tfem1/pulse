//! Platform abstraction layer.
//!
//! Everything that is not covered by `sysinfo` in a cross-platform way lives
//! here, behind one uniform API:
//!
//! | Capability            | Linux                       | Windows                                   |
//! |-----------------------|-----------------------------|-------------------------------------------|
//! | kill / suspend/resume | signals (TERM/KILL/STOP/CONT)| TerminateProcess / per-thread Suspend     |
//! | priority              | setpriority (nice)          | SetPriorityClass                          |
//! | memory breakdown      | /proc/meminfo               | GetPerformanceInfo                        |
//! | connections           | /proc/net/{tcp,udp}{,6}     | GetExtendedTcpTable / GetExtendedUdpTable |
//! | sensors               | /sys/class/hwmon            | LibreHardwareMonitor / OpenHardwareMonitor WMI, ACPI thermal zones |
//!
//! Other targets (macOS, BSD) compile through `fallback`, which reports
//! "unsupported" instead of failing to build.

use crate::error::{PulseError, Result};
use crate::models::{ConnectionSummary, MemoryBreakdown, Priority, SensorData};

#[cfg(unix)]
mod unix_proc;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as os;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use self::windows as os;

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod fallback;
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
use fallback as os;

#[cfg(target_os = "linux")]
pub use linux::{parse_hwmon, parse_meminfo, parse_proc_net};

/// Polls hardware sensors. Created and used on the sampler thread only
/// (on Windows it owns a COM/WMI connection, which is thread-bound).
pub struct SensorCollector {
    inner: os::Sensors,
}

impl SensorCollector {
    pub fn new() -> Self {
        Self {
            inner: os::Sensors::new(),
        }
    }

    pub fn read(&mut self) -> SensorData {
        self.inner.read()
    }

    /// Name of the backend in use, for the System info panel.
    pub fn source(&self) -> Option<String> {
        self.inner.source()
    }
}

impl Default for SensorCollector {
    fn default() -> Self {
        Self::new()
    }
}

fn guard(pid: u32, action: &str) -> Result<()> {
    if pid == 0 {
        return Err(PulseError::InvalidInput(format!(
            "refusing to {action} PID 0"
        )));
    }
    if pid == std::process::id() {
        return Err(PulseError::InvalidInput(format!(
            "refusing to {action} Pulse itself; use Quit from the tray menu instead"
        )));
    }
    #[cfg(unix)]
    if pid == 1 {
        return Err(PulseError::PermissionDenied(format!(
            "refusing to {action} PID 1 (init); doing so would bring down the system"
        )));
    }
    Ok(())
}

/// Ask a process to exit (`force = false`) or terminate it immediately.
pub fn kill_process(pid: u32, force: bool) -> Result<()> {
    guard(pid, "end")?;
    os::kill_process(pid, force)
}

pub fn suspend_process(pid: u32) -> Result<()> {
    guard(pid, "suspend")?;
    os::suspend_process(pid)
}

pub fn resume_process(pid: u32) -> Result<()> {
    if pid == 0 {
        return Err(PulseError::InvalidInput("refusing to resume PID 0".into()));
    }
    os::resume_process(pid)
}

pub fn set_priority(pid: u32, priority: Priority) -> Result<()> {
    guard(pid, "change the priority of")?;
    os::set_priority(pid, priority)
}

pub fn get_priority(pid: u32) -> Result<Priority> {
    os::get_priority(pid)
}

/// Extra memory figures (cache, buffers, commit...) when the OS exposes them.
pub fn memory_breakdown() -> Option<MemoryBreakdown> {
    os::memory_breakdown()
}

/// Socket summary (per-state TCP counts, listening ports).
pub fn connections() -> Result<ConnectionSummary> {
    os::connections()
}

/// Whether the interface is virtual (bridges, VPN tunnels, container veths...).
pub fn is_virtual_interface(name: &str) -> bool {
    os::is_virtual_interface(name)
}

/// Whether Pulse runs with administrator / root privileges.
pub fn is_elevated() -> bool {
    os::is_elevated()
}

/// Heuristic used by the "show system processes" filter.
pub fn is_system_process(
    uid: Option<&sysinfo::Uid>,
    user: Option<&str>,
    kernel_thread: bool,
) -> bool {
    os::is_system_process(uid, user, kernel_thread)
}

/// TCP state names shared by the Linux and Windows parsers.
pub(crate) fn tcp_state_name(code: u32, windows_numbering: bool) -> &'static str {
    if windows_numbering {
        // MIB_TCP_STATE
        match code {
            1 => "CLOSED",
            2 => "LISTEN",
            3 => "SYN_SENT",
            4 => "SYN_RECV",
            5 => "ESTABLISHED",
            6 => "FIN_WAIT1",
            7 => "FIN_WAIT2",
            8 => "CLOSE_WAIT",
            9 => "CLOSING",
            10 => "LAST_ACK",
            11 => "TIME_WAIT",
            12 => "DELETE_TCB",
            _ => "UNKNOWN",
        }
    } else {
        // include/net/tcp_states.h
        match code {
            0x01 => "ESTABLISHED",
            0x02 => "SYN_SENT",
            0x03 => "SYN_RECV",
            0x04 => "FIN_WAIT1",
            0x05 => "FIN_WAIT2",
            0x06 => "TIME_WAIT",
            0x07 => "CLOSED",
            0x08 => "CLOSE_WAIT",
            0x09 => "LAST_ACK",
            0x0A => "LISTEN",
            0x0B => "CLOSING",
            0x0C => "NEW_SYN_RECV",
            _ => "UNKNOWN",
        }
    }
}

/// Collapse per-state counts into a sorted list (most frequent first).
#[allow(dead_code)] // unused on targets without a connection backend
pub(crate) fn sorted_states(
    map: std::collections::HashMap<&'static str, u32>,
) -> Vec<(String, u32)> {
    let mut v: Vec<(String, u32)> = map.into_iter().map(|(k, n)| (k.to_string(), n)).collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_dangerous_targets() {
        assert!(matches!(
            kill_process(0, false),
            Err(PulseError::InvalidInput(_))
        ));
        assert!(matches!(
            kill_process(std::process::id(), true),
            Err(PulseError::InvalidInput(_))
        ));
    }

    #[test]
    fn state_names() {
        assert_eq!(tcp_state_name(0x0A, false), "LISTEN");
        assert_eq!(tcp_state_name(5, true), "ESTABLISHED");
    }

    #[cfg(unix)]
    #[test]
    fn suspend_and_resume_child() {
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .unwrap();
        let pid = child.id();
        suspend_process(pid).unwrap();
        resume_process(pid).unwrap();
        // Lowering priority (raising nice) never needs privileges.
        set_priority(pid, Priority::Idle).unwrap();
        assert_eq!(get_priority(pid).unwrap(), Priority::Idle);
        kill_process(pid, false).unwrap();
        let status = child.wait().unwrap();
        assert!(!status.success());
    }

    #[cfg(unix)]
    #[test]
    fn missing_process_is_not_found() {
        // PIDs are bounded by pid_max (<= 4194304 on Linux).
        let err = kill_process(4_194_303, false).unwrap_err();
        assert_eq!(err.kind(), "notFound");
    }
}
