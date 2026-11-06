//! "End task" for a whole application, like Task Manager's Apps list.
//!
//! An application can span many processes (browsers, editors, Electron
//! apps…). Ending it gracefully asks its window-owning processes to close,
//! the way clicking the window's close button would (`WM_CLOSE` on Windows,
//! `SIGTERM` on Unix). Anything still running after a grace period is then
//! terminated, so "End task" always ends the app. "Force end" terminates
//! every process immediately.

use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::error::{PulseError, Result};
use crate::platform;

/// How long a gracefully closed app gets before it is terminated.
pub const DEFAULT_GRACE: Duration = Duration::from_secs(5);
const POLL: Duration = Duration::from_millis(200);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EndAppOutcome {
    /// Every process of the app has exited.
    pub ended: bool,
    /// Processes that had to be terminated because they did not close in time
    /// (or because force was requested).
    pub forced: u32,
    /// Processes that could not be ended (permissions, protected processes).
    pub failed: Vec<u32>,
    /// Human-readable reason for the first failure, if any.
    pub error: Option<String>,
}

/// End an application made of `pids`. `primary` are the processes to ask
/// first (window owners); with `force`, everything is terminated at once.
/// Blocks for at most `grace` (plus a short final check).
pub fn end_app(
    pids: &[u32],
    primary: &[u32],
    force: bool,
    grace: Duration,
) -> Result<EndAppOutcome> {
    if pids.is_empty() {
        return Err(PulseError::InvalidInput("no process to end".into()));
    }
    let mut first_error: Option<PulseError> = None;
    let mut remember = |e: PulseError| {
        if first_error.is_none() {
            first_error = Some(e);
        }
    };

    if !force {
        // Ask politely: window owners first; if none could be asked, the
        // root process (first pid) receives the close request.
        let targets: Vec<u32> = if primary.is_empty() {
            vec![pids[0]]
        } else {
            primary.to_vec()
        };
        let mut asked = 0;
        for &pid in &targets {
            match platform::request_close(pid) {
                Ok(true) => asked += 1,
                Ok(false) => {}
                Err(PulseError::NotFound(_)) => {}
                Err(e) => remember(e),
            }
        }
        if asked > 0 {
            let deadline = Instant::now() + grace;
            while Instant::now() < deadline && pids.iter().any(|&p| platform::is_running(p)) {
                thread::sleep(POLL);
            }
        }
    }

    // Terminate whatever is left.
    let mut forced = 0;
    let mut failed = Vec::new();
    for &pid in pids {
        if !platform::is_running(pid) {
            continue;
        }
        match platform::kill_process(pid, true) {
            Ok(()) => forced += 1,
            Err(PulseError::NotFound(_)) => {}
            Err(e) => {
                failed.push(pid);
                remember(e);
            }
        }
    }

    // Give terminations a moment to take effect before reporting.
    let settle = Instant::now() + Duration::from_secs(1);
    while Instant::now() < settle && pids.iter().any(|&p| platform::is_running(p)) {
        thread::sleep(Duration::from_millis(50));
    }
    let ended = !pids.iter().any(|&p| platform::is_running(p));

    // Nothing at all could be done: surface the precise reason (e.g. a
    // permission error) as an error rather than a partial outcome.
    if !ended && forced == 0 {
        if let Some(e) = first_error {
            return Err(e);
        }
    }
    Ok(EndAppOutcome {
        ended,
        forced,
        failed,
        error: first_error.map(|e| e.to_string()),
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::{Child, Command};

    fn spawn(script: &str) -> Child {
        Command::new("sh").arg("-c").arg(script).spawn().unwrap()
    }

    /// Reap children in the background so exited ones don't linger as zombies.
    fn reap(mut children: Vec<Child>) {
        thread::spawn(move || {
            for c in &mut children {
                let _ = c.wait();
            }
        });
    }

    #[test]
    fn graceful_close_ends_a_cooperative_app() {
        let app = spawn("sleep 30");
        let helper = spawn("sleep 30");
        let pids = [app.id(), helper.id()];
        reap(vec![app, helper]);
        // Only the "window owner" is asked; the helper is terminated after the grace period.
        let out = end_app(&pids, &[pids[0]], false, Duration::from_millis(400)).unwrap();
        assert!(out.ended, "{out:?}");
        assert_eq!(out.forced, 1, "the helper had to be terminated");
        assert!(out.failed.is_empty());
    }

    #[test]
    fn unresponsive_app_is_forced_after_grace() {
        // Ignores SIGTERM, like an app stuck on a "Save changes?" prompt.
        let app = spawn("trap '' TERM; while :; do sleep 1; done");
        let pid = app.id();
        reap(vec![app]);
        thread::sleep(Duration::from_millis(100)); // let the trap install
        let started = Instant::now();
        let out = end_app(&[pid], &[pid], false, Duration::from_millis(500)).unwrap();
        assert!(out.ended, "{out:?}");
        assert_eq!(out.forced, 1);
        assert!(
            started.elapsed() >= Duration::from_millis(500),
            "waited for the grace period"
        );
        assert!(!platform::is_running(pid));
    }

    #[test]
    fn force_ends_immediately() {
        let app = spawn("trap '' TERM; while :; do sleep 1; done");
        let pid = app.id();
        reap(vec![app]);
        let started = Instant::now();
        let out = end_app(&[pid], &[pid], true, DEFAULT_GRACE).unwrap();
        assert!(out.ended);
        assert!(started.elapsed() < DEFAULT_GRACE);
    }

    #[test]
    fn rejects_empty_and_protected_targets() {
        assert!(matches!(
            end_app(&[], &[], false, DEFAULT_GRACE),
            Err(PulseError::InvalidInput(_))
        ));
        // PID 1 is refused by the platform guard: reported, never killed.
        let err = end_app(&[1], &[1], true, DEFAULT_GRACE).unwrap_err();
        assert_eq!(err.kind(), "permissionDenied");
    }
}
