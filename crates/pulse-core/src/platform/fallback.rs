//! Fallback for targets other than Linux and Windows (macOS, BSD).
//!
//! Pulse officially targets Linux and Windows. This module keeps the crate
//! compiling elsewhere: process control works through POSIX signals, while
//! the Linux/Windows-only extras report themselves as unsupported.

use crate::error::{PulseError, Result};
use crate::models::{ConnectionSummary, MemoryBreakdown, SensorData};

#[cfg(unix)]
pub use super::unix_proc::{
    get_priority, is_elevated, kill_process, resume_process, set_priority, suspend_process,
};

#[cfg(not(unix))]
mod no_proc {
    use crate::error::{PulseError, Result};
    use crate::models::Priority;

    fn unsupported<T>() -> Result<T> {
        Err(PulseError::Unsupported("process control".into()))
    }
    pub fn kill_process(_: u32, _: bool) -> Result<()> {
        unsupported()
    }
    pub fn suspend_process(_: u32) -> Result<()> {
        unsupported()
    }
    pub fn resume_process(_: u32) -> Result<()> {
        unsupported()
    }
    pub fn set_priority(_: u32, _: Priority) -> Result<()> {
        unsupported()
    }
    pub fn get_priority(_: u32) -> Result<Priority> {
        unsupported()
    }
    pub fn is_elevated() -> bool {
        false
    }
}
#[cfg(not(unix))]
pub use no_proc::*;

pub fn memory_breakdown() -> Option<MemoryBreakdown> {
    None
}

pub fn connections() -> Result<ConnectionSummary> {
    Err(PulseError::Unsupported("connection listing".into()))
}

pub fn is_virtual_interface(name: &str) -> bool {
    name.starts_with("lo") || name.starts_with("utun") || name.starts_with("bridge")
}

pub fn is_system_process(_uid: Option<&sysinfo::Uid>, user: Option<&str>, kernel: bool) -> bool {
    kernel || matches!(user, None | Some("root")) || user.is_some_and(|u| u.starts_with('_'))
}

/// No platform sensor backend: the sampler falls back to `sysinfo` components.
pub struct Sensors;

impl Sensors {
    pub fn new() -> Self {
        Sensors
    }
    pub fn read(&mut self) -> SensorData {
        SensorData::default()
    }
    pub fn source(&self) -> Option<String> {
        None
    }
}
