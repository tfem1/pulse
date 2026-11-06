# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added

- **Apps view in Processes**, like Task Manager. It lists the open applications,
  each with all of its processes grouped, their total CPU, memory and disk use,
  and the main window title on Windows.
  - **End task** asks the app to close (`WM_CLOSE` on Windows, `SIGTERM` on
    Linux) and ends it after 5 seconds if it does not respond.
  - **Force end** closes it immediately.
  - Rows expand to show the app's processes.
  - Keyboard: Del to end task, Shift+Del to force end; there is also a context
    menu.
  - The Processes page opens on this view; List and Tree are unchanged.

### Fixed

- Leaving the Processes page (or the dashboard) while it was still starting
  could leave a process listener registered and backend process streaming
  switched on, refreshing the whole process table every second with nobody
  watching. Covered by new tests.
- The alert listener could be registered twice when the app's start-up
  effect re-ran (React StrictMode).

### Changed

- Lower memory over long sessions:
  - the last process list is freed when no view needs it (also in the tray);
  - chart series for disks, interfaces or sensors that disappeared are
    released, and chart values use 32-bit floats (half the memory);
  - the caches of interface names and suspended PIDs are pruned.
- Charts and sparklines share one theme-palette observer instead of one per
  instance.
- Removed unused code and dependencies: the slider and separator components,
  `@radix-ui/react-slider`, `@radix-ui/react-separator`,
  `@tauri-apps/plugin-notification` (JS side; notifications are sent from
  Rust), `serde_json` and `thiserror` from the app crate, `parking_lot` from
  `pulse-core`, and Tauri's unused `image-png` feature. The release binary is
  136 KB smaller.

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

[Unreleased]: https://github.com/tfem1/pulse/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/tfem1/pulse/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/tfem1/pulse/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tfem1/pulse/releases/tag/v0.1.0
