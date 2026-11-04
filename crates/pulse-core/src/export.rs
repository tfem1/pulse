//! Export of the rolling history to CSV or JSON.

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{PulseError, Result};
use crate::history::HistoryPoint;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
}

fn iso(ms: u64) -> String {
    chrono::DateTime::from_timestamp_millis(ms as i64)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_default()
}

fn opt<T: ToString>(v: Option<T>) -> String {
    v.map(|x| x.to_string()).unwrap_or_default()
}

/// Write `points` as CSV. One row per sample; per-core columns are added for
/// the largest core count present.
pub fn write_csv<W: Write>(points: &[HistoryPoint], out: W) -> Result<()> {
    let cores = points.iter().map(|p| p.per_core.len()).max().unwrap_or(0);
    let mut w = csv::Writer::from_writer(out);
    let mut header: Vec<String> = [
        "timestamp",
        "timestamp_ms",
        "cpu_percent",
        "mem_used_bytes",
        "mem_total_bytes",
        "swap_used_bytes",
        "swap_total_bytes",
        "disk_read_bps",
        "disk_write_bps",
        "net_rx_bps",
        "net_tx_bps",
        "gpu_usage_percent",
        "gpu_mem_used_bytes",
        "gpu_temp_c",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    header.extend((0..cores).map(|i| format!("cpu{i}_percent")));
    w.write_record(&header).map_err(csv_err)?;

    for p in points {
        let mut row = vec![
            iso(p.timestamp_ms),
            p.timestamp_ms.to_string(),
            format!("{:.2}", p.cpu),
            p.mem_used.to_string(),
            p.mem_total.to_string(),
            p.swap_used.to_string(),
            p.swap_total.to_string(),
            format!("{:.0}", p.disk_read_bps),
            format!("{:.0}", p.disk_write_bps),
            format!("{:.0}", p.net_rx_bps),
            format!("{:.0}", p.net_tx_bps),
            opt(p.gpu_usage.map(|v| format!("{v:.2}"))),
            opt(p.gpu_mem_used),
            opt(p.gpu_temp_c.map(|v| format!("{v:.1}"))),
        ];
        row.extend((0..cores).map(|i| opt(p.per_core.get(i).map(|v| format!("{v:.2}")))));
        w.write_record(&row).map_err(csv_err)?;
    }
    w.flush()?;
    Ok(())
}

fn csv_err(e: csv::Error) -> PulseError {
    PulseError::Other(format!("CSV write failed: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonExport<'a> {
    app: &'static str,
    exported_at: String,
    sample_count: usize,
    samples: &'a [HistoryPoint],
}

pub fn write_json<W: Write>(points: &[HistoryPoint], out: W) -> Result<()> {
    let doc = JsonExport {
        app: "pulse",
        exported_at: chrono::Utc::now().to_rfc3339(),
        sample_count: points.len(),
        samples: points,
    };
    serde_json::to_writer_pretty(out, &doc)
        .map_err(|e| PulseError::Other(format!("JSON write failed: {e}")))
}

/// Export to a file, returning the number of samples written.
pub fn export_to_file(points: &[HistoryPoint], path: &Path, format: ExportFormat) -> Result<usize> {
    let file = File::create(path)?;
    let mut out = BufWriter::new(file);
    match format {
        ExportFormat::Csv => write_csv(points, &mut out)?,
        ExportFormat::Json => write_json(points, &mut out)?,
    }
    out.flush()?;
    Ok(points.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pts() -> Vec<HistoryPoint> {
        vec![HistoryPoint {
            timestamp_ms: 1_700_000_000_000,
            cpu: 12.5,
            per_core: vec![10.0, 15.0],
            mem_used: 1024,
            mem_total: 4096,
            swap_used: 0,
            swap_total: 0,
            disk_read_bps: 1.0,
            disk_write_bps: 2.0,
            net_rx_bps: 3.0,
            net_tx_bps: 4.0,
            gpu_usage: None,
            gpu_mem_used: None,
            gpu_temp_c: Some(55.0),
        }]
    }

    #[test]
    fn csv_has_header_and_core_columns() {
        let mut buf = Vec::new();
        write_csv(&pts(), &mut buf).unwrap();
        let text = String::from_utf8(buf).unwrap();
        let mut lines = text.lines();
        let header = lines.next().unwrap();
        assert!(header.ends_with("cpu0_percent,cpu1_percent"));
        let row = lines.next().unwrap();
        assert!(row.starts_with("2023-11-14T22:13:20.000Z,1700000000000,12.50"));
        assert!(row.contains(",,,55.0,")); // empty GPU usage/mem, temp present
    }

    #[test]
    fn json_round_trips() {
        let mut buf = Vec::new();
        write_json(&pts(), &mut buf).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&buf).unwrap();
        assert_eq!(v["sampleCount"], 1);
        assert_eq!(v["samples"][0]["perCore"][1], 15.0);
    }

    #[test]
    fn export_writes_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.csv");
        assert_eq!(export_to_file(&pts(), &path, ExportFormat::Csv).unwrap(), 1);
        assert!(std::fs::metadata(&path).unwrap().len() > 0);
    }
}
