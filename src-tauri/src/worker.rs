//! Background sampling thread.
//!
//! One dedicated OS thread owns the [`Sampler`]. Each tick it samples the
//! machine, appends to the history, evaluates alert rules, sends desktop
//! notifications, refreshes the tray, and — only while the window is visible —
//! emits `pulse://snapshot` (and `pulse://processes` when the process page is
//! open) to the webview. Ticks are scheduled against a fixed deadline so the
//! cadence does not drift with sampling time.

use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use pulse_core::alerts::{self, AlertAction, AlertEngine, AlertEvent, AlertEventKind, AlertMetric};
use pulse_core::history::HistoryPoint;
use pulse_core::sampler::{SampleOptions, Sampler};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::state::{Shared, WorkerMsg};
use crate::tray;

pub const EVENT_SNAPSHOT: &str = "pulse://snapshot";
pub const EVENT_PROCESSES: &str = "pulse://processes";
pub const EVENT_ALERT: &str = "pulse://alert";
pub const EVENT_FATAL: &str = "pulse://fatal";

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(true) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false)
}

pub fn format_alert_value(metric: AlertMetric, v: f64) -> String {
    match metric {
        AlertMetric::CpuTotal
        | AlertMetric::MemoryPercent
        | AlertMetric::SwapPercent
        | AlertMetric::DiskUsagePercent
        | AlertMetric::GpuUsage => format!("{v:.0}%"),
        AlertMetric::DiskRead
        | AlertMetric::DiskWrite
        | AlertMetric::NetRx
        | AlertMetric::NetTx => {
            format!("{v:.1} MB/s")
        }
        AlertMetric::GpuTemperature | AlertMetric::Temperature => format!("{v:.0} °C"),
    }
}

fn notify(app: &AppHandle, shared: &Shared, ev: &AlertEvent) {
    if ev.kind != AlertEventKind::Fired || ev.action != AlertAction::Notify {
        return;
    }
    let cfg = shared.config.read().notifications.clone();
    if !cfg.enabled {
        return;
    }
    if cfg.quiet_hours_enabled && alerts::quiet_hours_now(&cfg.quiet_start, &cfg.quiet_end) {
        return;
    }
    let body = format!(
        "{} (threshold {})",
        format_alert_value(ev.metric, ev.value),
        format_alert_value(ev.metric, ev.threshold)
    );
    if let Err(e) = app
        .notification()
        .builder()
        .title(format!("Pulse · {}", ev.rule_name))
        .body(body)
        .show()
    {
        log::warn!("could not show notification: {e}");
    }
}

pub fn spawn(app: AppHandle, shared: Arc<Shared>) {
    let (tx, rx) = mpsc::channel::<WorkerMsg>();
    shared.set_worker(tx);

    thread::Builder::new()
        .name("pulse-sampler".into())
        .spawn(move || {
            let mut sampler = match Sampler::new() {
                Ok(s) => s,
                Err(e) => {
                    log::error!("sampler failed to start: {e}");
                    let _ = app.emit(EVENT_FATAL, e.to_string());
                    return;
                }
            };
            *shared.system_info.write() = Some(sampler.system_info());

            let mut engine = AlertEngine::new();
            let mut tick: u64 = 0;
            let mut next = Instant::now();

            loop {
                let cfg = shared.config.read().clone();
                let m = &cfg.monitoring;
                let visible = window_visible(&app);

                let opts = SampleOptions {
                    disks: m.sample_disks,
                    network: m.sample_network,
                    gpu: m.sample_gpu,
                    sensors_enabled: m.sample_sensors,
                    sensors_due: tick % m.sensor_every.max(1) as u64 == 0,
                };

                // Full process refresh only when someone is looking at it.
                let want_procs = visible && shared.streaming();
                let procs = want_procs.then(|| {
                    let suspended = shared.suspended.lock().clone();
                    Arc::new(sampler.processes(&suspended))
                });

                let snap = Arc::new(sampler.sample(opts));

                {
                    let mut h = shared.history.write();
                    let cap = cfg.history_capacity();
                    if h.capacity() != cap {
                        h.set_capacity(cap);
                    }
                    h.push(HistoryPoint::from(snap.as_ref()));
                }

                let events = engine.evaluate(&cfg.alerts, &snap);
                *shared.alert_status.write() = engine.statuses(&cfg.alerts);
                for ev in events {
                    notify(&app, &shared, &ev);
                    let _ = app.emit(EVENT_ALERT, &ev);
                    shared.push_alert_event(ev);
                }

                if visible {
                    let _ = app.emit(EVENT_SNAPSHOT, snap.as_ref());
                    if let Some(p) = &procs {
                        let _ = app.emit(EVENT_PROCESSES, p.as_ref());
                    }
                }
                if let Some(p) = procs {
                    *shared.processes.write() = p;
                }

                // Tray text changes are cheap but not free: every 2 s.
                if shared.tray_available.load(Ordering::Relaxed) && m.tray_stats && tick % 2 == 0 {
                    tray::update(&app, &snap);
                }

                *shared.snapshot.write() = Some(snap);
                tick = tick.wrapping_add(1);

                // Wait for the next deadline or an early wake-up.
                let interval = Duration::from_millis(m.refresh_ms);
                next += interval;
                let now = Instant::now();
                if next < now {
                    next = now + interval; // fell behind (suspend/resume): resync
                }
                loop {
                    match rx.recv_timeout(next.saturating_duration_since(Instant::now())) {
                        Ok(WorkerMsg::Shutdown) | Err(RecvTimeoutError::Disconnected) => return,
                        Ok(WorkerMsg::SampleNow) => {
                            next = Instant::now();
                            break;
                        }
                        Ok(WorkerMsg::ConfigChanged) => {
                            let new_interval =
                                Duration::from_millis(shared.config.read().monitoring.refresh_ms);
                            if new_interval != interval {
                                next = Instant::now() + new_interval.min(interval);
                            }
                            continue;
                        }
                        Err(RecvTimeoutError::Timeout) => break,
                    }
                }
            }
        })
        .expect("failed to spawn sampler thread");
}
