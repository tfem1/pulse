# Contributing to Pulse

Thanks for helping! Bug reports, feature ideas, translations and pull requests
are all welcome. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

Prerequisites:

- **Rust** stable (1.82 or newer) — <https://rustup.rs>
- **Node.js** 20 or newer
- **Linux only:** the WebKitGTK and tray libraries:

  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

  (Fedora: `webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel`;
  Arch: `webkit2gtk-4.1 base-devel openssl libappindicator-gtk3 librsvg`.)

- **Windows only:** Microsoft C++ Build Tools and WebView2 (preinstalled on
  Windows 10/11).
- Optional: [`just`](https://github.com/casey/just) to run the recipes below.

```bash
npm ci
just dev        # or: npm run tauri dev
```

`just dev-ui` (or `npm run dev`) runs only the interface in a browser, backed by
a clearly labelled demo data source — handy for UI work without compiling Rust.

## Before you open a pull request

```bash
just lint            # rustfmt, clippy -D warnings, eslint, prettier, tsc
just test            # cargo test + vitest
just check-windows   # type-check the Windows platform layer from any OS
```

CI runs the same checks on Ubuntu and Windows.

## Project rules

- **Monochrome only.** Never introduce a hue. Use the theme tokens
  (`bg-surface`, `text-muted`, `--chart-N`...) and convey state with
  lightness, shape, stroke weight or patterns. `src/theme/themes.test.ts` fails
  on any non-grey colour literal in the stylesheets.
- **No placeholders.** Features ship complete, or not at all.
- **Graceful degradation.** A metric the platform cannot provide is `None` /
  `null` and rendered as "unavailable"; never fake a zero, never panic.
- **Platform code** goes in `crates/pulse-core/src/platform/{linux,windows}.rs`
  behind the uniform API in `platform/mod.rs`. Add parsing logic as pure
  functions with fixture-based tests (see `parse_meminfo`, `parse_hwmon`).
- **Performance budget:** idle CPU under 2 %, memory under 150 MB. Avoid
  per-tick allocations in hot paths and don't re-render React on every tick
  for charts (they update imperatively through uPlot).
- **Translations:** add every new string to `src/i18n/en.ts` and
  `src/i18n/fr.ts`. The French dictionary is typed against English, so a
  missing key is a compile error.
- **Privacy:** no telemetry and no network calls, except the opt-in update
  check.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
`fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:`). Keep commits focused.

## Releasing (maintainers)

**From the browser:** open the repository's **Actions** tab, select the
**Release** workflow, click **Run workflow** and choose the `main` branch. The
release is named after the version in `src-tauri/tauri.conf.json` (for example
`v0.1.0`), and its tag is created automatically.

**From the command line:**

```bash
just release 0.2.0
```

This bumps the version in `package.json`, `Cargo.toml` and
`tauri.conf.json`, commits, tags `v0.2.0` and pushes. The **Release** workflow
then builds the installers and publishes them as a GitHub Release, which the
one-line installers (`install.sh`, `install.ps1`) pick up immediately. Paste
the CHANGELOG section into the release notes.
