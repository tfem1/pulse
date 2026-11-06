//! Self-update from the project's GitHub Releases.
//!
//! Only runs when the user asks (Settings → About), or at start-up when they
//! enabled the automatic check. The backend chooses the release asset itself
//! from the GitHub API, downloads it, verifies its SHA-256 against the digest
//! GitHub publishes, then installs it the way Pulse was installed:
//!
//! | Installed with            | Update                                              |
//! |---------------------------|-----------------------------------------------------|
//! | Windows NSIS setup        | run the new `-setup.exe /S`, then restart Pulse     |
//! | Windows MSI               | `msiexec /i … /passive` (UAC prompt), then restart  |
//! | Linux AppImage            | replace the AppImage file in place, then restart    |
//! | Linux .deb                | `pkexec apt-get install` (password prompt), restart |
//!
//! Anything else (built from source, other packages) is reported as
//! unsupported with the reason, so the UI can link to the download page.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{PulseError, Result};

/// Latest-release endpoint of the official repository.
pub const DEFAULT_API: &str = "https://api.github.com/repos/tfem1/pulse/releases/latest";

/// Releases API endpoint. `PULSE_UPDATE_API` overrides it (used by tests and
/// for forks).
pub fn api_url() -> String {
    std::env::var("PULSE_UPDATE_API")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_API.to_string())
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InstallMethod {
    WindowsSetup,
    WindowsMsi,
    AppImage,
    Deb,
    Unsupported,
}

/// How this copy of Pulse was installed, which decides how it updates.
#[derive(Debug, Clone)]
pub struct Installation {
    pub method: InstallMethod,
    /// The running executable (restarted after the update).
    pub executable: PathBuf,
    /// The AppImage file to replace (AppImage installs only).
    pub appimage: Option<PathBuf>,
    /// Why updating in place is not possible (Unsupported only).
    pub reason: Option<String>,
}

pub fn detect_installation() -> Installation {
    let executable = std::env::current_exe().unwrap_or_default();
    if cfg!(debug_assertions) {
        return unsupported(
            executable,
            "this is a development build; updates apply to installed releases only",
        );
    }
    detect_platform(executable)
}

fn unsupported(executable: PathBuf, reason: &str) -> Installation {
    Installation {
        method: InstallMethod::Unsupported,
        executable,
        appimage: None,
        reason: Some(reason.to_string()),
    }
}

#[cfg(windows)]
fn detect_platform(executable: PathBuf) -> Installation {
    // The NSIS setup installs per user under %LOCALAPPDATA%; the MSI installs
    // per machine under Program Files.
    let in_local_appdata = std::env::var_os("LOCALAPPDATA").is_some_and(|dir| {
        executable
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(&dir.to_string_lossy().to_ascii_lowercase())
    });
    let method = if in_local_appdata {
        InstallMethod::WindowsSetup
    } else {
        InstallMethod::WindowsMsi
    };
    Installation {
        method,
        executable,
        appimage: None,
        reason: None,
    }
}

#[cfg(target_os = "linux")]
fn detect_platform(executable: PathBuf) -> Installation {
    // The AppImage runtime exports the path of the AppImage file.
    if let Some(path) = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .filter(|p| p.is_file())
    {
        return Installation {
            method: InstallMethod::AppImage,
            executable,
            appimage: Some(path),
            reason: None,
        };
    }
    if executable == Path::new("/usr/bin/pulse")
        && Path::new("/var/lib/dpkg/info/pulse.list").exists()
    {
        return Installation {
            method: InstallMethod::Deb,
            executable,
            appimage: None,
            reason: None,
        };
    }
    unsupported(
        executable,
        "Pulse was not installed from a release package (AppImage or .deb), so it cannot update itself",
    )
}

