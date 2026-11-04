#!/bin/sh
# Pulse installer for Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/tfem1/pulse/main/install.sh | sh
#
# Options (pass after `sh -s --`, e.g. `| sh -s -- --appimage`):
#   --deb          install the .deb package (Debian, Ubuntu, Mint, Pop!_OS…; needs sudo)
#   --appimage     install the AppImage for the current user only (any distribution, no sudo)
#   --version vX   install a specific release tag instead of the latest
#   --uninstall    remove Pulse
#   -h, --help     show this help
#
# Environment overrides: PULSE_VERSION, PULSE_METHOD (auto|deb|appimage),
# PULSE_INSTALL_DIR (AppImage location, default ~/.local/bin), PULSE_REPO.
#
# The download is verified against the SHA-256 digest GitHub publishes for
# every release asset before anything is installed.

set -eu

REPO="${PULSE_REPO:-tfem1/pulse}"
API="${PULSE_API_URL:-https://api.github.com/repos/$REPO}"
VERSION="${PULSE_VERSION:-latest}"
METHOD="${PULSE_METHOD:-auto}"
BIN_DIR="${PULSE_INSTALL_DIR:-$HOME/.local/bin}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_FILE="$BIN_DIR/pulse.AppImage"
LINK_FILE="$BIN_DIR/pulse"
DESKTOP_FILE="$DATA_DIR/applications/pulse.desktop"
ICON_FILE="$DATA_DIR/icons/hicolor/128x128/apps/pulse.png"
ICON_URL="https://raw.githubusercontent.com/$REPO/main/src-tauri/icons/128x128.png"

# ------------------------------------------------------------------ output ---
if [ -t 1 ]; then BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"; RESET="$(printf '\033[0m')"; else BOLD=""; DIM=""; RESET=""; fi
info() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
note() { printf '    %s%s%s\n' "$DIM" "$*" "$RESET"; }
die() { printf '%serror:%s %s\n' "$BOLD" "$RESET" "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Install Pulse on Linux.

  curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- [options]

Options:
  --deb          install the .deb package (Debian/Ubuntu family; needs sudo)
  --appimage     install the AppImage for the current user (any distribution, no sudo)
  --version vX   install a specific release instead of the latest
  --uninstall    remove Pulse
  -h, --help     show this help

Without options, the .deb is used when apt and sudo are available,
otherwise the AppImage.
USAGE
}

# ------------------------------------------------------------- arguments ---
UNINSTALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --deb) METHOD=deb ;;
    --appimage) METHOD=appimage ;;
    --version) [ $# -ge 2 ] || die "--version needs a tag, e.g. --version v0.1.0"; VERSION="$2"; shift ;;
    --version=*) VERSION="${1#*=}" ;;
    --uninstall) UNINSTALL=1 ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done
case "$METHOD" in auto | deb | appimage) ;; *) die "PULSE_METHOD must be auto, deb or appimage" ;; esac

# ------------------------------------------------------------- utilities ---
have() { command -v "$1" >/dev/null 2>&1; }

if have curl; then
  fetch() { curl -fsSL --retry 3 -H "User-Agent: pulse-installer" "$1"; }
  download() { curl -fL --retry 3 --progress-bar -H "User-Agent: pulse-installer" -o "$2" "$1"; }
elif have wget; then
  fetch() { wget -qO- --header="User-Agent: pulse-installer" "$1"; }
  download() { wget -q --show-progress --header="User-Agent: pulse-installer" -O "$2" "$1"; }
else
  die "curl or wget is required"
fi

SUDO=""
need_root() {
  if [ "$(id -u)" -eq 0 ]; then SUDO=""; return 0; fi
  if have sudo; then SUDO="sudo"; return 0; fi
  return 1
}

# Print "name<TAB>sha256<TAB>url" for every asset of a GitHub release JSON
# document (pretty-printed, one field per line). No jq required.
list_assets() {
  awk '
    /"name":/                 { n = $0; sub(/.*"name": *"/, "", n); sub(/".*/, "", n); d = "" }
    /"digest":/               { d = $0; sub(/.*"digest": *"(sha256:)?/, "", d); sub(/".*/, "", d) }
    /"browser_download_url":/ { u = $0; sub(/.*"browser_download_url": *"/, "", u); sub(/".*/, "", u)
                                printf "%s\t%s\t%s\n", n, d, u }
  '
}

sha256_of() {
  if have sha256sum; then sha256sum "$1" | cut -d' ' -f1
  elif have shasum; then shasum -a 256 "$1" | cut -d' ' -f1
  else echo ""; fi
}

# ------------------------------------------------------------- uninstall ---
uninstall() {
  removed=0
  for f in "$APP_FILE" "$LINK_FILE" "$DESKTOP_FILE" "$ICON_FILE"; do
    if [ -e "$f" ] || [ -L "$f" ]; then rm -f "$f"; note "removed $f"; removed=1; fi
  done
  if have dpkg-query && dpkg-query -W -f='${Status}' pulse 2>/dev/null | grep -q "install ok installed"; then
    info "Removing the pulse .deb package"
    need_root || die "root rights are needed to remove the package: run 'sudo apt remove pulse'"
    $SUDO apt-get remove -y pulse
    removed=1
  fi
  if have update-desktop-database; then update-desktop-database "$DATA_DIR/applications" >/dev/null 2>&1 || true; fi
  if [ "$removed" -eq 1 ]; then
    info "Pulse has been uninstalled."
    note "Your settings remain in ~/.config/dev.pulse.app (delete it to remove them)."
  else
    info "Pulse is not installed."
  fi
}

