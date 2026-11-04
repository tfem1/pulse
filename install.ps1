<#
.SYNOPSIS
  Pulse installer for Windows.

.DESCRIPTION
  Install (latest release, current user, no administrator rights needed):
    irm https://raw.githubusercontent.com/tfem1/pulse/main/install.ps1 | iex

  Options are passed through environment variables, because `irm | iex`
  cannot take parameters:
    $env:PULSE_VERSION = 'v0.1.0'   # a specific release instead of the latest
    $env:PULSE_UNINSTALL = '1'      # uninstall Pulse
    $env:PULSE_REPO = 'owner/pulse' # install from a fork

  The installer is verified against the SHA-256 digest GitHub publishes for
  every release asset before it is run.
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest is much faster without the progress bar

$Repo = if ($env:PULSE_REPO) { $env:PULSE_REPO } else { 'tfem1/pulse' }
$Version = if ($env:PULSE_VERSION) { $env:PULSE_VERSION } else { 'latest' }
$Api = "https://api.github.com/repos/$Repo"
$Headers = @{ 'User-Agent' = 'pulse-installer'; 'Accept' = 'application/vnd.github+json' }

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor White }
function Write-Note([string]$Message) { Write-Host "    $Message" -ForegroundColor DarkGray }

# TLS 1.2 for Windows PowerShell 5.1 on older systems.
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  Write-Verbose 'Could not enable TLS 1.2 explicitly; relying on the system default.'
}

function Get-PulseUninstallEntry {
  $roots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'Pulse' } |
    Select-Object -First 1
}

function Uninstall-Pulse {
  $entry = Get-PulseUninstallEntry
  if (-not $entry) {
    Write-Step 'Pulse is not installed.'
    return
  }
  Write-Step "Uninstalling Pulse $($entry.DisplayVersion)"
  $command = if ($entry.QuietUninstallString) { $entry.QuietUninstallString } else { "$($entry.UninstallString) /S" }
  if ($command -match '^\s*"([^"]+)"\s*(.*)$') {
    $exe = $Matches[1]; $arguments = $Matches[2]
  } else {
    $exe, $arguments = $command -split '\s+', 2
  }
  if ($exe -match 'msiexec') {
    Start-Process -FilePath 'msiexec.exe' -ArgumentList "$arguments /quiet /norestart" -Wait
  } else {
    Start-Process -FilePath $exe -ArgumentList $arguments -Wait
  }
  Write-Step 'Pulse has been uninstalled.'
  Write-Note "Your settings remain in $env:APPDATA\dev.pulse.app (delete it to remove them)."
}

function Install-Pulse {
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'Pulse requires 64-bit Windows.'
  }
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($arch -eq 'ARM64') {
    Write-Note 'ARM64 detected: the x64 build will run through Windows emulation.'
  }

  if ($Version -eq 'latest') {
    $url = "$Api/releases/latest"
  } else {
    if ($Version -notmatch '^v') { $Version = "v$Version" }
    $url = "$Api/releases/tags/$Version"
  }

  Write-Step "Looking up the $Version release of $Repo"
  try {
    $release = Invoke-RestMethod -Uri $url -Headers $Headers
  } catch {
    if ($Version -eq 'latest') {
      throw "No published release found for $Repo yet. See https://github.com/$Repo/releases"
    }
    throw "Release $Version not found. See https://github.com/$Repo/releases"
  }

  # Prefer the NSIS setup (per-user, no admin); fall back to the MSI.
  $asset = $release.assets | Where-Object { $_.name -match '_x64-setup\.exe$' } | Select-Object -First 1
  $isMsi = $false
  if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -match '_x64.*\.msi$' } | Select-Object -First 1
    $isMsi = $true
  }
  if (-not $asset) {
    throw "Release $($release.tag_name) has no Windows installer. See $($release.html_url)"
  }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("pulse-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $file = Join-Path $tmp $asset.name
    Write-Step "Downloading $($asset.name) ($($release.tag_name))"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $file -Headers @{ 'User-Agent' = 'pulse-installer' } -UseBasicParsing

    $expected = if ($asset.digest) { ($asset.digest -replace '^sha256:', '').ToLowerInvariant() } else { '' }
    if ($expected) {
      $actual = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actual -ne $expected) {
        throw "Checksum mismatch for $($asset.name) (expected $expected, got $actual). Aborting."
      }
      Write-Note 'SHA-256 verified'
    } else {
      Write-Note 'SHA-256 not verified (no digest published for this asset)'
    }

    Write-Step 'Installing'
    if ($isMsi) {
      Write-Note 'The MSI installs for all users; Windows will ask for administrator approval.'
      $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$file`" /passive /norestart" -Wait -PassThru
    } else {
      # NSIS silent install into %LOCALAPPDATA%\Pulse (current user).
      $p = Start-Process -FilePath $file -ArgumentList '/S' -Wait -PassThru
    }
    if ($p.ExitCode -ne 0) {
      throw "The installer exited with code $($p.ExitCode)."
    }
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }

  Write-Step "Pulse $($release.tag_name) is installed."
  Write-Note 'Launch it from the Start menu (search for "Pulse").'
  Write-Note 'For temperatures, fans and voltages, also run LibreHardwareMonitor as administrator.'
  Write-Note "Uninstall: `$env:PULSE_UNINSTALL='1'; irm https://raw.githubusercontent.com/$Repo/main/install.ps1 | iex"
}

if ($env:PULSE_UNINSTALL -eq '1') { Uninstall-Pulse } else { Install-Pulse }