#[cfg(not(any(windows, target_os = "linux")))]
fn detect_platform(executable: PathBuf) -> Installation {
    unsupported(
        executable,
        "automatic updates are available on Windows and Linux only",
    )
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub name: String,
    pub size: u64,
    pub url: String,
    /// Hex SHA-256 published by GitHub, when available.
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub available: bool,
    pub release_url: String,
    pub published_at: Option<String>,
    pub method: InstallMethod,
    pub asset: Option<Asset>,
    pub unsupported_reason: Option<String>,
}

#[derive(Deserialize)]
struct ApiRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<ApiAsset>,
}

#[derive(Deserialize)]
struct ApiAsset {
    name: String,
    size: u64,
    browser_download_url: String,
    #[serde(default)]
    digest: Option<String>,
}

pub struct Release {
    pub tag: String,
    pub url: String,
    pub published_at: Option<String>,
    pub assets: Vec<Asset>,
}

pub fn parse_release(json: &str) -> Result<Release> {
    let r: ApiRelease = serde_json::from_str(json)
        .map_err(|e| PulseError::Other(format!("unexpected answer from GitHub: {e}")))?;
    Ok(Release {
        tag: r.tag_name,
        url: r.html_url,
        published_at: r.published_at,
        assets: r
            .assets
            .into_iter()
            .map(|a| Asset {
                name: a.name,
                size: a.size,
                url: a.browser_download_url,
                sha256: a
                    .digest
                    .and_then(|d| d.strip_prefix("sha256:").map(str::to_ascii_lowercase)),
            })
            .collect(),
    })
}

fn version_parts(v: &str) -> (Vec<u64>, bool) {
    let v = v.trim().trim_start_matches(['v', 'V']);
    let (core, pre) = match v.split_once('-') {
        Some((c, _)) => (c, true),
        None => (v, false),
    };
    (
        core.split('.').map(|p| p.parse().unwrap_or(0)).collect(),
        pre,
    )
}

/// Whether `candidate` (e.g. "v0.3.0") is newer than `current` ("0.2.0").
/// A pre-release is older than the same version without a suffix.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    let (a, a_pre) = version_parts(candidate);
    let (b, b_pre) = version_parts(current);
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (
            a.get(i).copied().unwrap_or(0),
            b.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x > y;
        }
    }
    b_pre && !a_pre
}

/// The release asset matching an install method (x86-64 builds only).
pub fn pick_asset(method: InstallMethod, assets: &[Asset]) -> Option<Asset> {
    if !cfg!(target_arch = "x86_64") {
        return None;
    }
    let wanted = |name: &str| match method {
        InstallMethod::WindowsSetup => name.ends_with("_x64-setup.exe"),
        InstallMethod::WindowsMsi => name.contains("_x64") && name.ends_with(".msi"),
        InstallMethod::AppImage => name.ends_with("_amd64.AppImage"),
        InstallMethod::Deb => name.ends_with("_amd64.deb"),
        InstallMethod::Unsupported => false,
    };
    assets.iter().find(|a| wanted(&a.name)).cloned()
}

fn agent() -> ureq::Agent {
    use ureq::tls::{RootCerts, TlsConfig};
    // The system certificate store, so corporate / proxy CAs work. Windows
    // uses its own TLS stack (SChannel).
    let tls = TlsConfig::builder().root_certs(RootCerts::PlatformVerifier);
    #[cfg(windows)]
    let tls = tls.provider(ureq::tls::TlsProvider::NativeTls);
    ureq::Agent::config_builder()
        .tls_config(tls.build())
        .timeout_connect(Some(Duration::from_secs(15)))
        .user_agent(concat!("pulse-updater/", env!("CARGO_PKG_VERSION")))
        .build()
        .into()
}

fn http_error(e: ureq::Error) -> PulseError {
    match e {
        ureq::Error::StatusCode(404) => {
            PulseError::NotFound("no release has been published yet".into())
        }
        ureq::Error::StatusCode(403) | ureq::Error::StatusCode(429) => {
            PulseError::Other("GitHub's rate limit was reached; try again in a few minutes".into())
        }
        other => PulseError::Other(format!("could not reach GitHub: {other}")),
    }
}

