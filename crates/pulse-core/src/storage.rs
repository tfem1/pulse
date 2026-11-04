//! "Top space consumers": size of the immediate children of a directory.
//!
//! The walk is iterative (no recursion limit issues), never follows symlinks,
//! stays on the starting filesystem on Unix, and is bounded by an item budget
//! and a deadline so scanning `/` or `C:\` can never freeze the app.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::error::{PulseError, Result};
use crate::models::{DirEntrySize, ScanResult};

#[derive(Debug, Clone, Copy)]
pub struct ScanLimits {
    pub max_items: u64,
    pub deadline: Duration,
    pub top_n: usize,
}

impl Default for ScanLimits {
    fn default() -> Self {
        Self {
            max_items: 2_000_000,
            deadline: Duration::from_secs(20),
            top_n: 25,
        }
    }
}

#[cfg(unix)]
fn device_of(meta: &fs::Metadata) -> Option<u64> {
    use std::os::unix::fs::MetadataExt;
    Some(meta.dev())
}

#[cfg(not(unix))]
fn device_of(_meta: &fs::Metadata) -> Option<u64> {
    None
}

struct Budget {
    items: u64,
    errors: u64,
    started: Instant,
    limits: ScanLimits,
    truncated: bool,
}

impl Budget {
    fn exhausted(&mut self) -> bool {
        if self.items >= self.limits.max_items || self.started.elapsed() >= self.limits.deadline {
            self.truncated = true;
        }
        self.truncated
    }
}

/// Total size and item count below `root` (inclusive of `root` itself).
fn tree_size(root: &Path, root_dev: Option<u64>, budget: &mut Budget) -> (u64, u64) {
    let mut size = 0u64;
    let mut items = 0u64;
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if budget.exhausted() {
            break;
        }
        let rd = match fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(_) => {
                budget.errors += 1;
                continue;
            }
        };
        for entry in rd {
            let Ok(entry) = entry else {
                budget.errors += 1;
                continue;
            };
            // symlink_metadata: never follow links.
            let Ok(meta) = entry.path().symlink_metadata() else {
                budget.errors += 1;
                continue;
            };
            budget.items += 1;
            items += 1;
            if meta.is_dir() {
                if root_dev.is_none() || device_of(&meta) == root_dev {
                    stack.push(entry.path());
                }
            } else if meta.is_file() {
                size = size.saturating_add(meta.len());
            }
            // Item budget: cheap compare on every entry; clock check every 4096.
            if budget.items >= budget.limits.max_items
                || (budget.items % 4096 == 0 && budget.exhausted())
            {
                budget.truncated = true;
                break;
            }
        }
    }
    (size, items)
}

/// Scan `path` and return its children sorted by size (largest first).
pub fn scan_directory(path: &Path, limits: ScanLimits) -> Result<ScanResult> {
    let started = Instant::now();
    let meta = fs::symlink_metadata(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => {
            PulseError::NotFound(format!("{} does not exist", path.display()))
        }
        std::io::ErrorKind::PermissionDenied => {
            PulseError::PermissionDenied(format!("cannot read {}", path.display()))
        }
        _ => PulseError::Io(e),
    })?;
    if !meta.is_dir() {
        return Err(PulseError::InvalidInput(format!(
            "{} is not a directory",
            path.display()
        )));
    }
    let root_dev = device_of(&meta);
    let mut budget = Budget {
        items: 0,
        errors: 0,
        started,
        limits,
        truncated: false,
    };

    let rd = fs::read_dir(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => {
            PulseError::PermissionDenied(format!("cannot list {}", path.display()))
        }
        _ => PulseError::Io(e),
    })?;

    let mut entries = Vec::new();
    for entry in rd {
        let Ok(entry) = entry else {
            budget.errors += 1;
            continue;
        };
        let p = entry.path();
        let Ok(m) = p.symlink_metadata() else {
            budget.errors += 1;
            continue;
        };
        budget.items += 1;
        let name = entry.file_name().to_string_lossy().into_owned();
        let (size, items) = if m.is_dir() {
            if root_dev.is_some() && device_of(&m) != root_dev {
                (0, 0) // another mount point: skip, it has its own partition entry
            } else {
                tree_size(&p, root_dev, &mut budget)
            }
        } else if m.is_file() {
            (m.len(), 0)
        } else {
            (0, 0)
        };
        entries.push(DirEntrySize {
            name,
            path: p.to_string_lossy().into_owned(),
            size,
            is_dir: m.is_dir(),
            items,
        });
    }

    let total_size = entries.iter().map(|e| e.size).sum();
    entries.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
    entries.truncate(limits.top_n);

    Ok(ScanResult {
        path: path.to_string_lossy().into_owned(),
        total_size,
        total_items: budget.items,
        entries,
        truncated: budget.truncated,
        errors: budget.errors,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_children_and_sorts() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("big")).unwrap();
        fs::write(dir.path().join("big").join("a.bin"), vec![0u8; 5000]).unwrap();
        fs::create_dir(dir.path().join("big").join("nested")).unwrap();
        fs::write(
            dir.path().join("big").join("nested").join("b.bin"),
            vec![0u8; 3000],
        )
        .unwrap();
        fs::write(dir.path().join("small.txt"), vec![0u8; 10]).unwrap();

        let r = scan_directory(dir.path(), ScanLimits::default()).unwrap();
        assert_eq!(r.entries[0].name, "big");
        assert_eq!(r.entries[0].size, 8000);
        assert!(r.entries[0].is_dir);
        assert_eq!(r.entries[1].size, 10);
        assert_eq!(r.total_size, 8010);
        assert!(!r.truncated);
    }

    #[test]
    fn respects_item_budget() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("d")).unwrap();
        for i in 0..50 {
            fs::write(dir.path().join("d").join(format!("{i}")), b"x").unwrap();
        }
        let limits = ScanLimits {
            max_items: 10,
            ..Default::default()
        };
        let r = scan_directory(dir.path(), limits).unwrap();
        assert!(r.truncated);
    }

    #[test]
    fn rejects_files_and_missing_paths() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("f");
        fs::write(&f, b"x").unwrap();
        assert!(matches!(
            scan_directory(&f, ScanLimits::default()),
            Err(PulseError::InvalidInput(_))
        ));
        assert!(matches!(
            scan_directory(&dir.path().join("nope"), ScanLimits::default()),
            Err(PulseError::NotFound(_))
        ));
    }
}
