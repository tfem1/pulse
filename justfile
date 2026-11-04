# Pulse task runner — https://github.com/casey/just
# Works on Linux and Windows (PowerShell is used as the Windows shell).

set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

# List recipes
default:
    @just --list

# Install JS dependencies
setup:
    npm ci

# Install the Linux system libraries Tauri needs (Debian/Ubuntu)
setup-linux:
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Run the desktop app with hot reload
dev:
    npm run tauri dev

# Run only the UI in a browser with the demo backend (no Rust needed)
dev-ui:
    npm run dev

# Build installers for the current OS (deb/AppImage on Linux, msi/nsis on Windows)
build:
    npm run tauri build

# Build the release binary without packaging
build-binary:
    npm run tauri build -- --no-bundle

# Run every test suite
test:
    cargo test --workspace
    npm test

# Lint and type-check everything (what CI runs)
lint:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings
    npm run lint
    npm run format:check
    npm run typecheck

# Type-check the Windows platform layer from any OS
check-windows:
    rustup target add x86_64-pc-windows-msvc
    cargo clippy -p pulse-core --all-targets --target x86_64-pc-windows-msvc -- -D warnings

# Format all Rust and TypeScript code
format:
    cargo fmt --all
    npm run format

# Release a new version: bump it everywhere, commit and push to main.
# GitHub then builds and publishes the release automatically (~15 min).
release version:
    node scripts/bump-version.mjs {{version}}
    npm install --package-lock-only --ignore-scripts
    cargo update -p pulse -p pulse-core
    git add package.json package-lock.json Cargo.toml Cargo.lock src-tauri/tauri.conf.json
    git commit -m "chore: release v{{version}}"
    git push origin HEAD:main

# Remove build artefacts
clean:
    cargo clean
    node -e "require('fs').rmSync('dist', { recursive: true, force: true })"