/// Look up the latest release and decide whether and how to update.
pub fn check_with(api: &str, current: &str, install: &Installation) -> Result<UpdateInfo> {
    let mut res = agent()
        .get(api)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(http_error)?;
    let body = res.body_mut().read_to_string().map_err(http_error)?;
    let release = parse_release(&body)?;
    let available = is_newer(&release.tag, current);
    let asset = pick_asset(install.method, &release.assets);
    let unsupported_reason = match (install.method, &asset) {
        (InstallMethod::Unsupported, _) => install.reason.clone(),
        (_, None) if available => Some(format!(
            "release {} has no package for this system; download it manually",
            release.tag
        )),
        _ => None,
    };
    Ok(UpdateInfo {
        current: current.to_string(),
        latest: release.tag.trim_start_matches('v').to_string(),
        available,
        release_url: release.url,
        published_at: release.published_at,
        method: install.method,
        asset,
        unsupported_reason,
    })
}

pub fn check(current: &str) -> Result<UpdateInfo> {
    check_with(&api_url(), current, &detect_installation())
}

/// Download `asset` to `dest`, verifying its SHA-256 while streaming.
/// `progress(downloaded, total)` is called as data arrives. On a checksum
/// mismatch nothing is left at `dest`.
pub fn download(asset: &Asset, dest: &Path, mut progress: impl FnMut(u64, u64)) -> Result<()> {
    let mut res = agent().get(&asset.url).call().map_err(http_error)?;
    let total = res
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(asset.size);
    let part = dest.with_extension("part");
    let mut out = File::create(&part)?;
    let mut reader = res
        .body_mut()
        .with_config()
        .limit(1024 * 1024 * 1024)
        .reader();
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut done = 0u64;
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| PulseError::Other(format!("download interrupted: {e}")))?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
        hasher.update(&buf[..n]);
        done += n as u64;
        progress(done, total);
    }
    out.flush()?;
    drop(out);

    if let Some(expected) = &asset.sha256 {
        let actual: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if &actual != expected {
            let _ = fs::remove_file(&part);
            return Err(PulseError::Other(format!(
                "the download of {} is corrupted (SHA-256 mismatch); nothing was installed",
                asset.name
            )));
        }
    }
    fs::rename(&part, dest)?;
    Ok(())
}

/// Start Pulse again once the current process has exited (the single-instance
/// guard would otherwise hand over to the old process).
#[cfg(unix)]
fn relaunch_after_exit(path: &Path) -> Result<()> {
    Command::new("sh")
        .arg("-c")
        .arg("sleep 1; exec \"$0\"")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    Ok(())
}

