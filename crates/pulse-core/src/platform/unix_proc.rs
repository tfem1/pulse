//! Process control shared by every Unix target (signals + nice values).

use std::io;

use crate::error::{PulseError, Result};
use crate::models::Priority;

fn errno_to_error(err: io::Error, action: &str, pid: u32) -> PulseError {
    match err.raw_os_error() {
        Some(libc::ESRCH) => PulseError::NotFound(format!("process {pid} no longer exists")),
        Some(libc::EPERM) | Some(libc::EACCES) => PulseError::PermissionDenied(format!(
            "cannot {action} process {pid}: it belongs to another user. \
             Run Pulse as root (e.g. with sudo) to manage it."
        )),
        _ => PulseError::from_process_io(err, action, pid),
    }
}

fn send(pid: u32, sig: libc::c_int, action: &str) -> Result<()> {
    let pid_t = libc::pid_t::try_from(pid)
        .map_err(|_| PulseError::InvalidInput(format!("invalid PID {pid}")))?;
    // SAFETY: kill(2) has no memory-safety preconditions.
    let rc = unsafe { libc::kill(pid_t, sig) };
    if rc == 0 {
        Ok(())
    } else {
        Err(errno_to_error(io::Error::last_os_error(), action, pid))
    }
}

pub fn kill_process(pid: u32, force: bool) -> Result<()> {
    send(
        pid,
        if force { libc::SIGKILL } else { libc::SIGTERM },
        "end",
    )
}

pub fn suspend_process(pid: u32) -> Result<()> {
    send(pid, libc::SIGSTOP, "suspend")
}

pub fn resume_process(pid: u32) -> Result<()> {
    send(pid, libc::SIGCONT, "resume")
}

pub fn set_priority(pid: u32, priority: Priority) -> Result<()> {
    let nice = priority.nice();
    // SAFETY: setpriority(2) has no memory-safety preconditions.
    let rc = unsafe { libc::setpriority(libc::PRIO_PROCESS, pid as libc::id_t, nice) };
    if rc == 0 {
        return Ok(());
    }
    let err = io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::EACCES) | Some(libc::EPERM) if nice < 0 => {
            Err(PulseError::PermissionDenied(format!(
                "raising the priority of process {pid} requires root (or CAP_SYS_NICE). \
                 Lowering it is always allowed for your own processes."
            )))
        }
        _ => Err(errno_to_error(err, "change the priority of", pid)),
    }
}

/// Current nice value. On Linux it is read from `/proc/<pid>/stat`, which
/// avoids getpriority's ambiguous `-1` return value.
#[cfg(target_os = "linux")]
pub fn get_nice(pid: u32) -> Result<i32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat"))
        .map_err(|_| PulseError::NotFound(format!("process {pid} no longer exists")))?;
    parse_stat_nice(&stat)
        .ok_or_else(|| PulseError::Other(format!("cannot parse /proc/{pid}/stat")))
}

/// Field 19 of /proc/<pid>/stat. The command name (field 2) may contain
/// spaces and parentheses, so parse after the last ')'.
#[cfg(target_os = "linux")]
pub fn parse_stat_nice(stat: &str) -> Option<i32> {
    let rest = &stat[stat.rfind(')')? + 1..];
    // rest starts at field 3 (state); nice is field 19 → index 16.
    rest.split_whitespace().nth(16)?.parse().ok()
}

#[cfg(not(target_os = "linux"))]
pub fn get_nice(pid: u32) -> Result<i32> {
    // getpriority can legitimately return -1; we accept that ambiguity here
    // and only treat it as an error when the process is gone.
    // SAFETY: getpriority(2) has no memory-safety preconditions.
    let v = unsafe { libc::getpriority(libc::PRIO_PROCESS, pid as libc::id_t) };
    if v == -1 && unsafe { libc::kill(pid as libc::pid_t, 0) } != 0 {
        return Err(PulseError::NotFound(format!(
            "process {pid} no longer exists"
        )));
    }
    Ok(v)
}

pub fn get_priority(pid: u32) -> Result<Priority> {
    get_nice(pid).map(Priority::from_nice)
}

pub fn is_elevated() -> bool {
    // SAFETY: geteuid(2) cannot fail.
    unsafe { libc::geteuid() == 0 }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn parses_nice_with_tricky_comm() {
        let stat =
            "1234 (my (weird) proc) S 1 1234 1234 0 -1 4194560 100 0 0 0 1 2 0 0 20 5 1 0 100 0 0";
        assert_eq!(parse_stat_nice(stat), Some(5));
    }
}
