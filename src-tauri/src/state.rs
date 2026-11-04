//! State shared between the sampler thread, Tauri commands and the tray.

use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};
use pulse_core::alerts::{AlertEvent, RuleStatus};
use pulse_core::config::Config;
use pulse_core::history::History;
use pulse_core::models::{ProcessInfo, Snapshot, SystemInfo};

/// Messages that wake the sampler thread early.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerMsg {
    /// Configuration changed: re-read intervals, resize history.
    ConfigChanged,
    /// Sample right now (e.g. the process page just opened).
    SampleNow,
    Shutdown,
}

pub const MAX_ALERT_EVENTS: usize = 200;

pub struct Shared {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    pub system_info: RwLock<Option<SystemInfo>>,
    pub snapshot: RwLock<Option<Arc<Snapshot>>>,
    pub processes: RwLock<Arc<Vec<ProcessInfo>>>,
    pub history: RwLock<History>,
    pub alert_events: Mutex<VecDeque<AlertEvent>>,
    pub alert_status: RwLock<Vec<RuleStatus>>,
    /// PIDs suspended through Pulse (Windows has no "stopped" process state).
    pub suspended: Mutex<HashSet<u32>>,
    /// The UI is showing the process table and wants updates.
    pub process_streaming: AtomicBool,
    /// A tray icon exists, so hiding the window on close is safe.
    pub tray_available: AtomicBool,
    worker: Mutex<Option<Sender<WorkerMsg>>>,
}

impl Shared {
    pub fn new(config: Config, config_path: PathBuf) -> Self {
        let capacity = config.history_capacity();
        Self {
            config: RwLock::new(config),
            config_path,
            system_info: RwLock::new(None),
            snapshot: RwLock::new(None),
            processes: RwLock::new(Arc::new(Vec::new())),
            history: RwLock::new(History::new(capacity)),
            alert_events: Mutex::new(VecDeque::with_capacity(MAX_ALERT_EVENTS)),
            alert_status: RwLock::new(Vec::new()),
            suspended: Mutex::new(HashSet::new()),
            process_streaming: AtomicBool::new(false),
            tray_available: AtomicBool::new(false),
            worker: Mutex::new(None),
        }
    }

    pub fn set_worker(&self, tx: Sender<WorkerMsg>) {
        *self.worker.lock() = Some(tx);
    }

    pub fn notify_worker(&self, msg: WorkerMsg) {
        if let Some(tx) = self.worker.lock().as_ref() {
            let _ = tx.send(msg);
        }
    }

    pub fn streaming(&self) -> bool {
        self.process_streaming.load(Ordering::Relaxed)
    }

    pub fn push_alert_event(&self, ev: AlertEvent) {
        let mut q = self.alert_events.lock();
        while q.len() >= MAX_ALERT_EVENTS {
            q.pop_front();
        }
        q.push_back(ev);
    }
}

/// Managed Tauri state.
pub struct AppState(pub Arc<Shared>);
