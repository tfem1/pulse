//! # pulse-core
//!
//! Everything Pulse knows about the machine, independent of the desktop
//! shell: typed models, the sampling engine, rolling history, alert
//! evaluation, exports, directory scanning and the platform abstraction layer.
//!
//! Keeping this crate free of Tauri means it can be unit-tested headless and
//! type-checked for Windows from a Linux host
//! (`cargo check -p pulse-core --target x86_64-pc-windows-msvc`).

pub mod alerts;
pub mod apps;
pub mod config;
pub mod error;
pub mod export;
pub mod gpu;
pub mod history;
pub mod models;
pub mod platform;
pub mod sampler;
pub mod storage;
pub mod update;

pub use error::{PulseError, Result};
