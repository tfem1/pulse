//! Alert rules and the evaluation engine.
//!
//! A rule fires when its metric stays on the wrong side of the threshold for
//! at least `duration_secs`. After firing it will not fire again until the
//! condition clears or `cooldown_secs` elapse, whichever is later, so a
//! saturated CPU does not spam notifications. A "resolved" event is emitted
//! when a firing rule's condition clears.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::models::{SensorKind, Snapshot};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum AlertMetric {
    /// Total CPU usage, %.
    CpuTotal,
    /// RAM used, % of total.
    MemoryPercent,
    /// Swap used, % of total.
    SwapPercent,
    /// Used space, % — of the partition named in `target`, or the fullest one.
    DiskUsagePercent,
    /// Aggregate disk read, MB/s.
    DiskRead,
    /// Aggregate disk write, MB/s.
    DiskWrite,
    /// Aggregate network download, MB/s (or interface in `target`).
    NetRx,
    /// Aggregate network upload, MB/s (or interface in `target`).
    NetTx,
    /// GPU usage, % — GPU index in `target`, or the busiest one.
    GpuUsage,
    /// GPU temperature, °C — GPU index in `target`, or the hottest one.
    GpuTemperature,
    /// Hottest temperature sensor, °C (or sensor id in `target`).
    Temperature,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Comparator {
    Above,
    Below,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AlertAction {
    /// Desktop notification + in-app log.
    Notify,
    /// In-app log only.
    Log,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub metric: AlertMetric,
    #[serde(default)]
    pub target: Option<String>,
    pub comparator: Comparator,
    pub threshold: f64,
    pub duration_secs: u32,
    pub cooldown_secs: u32,
    pub action: AlertAction,
}

/// Rules shipped with a fresh install (enabled, so alerts work out of the box).
pub fn default_rules() -> Vec<AlertRule> {
    vec![
        AlertRule {
            id: "default-cpu".into(),
            name: "Sustained high CPU".into(),
            enabled: true,
            metric: AlertMetric::CpuTotal,
            target: None,
            comparator: Comparator::Above,
            threshold: 90.0,
            duration_secs: 30,
            cooldown_secs: 300,
            action: AlertAction::Notify,
        },
        AlertRule {
            id: "default-memory".into(),
            name: "Memory almost full".into(),
            enabled: true,
            metric: AlertMetric::MemoryPercent,
            target: None,
            comparator: Comparator::Above,
            threshold: 90.0,
            duration_secs: 15,
            cooldown_secs: 300,
            action: AlertAction::Notify,
        },
        AlertRule {
            id: "default-disk".into(),
            name: "Disk almost full".into(),
            enabled: true,
            metric: AlertMetric::DiskUsagePercent,
            target: None,
            comparator: Comparator::Above,
            threshold: 95.0,
            duration_secs: 0,
            cooldown_secs: 3600,
            action: AlertAction::Notify,
        },
    ]
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AlertEventKind {
    Fired,
    Resolved,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertEvent {
    pub rule_id: String,
    pub rule_name: String,
    pub kind: AlertEventKind,
    pub metric: AlertMetric,
    pub value: f64,
    pub threshold: f64,
    pub timestamp_ms: u64,
    pub action: AlertAction,
}

#[derive(Debug, Default, Clone)]
struct RuleState {
    breach_since: Option<u64>,
    firing: bool,
    last_fired: Option<u64>,
}

/// Status of each rule, exposed to the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleStatus {
    pub rule_id: String,
    pub firing: bool,
    pub breaching: bool,
    pub last_value: Option<f64>,
    pub last_fired_ms: Option<u64>,
}

#[derive(Debug, Default)]
pub struct AlertEngine {
    states: HashMap<String, RuleState>,
    last_values: HashMap<String, f64>,
}

const MB: f64 = 1024.0 * 1024.0;

/// Extract the value a rule watches from a snapshot. `None` means the metric
/// is currently unavailable (e.g. no GPU), in which case the rule is idle.
pub fn metric_value(s: &Snapshot, metric: AlertMetric, target: Option<&str>) -> Option<f64> {
    let target = target.map(str::trim).filter(|t| !t.is_empty());
    let pct = |used: u64, total: u64| (total > 0).then(|| used as f64 / total as f64 * 100.0);
    match metric {
        AlertMetric::CpuTotal => Some(s.cpu.total as f64),
        AlertMetric::MemoryPercent => pct(s.memory.used, s.memory.total),
        AlertMetric::SwapPercent => pct(s.memory.swap_used, s.memory.swap_total),
        AlertMetric::DiskUsagePercent => {
            let disks = s.disks.as_ref()?;
            disks
                .iter()
                .filter(|d| target.is_none_or(|t| d.mount_point == t || d.name == t))
                .filter_map(|d| pct(d.total.saturating_sub(d.available), d.total))
                .reduce(f64::max)
        }
        AlertMetric::DiskRead => s.disks.as_ref().map(|_| s.disk_read_bps / MB),
        AlertMetric::DiskWrite => s.disks.as_ref().map(|_| s.disk_write_bps / MB),
        AlertMetric::NetRx | AlertMetric::NetTx => {
            let nets = s.networks.as_ref()?;
            let rx = metric == AlertMetric::NetRx;
            match target {
                Some(t) => nets
                    .iter()
                    .find(|n| n.name == t)
                    .map(|n| if rx { n.rx_bps } else { n.tx_bps } / MB),
                None => Some(if rx { s.net_rx_bps } else { s.net_tx_bps } / MB),
            }
        }
        AlertMetric::GpuUsage | AlertMetric::GpuTemperature => {
            let gpus = s.gpus.as_ref()?;
            gpus.iter()
                .filter(|g| target.is_none_or(|t| t == g.index.to_string()))
                .filter_map(|g| {
                    if metric == AlertMetric::GpuUsage {
                        g.usage.map(f64::from)
                    } else {
                        g.temperature_c.map(f64::from)
                    }
                })
                .reduce(f64::max)
        }
        AlertMetric::Temperature => {
            let sensors = s.sensors.as_ref()?;
            sensors
                .readings
                .iter()
                .filter(|r| r.kind == SensorKind::Temperature)
                .filter(|r| target.is_none_or(|t| r.id == t))
                .map(|r| r.value)
                .reduce(f64::max)
        }
    }
}

impl AlertEngine {
    pub fn new() -> Self {
        Self::default()
    }

    /// Evaluate every enabled rule against a snapshot and return the events
    /// produced by this sample.
    pub fn evaluate(&mut self, rules: &[AlertRule], snap: &Snapshot) -> Vec<AlertEvent> {
        let now = snap.timestamp_ms;
        let mut events = Vec::new();
        // Forget state for rules that were deleted.
        self.states
            .retain(|id, _| rules.iter().any(|r| &r.id == id));
        self.last_values
            .retain(|id, _| rules.iter().any(|r| &r.id == id));

        for rule in rules {
            let state = self.states.entry(rule.id.clone()).or_default();
            let value = if rule.enabled {
                metric_value(snap, rule.metric, rule.target.as_deref())
            } else {
                None
            };
            match value {
                Some(v) => {
                    self.last_values.insert(rule.id.clone(), v);
                }
                None => {
                    self.last_values.remove(&rule.id);
                }
            }

            let breaching = match value {
                Some(v) => match rule.comparator {
                    Comparator::Above => v > rule.threshold,
                    Comparator::Below => v < rule.threshold,
                },
                None => false,
            };

            if !breaching {
                if state.firing {
                    events.push(AlertEvent {
                        rule_id: rule.id.clone(),
                        rule_name: rule.name.clone(),
                        kind: AlertEventKind::Resolved,
                        metric: rule.metric,
                        value: value.unwrap_or(f64::NAN),
                        threshold: rule.threshold,
                        timestamp_ms: now,
                        action: rule.action,
                    });
                }
                state.breach_since = None;
                state.firing = false;
                continue;
            }

            let since = *state.breach_since.get_or_insert(now);
            let held_long_enough = now.saturating_sub(since) >= rule.duration_secs as u64 * 1000;
            let cooled_down = state
                .last_fired
                .is_none_or(|t| now.saturating_sub(t) >= rule.cooldown_secs as u64 * 1000);

            if held_long_enough && !state.firing && cooled_down {
                state.firing = true;
                state.last_fired = Some(now);
                events.push(AlertEvent {
                    rule_id: rule.id.clone(),
                    rule_name: rule.name.clone(),
                    kind: AlertEventKind::Fired,
                    metric: rule.metric,
                    value: value.unwrap_or_default(),
                    threshold: rule.threshold,
                    timestamp_ms: now,
                    action: rule.action,
                });
            }
        }
        events
    }

    pub fn statuses(&self, rules: &[AlertRule]) -> Vec<RuleStatus> {
        rules
            .iter()
            .map(|r| {
                let st = self.states.get(&r.id);
                RuleStatus {
                    rule_id: r.id.clone(),
                    firing: st.is_some_and(|s| s.firing),
                    breaching: st.is_some_and(|s| s.breach_since.is_some()),
                    last_value: self.last_values.get(&r.id).copied(),
                    last_fired_ms: st.and_then(|s| s.last_fired),
                }
            })
            .collect()
    }
}

/// Whether `now` (minutes since local midnight) falls into the quiet window
/// `[start, end)`, which may wrap around midnight.
pub fn in_quiet_hours(now_min: u32, start_min: u32, end_min: u32) -> bool {
    if start_min == end_min {
        return false;
    }
    if start_min < end_min {
        now_min >= start_min && now_min < end_min
    } else {
        now_min >= start_min || now_min < end_min
    }
}

/// Parse "HH:MM" into minutes since midnight.
pub fn parse_hhmm(s: &str) -> Option<u32> {
    use chrono::Timelike;
    let t = chrono::NaiveTime::parse_from_str(s, "%H:%M").ok()?;
    Some(t.hour() * 60 + t.minute())
}

/// Is the local wall clock currently in the configured quiet hours?
pub fn quiet_hours_now(start: &str, end: &str) -> bool {
    use chrono::Timelike;
    let (Some(s), Some(e)) = (parse_hhmm(start), parse_hhmm(end)) else {
        return false;
    };
    let now = chrono::Local::now();
    in_quiet_hours(now.hour() * 60 + now.minute(), s, e)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CpuSnapshot, MemorySnapshot};

    fn snap(t: u64, cpu: f32) -> Snapshot {
        Snapshot {
            timestamp_ms: t,
            cpu: CpuSnapshot {
                total: cpu,
                ..Default::default()
            },
            memory: MemorySnapshot {
                total: 100,
                used: 50,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    fn rule(duration: u32, cooldown: u32) -> AlertRule {
        AlertRule {
            id: "r".into(),
            name: "cpu".into(),
            enabled: true,
            metric: AlertMetric::CpuTotal,
            target: None,
            comparator: Comparator::Above,
            threshold: 80.0,
            duration_secs: duration,
            cooldown_secs: cooldown,
            action: AlertAction::Notify,
        }
    }

    #[test]
    fn fires_only_after_duration() {
        let rules = vec![rule(3, 0)];
        let mut e = AlertEngine::new();
        assert!(e.evaluate(&rules, &snap(0, 95.0)).is_empty());
        assert!(e.evaluate(&rules, &snap(2000, 95.0)).is_empty());
        let ev = e.evaluate(&rules, &snap(3000, 95.0));
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0].kind, AlertEventKind::Fired);
        // Still breaching: no duplicate.
        assert!(e.evaluate(&rules, &snap(4000, 95.0)).is_empty());
    }

    #[test]
    fn interruption_resets_duration() {
        let rules = vec![rule(3, 0)];
        let mut e = AlertEngine::new();
        e.evaluate(&rules, &snap(0, 95.0));
        e.evaluate(&rules, &snap(2000, 10.0));
        assert!(e.evaluate(&rules, &snap(4000, 95.0)).is_empty());
    }

    #[test]
    fn resolves_and_respects_cooldown() {
        let rules = vec![rule(0, 60)];
        let mut e = AlertEngine::new();
        assert_eq!(
            e.evaluate(&rules, &snap(0, 95.0))[0].kind,
            AlertEventKind::Fired
        );
        assert_eq!(
            e.evaluate(&rules, &snap(1000, 10.0))[0].kind,
            AlertEventKind::Resolved
        );
        // Within cooldown: no new fire.
        assert!(e.evaluate(&rules, &snap(2000, 95.0)).is_empty());
        // After cooldown elapsed while still breaching: fires again.
        assert_eq!(
            e.evaluate(&rules, &snap(61_000, 95.0))[0].kind,
            AlertEventKind::Fired
        );
    }

    #[test]
    fn disabled_rules_never_fire() {
        let mut r = rule(0, 0);
        r.enabled = false;
        let mut e = AlertEngine::new();
        assert!(e.evaluate(&[r], &snap(0, 100.0)).is_empty());
    }

    #[test]
    fn below_comparator() {
        let mut r = rule(0, 0);
        r.comparator = Comparator::Below;
        r.threshold = 10.0;
        let mut e = AlertEngine::new();
        assert_eq!(e.evaluate(&[r], &snap(0, 5.0)).len(), 1);
    }

    #[test]
    fn unavailable_metric_is_idle() {
        let mut r = rule(0, 0);
        r.metric = AlertMetric::GpuUsage;
        let mut e = AlertEngine::new();
        assert!(e.evaluate(&[r], &snap(0, 100.0)).is_empty());
    }

    #[test]
    fn quiet_hours_wraps_midnight() {
        let (s, e) = (parse_hhmm("22:00").unwrap(), parse_hhmm("07:00").unwrap());
        assert!(in_quiet_hours(23 * 60, s, e));
        assert!(in_quiet_hours(3 * 60, s, e));
        assert!(!in_quiet_hours(12 * 60, s, e));
        assert!(in_quiet_hours(13 * 60, 12 * 60, 14 * 60));
        assert!(!in_quiet_hours(5, 10, 10));
    }
}
