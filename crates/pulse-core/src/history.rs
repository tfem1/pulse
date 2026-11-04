//! Fixed-capacity rolling history of compact samples.
//!
//! The full [`Snapshot`] is large (disks, interfaces, sensors); the history
//! keeps only the scalar series needed by the charts and exports, so 60
//! minutes at 1 s stay well under a megabyte.

use std::collections::VecDeque;

use serde::Serialize;

use crate::models::Snapshot;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    pub timestamp_ms: u64,
    pub cpu: f32,
    pub per_core: Vec<f32>,
    pub mem_used: u64,
    pub mem_total: u64,
    pub swap_used: u64,
    pub swap_total: u64,
    pub disk_read_bps: f64,
    pub disk_write_bps: f64,
    pub net_rx_bps: f64,
    pub net_tx_bps: f64,
    /// Usage of the first GPU, if any.
    pub gpu_usage: Option<f32>,
    pub gpu_mem_used: Option<u64>,
    pub gpu_temp_c: Option<f32>,
}

impl From<&Snapshot> for HistoryPoint {
    fn from(s: &Snapshot) -> Self {
        let gpu = s.gpus.as_ref().and_then(|g| g.first());
        HistoryPoint {
            timestamp_ms: s.timestamp_ms,
            cpu: s.cpu.total,
            per_core: s.cpu.per_core.clone(),
            mem_used: s.memory.used,
            mem_total: s.memory.total,
            swap_used: s.memory.swap_used,
            swap_total: s.memory.swap_total,
            disk_read_bps: s.disk_read_bps,
            disk_write_bps: s.disk_write_bps,
            net_rx_bps: s.net_rx_bps,
            net_tx_bps: s.net_tx_bps,
            gpu_usage: gpu.and_then(|g| g.usage),
            gpu_mem_used: gpu.and_then(|g| g.memory_used),
            gpu_temp_c: gpu.and_then(|g| g.temperature_c),
        }
    }
}

#[derive(Debug, Clone)]
pub struct History {
    points: VecDeque<HistoryPoint>,
    capacity: usize,
}

impl History {
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        Self {
            points: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, p: HistoryPoint) {
        while self.points.len() >= self.capacity {
            self.points.pop_front();
        }
        self.points.push_back(p);
    }

    /// Change the capacity, dropping the oldest points if it shrinks.
    pub fn set_capacity(&mut self, capacity: usize) {
        self.capacity = capacity.max(1);
        while self.points.len() > self.capacity {
            self.points.pop_front();
        }
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    pub fn len(&self) -> usize {
        self.points.len()
    }

    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }

    pub fn clear(&mut self) {
        self.points.clear();
    }

    pub fn iter(&self) -> impl Iterator<Item = &HistoryPoint> {
        self.points.iter()
    }

    /// Points newer than `since_ms` (all points when `None`).
    pub fn since(&self, since_ms: Option<u64>) -> Vec<HistoryPoint> {
        match since_ms {
            None => self.points.iter().cloned().collect(),
            Some(t) => self
                .points
                .iter()
                .filter(|p| p.timestamp_ms > t)
                .cloned()
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(t: u64) -> HistoryPoint {
        let s = Snapshot {
            timestamp_ms: t,
            ..Default::default()
        };
        HistoryPoint::from(&s)
    }

    #[test]
    fn evicts_oldest_when_full() {
        let mut h = History::new(3);
        for t in 0..5 {
            h.push(point(t));
        }
        let ts: Vec<u64> = h.iter().map(|p| p.timestamp_ms).collect();
        assert_eq!(ts, vec![2, 3, 4]);
    }

    #[test]
    fn shrinking_capacity_drops_oldest() {
        let mut h = History::new(10);
        for t in 0..10 {
            h.push(point(t));
        }
        h.set_capacity(4);
        assert_eq!(h.len(), 4);
        assert_eq!(h.iter().next().unwrap().timestamp_ms, 6);
    }

    #[test]
    fn since_filters_by_timestamp() {
        let mut h = History::new(10);
        for t in 0..5 {
            h.push(point(t * 1000));
        }
        assert_eq!(h.since(Some(2000)).len(), 2);
        assert_eq!(h.since(None).len(), 5);
    }
}
