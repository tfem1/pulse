//! GPU sampling.
//!
//! * **NVIDIA** — NVML via `nvml-wrapper`, which loads `libnvidia-ml.so` /
//!   `nvml.dll` at runtime. Absence of the driver is not an error.
//! * **AMD / Intel / others** — `sysinfo::Gpus` (sysfs on Linux, DXGI + PDH
//!   GPU engine counters on Windows). On Linux, AMD temperature and power are
//!   read from the card's hwmon directory.
//!
//! sysinfo's Linux backend reloads NVML on every refresh when an NVIDIA card
//! is present, so it is only refreshed when non-NVIDIA GPUs exist (or NVML
//! is unavailable). This keeps Pulse's idle overhead low.

use nvml_wrapper::enum_wrappers::device::{Clock, TemperatureSensor};
use nvml_wrapper::Nvml;

use crate::models::GpuSnapshot;

pub struct GpuCollector {
    nvml: Option<Nvml>,
    sys: Option<sysinfo::Gpus>,
    use_sys: bool,
}

fn is_nvidia(vendor: Option<&str>, model: Option<&str>) -> bool {
    let has = |s: Option<&str>, k: &str| s.is_some_and(|v| v.to_ascii_lowercase().contains(k));
    has(vendor, "nvidia") || has(model, "nvidia") || has(model, "geforce") || has(model, "quadro")
}

impl GpuCollector {
    pub fn new() -> Self {
        let nvml = match Nvml::init() {
            Ok(n) => Some(n),
            Err(e) => {
                log::info!("NVML unavailable ({e}); NVIDIA GPUs will not be sampled via NVML");
                None
            }
        };
        let sys = sysinfo::Gpus::new_with_refreshed_list().ok();
        let has_other = sys
            .as_ref()
            .is_some_and(|g| g.into_iter().any(|g| !is_nvidia(g.vendor(), g.model())));
        let use_sys = sys.is_some() && (nvml.is_none() || has_other);
        Self { nvml, sys, use_sys }
    }

    /// Backends that produced at least one GPU, for the system info panel.
    pub fn backends(&self) -> Vec<String> {
        let mut v = Vec::new();
        if self
            .nvml
            .as_ref()
            .and_then(|n| n.device_count().ok())
            .unwrap_or(0)
            > 0
        {
            v.push("NVML".to_string());
        }
        if self.use_sys {
            v.push(if cfg!(windows) {
                "DXGI/PDH".to_string()
            } else {
                "sysfs".to_string()
            });
        }
        v
    }

    pub fn sample(&mut self) -> Vec<GpuSnapshot> {
        let mut out = Vec::new();
        if let Some(nvml) = &self.nvml {
            let count = nvml.device_count().unwrap_or(0);
            for i in 0..count {
                let Ok(dev) = nvml.device_by_index(i) else {
                    continue;
                };
                let mem = dev.memory_info().ok();
                let fans = dev.num_fans().unwrap_or(0);
                out.push(GpuSnapshot {
                    index: out.len() as u32,
                    name: dev.name().unwrap_or_else(|_| format!("NVIDIA GPU {i}")),
                    vendor: "NVIDIA".into(),
                    backend: "nvml".into(),
                    usage: dev.utilization_rates().ok().map(|u| u.gpu as f32),
                    memory_used: mem.as_ref().map(|m| m.used),
                    memory_total: mem.as_ref().map(|m| m.total),
                    temperature_c: dev
                        .temperature(TemperatureSensor::Gpu)
                        .ok()
                        .map(|t| t as f32),
                    power_w: dev.power_usage().ok().map(|mw| mw as f32 / 1000.0),
                    power_limit_w: dev.enforced_power_limit().ok().map(|mw| mw as f32 / 1000.0),
                    fan_percent: if fans > 0 {
                        dev.fan_speed(0).ok()
                    } else {
                        None
                    },
                    clock_mhz: dev.clock_info(Clock::Graphics).ok(),
                });
            }
        }

        if self.use_sys {
            if let Some(sys) = &mut self.sys {
                sys.refresh(true);
                let skip_nvidia = self.nvml.is_some();
                for g in sys.into_iter() {
                    if skip_nvidia && is_nvidia(g.vendor(), g.model()) {
                        continue;
                    }
                    #[allow(unused_mut)]
                    let mut snap = GpuSnapshot {
                        index: out.len() as u32,
                        name: g.model().unwrap_or("GPU").to_string(),
                        vendor: g.vendor().unwrap_or("Unknown").to_string(),
                        backend: "sysinfo".into(),
                        usage: g.usage(),
                        memory_used: g.used_memory(),
                        memory_total: g.total_memory(),
                        ..Default::default()
                    };
                    #[cfg(target_os = "linux")]
                    linux_extras(g.pci(), &mut snap);
                    out.push(snap);
                }
            }
        }
        out
    }
}

impl Default for GpuCollector {
    fn default() -> Self {
        Self::new()
    }
}

/// Temperature / power / fan for AMD and Intel cards from the PCI device's
/// hwmon directory (amdgpu exposes temp1_input, power1_average, pwm1).
#[cfg(target_os = "linux")]
fn linux_extras(pci: &sysinfo::PCI, snap: &mut GpuSnapshot) {
    use std::fs;
    let dev = format!(
        "/sys/bus/pci/devices/{:04x}:{:02x}:{:02x}.{:x}",
        pci.domain, pci.bus, pci.device, pci.function
    );
    let Ok(hwmons) = fs::read_dir(format!("{dev}/hwmon")) else {
        return;
    };
    let read =
        |p: std::path::PathBuf| -> Option<f64> { fs::read_to_string(p).ok()?.trim().parse().ok() };
    for hw in hwmons.flatten() {
        let p = hw.path();
        if snap.temperature_c.is_none() {
            snap.temperature_c = read(p.join("temp1_input")).map(|v| (v / 1000.0) as f32);
        }
        if snap.power_w.is_none() {
            snap.power_w = read(p.join("power1_average"))
                .or_else(|| read(p.join("power1_input")))
                .map(|v| (v / 1_000_000.0) as f32);
        }
        if snap.power_limit_w.is_none() {
            snap.power_limit_w = read(p.join("power1_cap")).map(|v| (v / 1_000_000.0) as f32);
        }
        if snap.fan_percent.is_none() {
            snap.fan_percent = read(p.join("pwm1")).map(|v| (v / 255.0 * 100.0).round() as u32);
        }
    }
    if snap.clock_mhz.is_none() {
        // amdgpu: "1: 1800Mhz *" marks the active shader clock level.
        if let Ok(text) = fs::read_to_string(format!("{dev}/pp_dpm_sclk")) {
            snap.clock_mhz = text
                .lines()
                .find(|l| l.trim_end().ends_with('*'))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|v| {
                    v.trim_end_matches(|c: char| !c.is_ascii_digit())
                        .parse()
                        .ok()
                });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nvidia_detection() {
        assert!(is_nvidia(Some("NVIDIA Corporation"), None));
        assert!(is_nvidia(None, Some("GeForce RTX 4070")));
        assert!(!is_nvidia(
            Some("Advanced Micro Devices, Inc. [AMD/ATI]"),
            Some("Navi 31")
        ));
    }

    #[test]
    fn collector_never_panics_without_gpus() {
        let mut c = GpuCollector::new();
        let _ = c.sample();
        let _ = c.backends();
    }
}