/// Install the downloaded `file`. On success the caller must exit Pulse
/// promptly: the new version starts once this process is gone.
pub fn apply(install: &Installation, file: &Path) -> Result<()> {
    match install.method {
        #[cfg(unix)]
        InstallMethod::AppImage => {
            use std::os::unix::fs::PermissionsExt;
            let target = install
                .appimage
                .as_deref()
                .ok_or_else(|| PulseError::Other("AppImage path unknown".into()))?;
            let dir = target.parent().unwrap_or(Path::new("."));
            let staged = dir.join(".pulse-update.AppImage");
            fs::copy(file, &staged).map_err(|e| {
                PulseError::PermissionDenied(format!(
                    "cannot write the update into {}: {e}",
                    dir.display()
                ))
            })?;
            fs::set_permissions(&staged, fs::Permissions::from_mode(0o755))?;
            // Atomic swap: the running process keeps its open copy.
            fs::rename(&staged, target)?;
            relaunch_after_exit(target)
        }
        #[cfg(unix)]
        InstallMethod::Deb => {
            let status = Command::new("pkexec")
                .args(["apt-get", "install", "-y"])
                .arg(file)
                .stdin(Stdio::null())
                .status()
                .map_err(|_| {
                    PulseError::Unsupported(format!(
                        "pkexec is not available; install the update manually: sudo apt install {}",
                        file.display()
                    ))
                })?;
            match status.code() {
                Some(0) => relaunch_after_exit(&install.executable),
                Some(126) | Some(127) => Err(PulseError::PermissionDenied(
                    "the administrator password was not entered; nothing was installed".into(),
                )),
                _ => Err(PulseError::Other(format!(
                    "the package could not be installed (apt exit status {status})"
                ))),
            }
        }
        #[cfg(windows)]
        InstallMethod::WindowsSetup | InstallMethod::WindowsMsi => {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
            let install_cmd = if install.method == InstallMethod::WindowsSetup {
                format!("\"{}\" /S", file.display())
            } else {
                format!("msiexec /i \"{}\" /passive /norestart", file.display())
            };
            // Wait for Pulse to exit, install, start the new version, clean up.
            let script = file.with_extension("cmd");
            fs::write(
                &script,
                format!(
                    "@echo off\r\ntimeout /t 2 /nobreak >nul\r\n{install_cmd}\r\nstart \"\" \"{}\"\r\ndel \"{}\"\r\ndel \"%~f0\"\r\n",
                    install.executable.display(),
                    file.display()
                ),
            )?;
            Command::new("cmd")
                .arg("/C")
                .arg(&script)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
                .spawn()?;
            Ok(())
        }
        _ => Err(PulseError::Unsupported(
            install
                .reason
                .clone()
                .unwrap_or_else(|| "updates are not supported for this installation".into()),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn compares_versions() {
        assert!(is_newer("v0.3.0", "0.2.0"));
        assert!(is_newer("0.2.1", "0.2.0"));
        assert!(is_newer("v1.0.0", "0.9.9"));
        assert!(is_newer("0.10.0", "0.9.0"));
        assert!(!is_newer("v0.2.0", "0.2.0"));
        assert!(!is_newer("0.1.9", "0.2.0"));
        assert!(is_newer("0.2.0", "0.2.0-beta.1"));
        assert!(!is_newer("0.2.0-beta.1", "0.2.0"));
    }

    const RELEASE: &str = r#"{"url":"x","html_url":"https://github.com/tfem1/pulse/releases/tag/v0.3.0","tag_name":"v0.3.0","name":"Pulse v0.3.0","published_at":"2026-11-06T10:00:00Z","assets":[{"name":"Pulse_0.3.0_amd64.AppImage","size":10,"digest":"sha256:ABCDEF","browser_download_url":"https://example/a.AppImage","uploader":{"login":"bot"}},{"name":"Pulse_0.3.0_amd64.deb","size":5,"browser_download_url":"https://example/a.deb"},{"name":"Pulse_0.3.0_x64-setup.exe","size":3,"digest":"sha256:01","browser_download_url":"https://example/s.exe"},{"name":"Pulse_0.3.0_x64_en-US.msi","size":4,"browser_download_url":"https://example/s.msi"}]}"#;

    #[test]
    fn parses_release_and_picks_assets() {
        let r = parse_release(RELEASE).unwrap();
        assert_eq!(r.tag, "v0.3.0");
        assert_eq!(r.assets.len(), 4);
        assert_eq!(r.assets[0].sha256.as_deref(), Some("abcdef"));
        assert_eq!(r.assets[1].sha256, None);
        if cfg!(target_arch = "x86_64") {
            let name = |m| pick_asset(m, &r.assets).map(|a| a.name);
            assert_eq!(
                name(InstallMethod::AppImage).as_deref(),
                Some("Pulse_0.3.0_amd64.AppImage")
            );
            assert_eq!(
                name(InstallMethod::Deb).as_deref(),
                Some("Pulse_0.3.0_amd64.deb")
            );
            assert_eq!(
                name(InstallMethod::WindowsSetup).as_deref(),
                Some("Pulse_0.3.0_x64-setup.exe")
            );
            assert_eq!(
                name(InstallMethod::WindowsMsi).as_deref(),
                Some("Pulse_0.3.0_x64_en-US.msi")
            );
            assert_eq!(name(InstallMethod::Unsupported), None);
        }
    }

    /// Serve `body` to every request on a local port; returns the base URL.
    fn serve(body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(&stream);
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok_and(|n| n > 2) {
                    line.clear();
                }
                let mut s = &stream;
                let _ = write!(
                    s,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = s.write_all(&body);
            }
        });
        format!("http://{addr}")
    }

    fn sha256_hex(data: &[u8]) -> String {
        Sha256::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    #[test]
    fn downloads_and_verifies() {
        let data: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
        let base = serve(data.clone());
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("Pulse.AppImage");
        let asset = Asset {
            name: "Pulse.AppImage".into(),
            size: data.len() as u64,
            url: format!("{base}/file"),
            sha256: Some(sha256_hex(&data)),
        };
        let mut last = (0, 0);
        download(&asset, &dest, |d, t| last = (d, t)).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), data);
        assert_eq!(last, (data.len() as u64, data.len() as u64));
    }

    #[test]
    fn rejects_a_corrupted_download() {
        let base = serve(b"tampered".to_vec());
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("setup.exe");
        let asset = Asset {
            name: "setup.exe".into(),
            size: 8,
            url: format!("{base}/file"),
            sha256: Some(sha256_hex(b"original")),
        };
        let err = download(&asset, &dest, |_, _| {}).unwrap_err();
        assert!(err.to_string().contains("SHA-256"));
        assert!(!dest.exists());
        assert!(!dest.with_extension("part").exists());
    }

    #[test]
    fn check_reports_available_update() {
        let base = serve(RELEASE.as_bytes().to_vec());
        let install = Installation {
            method: InstallMethod::AppImage,
            executable: PathBuf::from("/x/pulse"),
            appimage: Some(PathBuf::from("/x/Pulse.AppImage")),
            reason: None,
        };
        let info = check_with(&format!("{base}/latest"), "0.2.0", &install).unwrap();
        assert!(info.available);
        assert_eq!(info.latest, "0.3.0");
        if cfg!(target_arch = "x86_64") {
            assert_eq!(info.asset.unwrap().name, "Pulse_0.3.0_amd64.AppImage");
            assert!(info.unsupported_reason.is_none());
        }
        let up_to_date = check_with(&format!("{base}/latest"), "0.3.0", &install).unwrap();
        assert!(!up_to_date.available);
    }

    #[test]
    fn unsupported_installs_explain_why() {
        let base = serve(RELEASE.as_bytes().to_vec());
        let install = Installation {
            method: InstallMethod::Unsupported,
            executable: PathBuf::from("/x/pulse"),
            appimage: None,
            reason: Some("built from source".into()),
        };
        let info = check_with(&format!("{base}/latest"), "0.2.0", &install).unwrap();
        assert!(info.available);
        assert!(info.asset.is_none());
        assert_eq!(
            info.unsupported_reason.as_deref(),
            Some("built from source")
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn appimage_is_replaced_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("pulse.AppImage");
        fs::write(&target, b"#!/bin/sh\nexit 0\n").unwrap();
        let new = dir.path().join("download.AppImage");
        fs::write(&new, b"#!/bin/sh\necho new\n").unwrap();
        let install = Installation {
            method: InstallMethod::AppImage,
            executable: target.clone(),
            appimage: Some(target.clone()),
            reason: None,
        };
        apply(&install, &new).unwrap();
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(fs::read(&target).unwrap(), b"#!/bin/sh\necho new\n");
        assert_eq!(
            fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert!(!dir.path().join(".pulse-update.AppImage").exists());
    }
}
