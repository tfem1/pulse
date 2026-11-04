# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-04

### Fixed

- Storage: **Find largest folders** now starts the scan immediately, shows
  "Scanning…" on the button and scrolls to the results. Before, it only filled
  in the path, so nothing seemed to happen.
- Storage: **Up** computed wrong parent folders for Windows drive and UNC paths
  (`C:\Users` went to `C:` instead of `C:\`).
- A newer scan can no longer be overwritten by the result of an older, slower
  one.
- Linux installer: read GitHub's compact JSON (no package was found) and
  silence gawk's escape-sequence warning.

### Added

- One-line installers: `curl … | sh` for Linux (`.deb` via apt, or a per-user
  AppImage with a menu entry) and `irm … | iex` for Windows (per-user NSIS
  setup). Both verify the SHA-256 digest of the download, and both support
  `--version` and `--uninstall`.

### Changed

- Releases are automatic: pushing a new version to `main` builds and publishes
  it. No tag or manual step is needed, and a release only goes public once every
  platform built successfully.
- The installers explain that a release is being built, instead of failing,
  when one is in progress.

## [0.1.0] - 2026-11-04

### Added

- Rust sampling engine (`pulse-core`) on a dedicated thread: CPU (total, per
  core, frequency, load), memory and swap with OS breakdown, per-partition disk
  usage and I/O, per-interface network throughput, GPUs (NVML for NVIDIA, sysfs /
  DXGI for others), hardware sensors (hwmon on Linux, LibreHardwareMonitor /
  ACPI via WMI on Windows), uptime and system information.
- Platform abstraction layer behind `#[cfg(target_os)]` modules for Linux and
  Windows, with a compiling fallback for other targets.
- Eight pages with a collapsible sidebar and top bar: Dashboard, Performance
  (CPU / Memory / Disk / Network / GPU tabs with 60 s / 5 min / 15 min ranges),
  Processes, Storage, Network, Sensors, Alerts, Settings.
- Process manager: virtualised table, sort, search, tree view, end / force kill
  / suspend / resume / priority, confirmation dialogs, precise permission errors,
  full keyboard control.
- Storage: partition usage, live I/O per partition, bounded "top space
  consumers" scanner.
- Network: per-interface details and charts, TCP state summary and listening
  sockets.
- Alert engine evaluated in the backend (duration, cooldown, quiet hours) with
  desktop notifications and an event log.
- Settings with six sub-tabs: Appearance, Monitoring, Processes, Notifications,
  Data, About.
- Seven strictly monochrome themes (Obsidian, Graphite, Slate, Paper, Fog,
  Carbon, High Contrast) with "follow system", accent intensity, density and
  English / French UI.
- System tray with live stats, close-to-tray and quit.
- CSV / JSON export of the metrics history.
- CI for Linux and Windows; tag-triggered release workflow producing `.deb`,
  `.AppImage`, `.msi` and `.exe` installers.

[Unreleased]: https://github.com/tfem1/pulse/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/tfem1/pulse/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tfem1/pulse/releases/tag/v0.1.0