[ "$UNINSTALL" -eq 1 ] && { uninstall; exit 0; }

# ---------------------------------------------------------------- checks ---
OS="$(uname -s)"
case "$OS" in
  Linux) ;;
  Darwin) die "macOS is not supported yet. Pulse targets Linux and Windows." ;;
  MINGW* | MSYS* | CYGWIN*) die "on Windows, run in PowerShell: irm https://raw.githubusercontent.com/$REPO/main/install.ps1 | iex" ;;
  *) die "unsupported operating system: $OS" ;;
esac
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64 | amd64) ;;
  *) die "no prebuilt package for $ARCH yet; build from source: https://github.com/$REPO#build-from-source" ;;
esac

if [ "$METHOD" = auto ]; then
  if have apt-get && have dpkg && need_root; then METHOD=deb; else METHOD=appimage; fi
fi

# --------------------------------------------------------------- release ---
if [ "$VERSION" = latest ]; then
  RELEASE_URL="$API/releases/latest"
else
  case "$VERSION" in v*) ;; *) VERSION="v$VERSION" ;; esac
  RELEASE_URL="$API/releases/tags/$VERSION"
fi

info "Looking up the ${VERSION} release of $REPO"
RELEASE_JSON="$(fetch "$RELEASE_URL" 2>/dev/null)" || {
  if [ "$VERSION" = latest ]; then
    die "no published release found for $REPO yet. See https://github.com/$REPO/releases"
  fi
  die "release $VERSION not found. See https://github.com/$REPO/releases"
}
TAG="$(printf '%s\n' "$RELEASE_JSON" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)"
ASSETS="$(printf '%s\n' "$RELEASE_JSON" | list_assets)"

case "$METHOD" in
  deb) PATTERN='_amd64\.deb$' ;;
  appimage) PATTERN='_amd64\.AppImage$' ;;
esac
ASSET="$(printf '%s\n' "$ASSETS" | awk -F '\t' -v p="$PATTERN" '$1 ~ p { print; exit }')"
[ -n "$ASSET" ] || die "release $TAG has no $METHOD package for x86_64. See https://github.com/$REPO/releases/tag/$TAG"
NAME="$(printf '%s' "$ASSET" | cut -f1)"
DIGEST="$(printf '%s' "$ASSET" | cut -f2)"
URL="$(printf '%s' "$ASSET" | cut -f3)"

# -------------------------------------------------------------- download ---
TMP="$(mktemp -d 2>/dev/null || mktemp -d -t pulse)"
chmod 755 "$TMP" # lets apt's sandbox user read the local .deb
trap 'rm -rf "$TMP"' EXIT INT TERM
info "Downloading $NAME ($TAG)"
download "$URL" "$TMP/$NAME" || die "download failed: $URL"

ACTUAL="$(sha256_of "$TMP/$NAME")"
if [ -n "$DIGEST" ] && [ -n "$ACTUAL" ]; then
  [ "$ACTUAL" = "$DIGEST" ] || die "checksum mismatch for $NAME (expected $DIGEST, got $ACTUAL). Aborting."
  note "SHA-256 verified"
else
  note "SHA-256 not verified (no digest published or no sha256 tool available)"
fi

# --------------------------------------------------------------- install ---
if [ "$METHOD" = deb ]; then
  need_root || die "installing the .deb needs root rights (sudo). Re-run with --appimage to install without them."
  info "Installing the package (you may be asked for your password)"
  # apt resolves the WebKitGTK / AppIndicator dependencies automatically.
  chmod 644 "$TMP/$NAME"
  $SUDO apt-get install -y "$TMP/$NAME"
  info "Pulse $TAG is installed. Launch it from your applications menu or run: pulse"
  exit 0
fi

mkdir -p "$BIN_DIR" "$(dirname "$DESKTOP_FILE")" "$(dirname "$ICON_FILE")"
mv -f "$TMP/$NAME" "$APP_FILE"
chmod 755 "$APP_FILE"
ln -sf "$APP_FILE" "$LINK_FILE"
fetch "$ICON_URL" >"$ICON_FILE" 2>/dev/null || rm -f "$ICON_FILE"

# AppImages need FUSE 2; without it they can still run by self-extracting.
EXEC="\"$APP_FILE\""
if ! { ldconfig -p 2>/dev/null || /sbin/ldconfig -p 2>/dev/null; } | grep -q 'libfuse\.so\.2'; then
  EXEC="env APPIMAGE_EXTRACT_AND_RUN=1 \"$APP_FILE\""
  note "libfuse2 not found: Pulse will run in extract-and-run mode."
  note "For faster start-up install it (Debian/Ubuntu: sudo apt install libfuse2t64 or libfuse2)."
fi

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Pulse
GenericName=System Monitor
Comment=Fast, monochrome system monitor
Exec=$EXEC
Icon=$ICON_FILE
Terminal=false
Categories=System;Monitor;Utility;
Keywords=task;process;cpu;memory;monitor;
StartupWMClass=pulse
EOF
if have update-desktop-database; then update-desktop-database "$DATA_DIR/applications" >/dev/null 2>&1 || true; fi

info "Pulse $TAG is installed for $(id -un)."
note "Binary:  $LINK_FILE"
note "Menu:    $DESKTOP_FILE"
case ":$PATH:" in
  *":$BIN_DIR:"*) note "Run it with: pulse" ;;
  *) note "$BIN_DIR is not on your PATH; run $LINK_FILE or add it to PATH." ;;
esac
note "Uninstall: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --uninstall"
