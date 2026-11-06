<div align="center">

<img src="public/pulse.svg" width="72" height="72" alt="Pulse logo" />

# Pulse

**See what your computer is doing, and fix it when it slows down.**

Free · Linux and Windows · No ads, no account, no data collection

[Français](README.fr.md) · [Download](#install) · [Releases](https://github.com/tfem1/pulse/releases)

![Pulse dashboard](docs/screenshots/dashboard.png)

</div>

## What is Pulse for?

Pulse is a **system monitor**: an app that shows, live, how your computer is
using its resources. It's like the Windows Task Manager, but clearer, more
complete, and it works on Linux too.

Use it when:

- **Your computer is slow.** Pulse shows which program is using the processor
  or the memory, and you can close it in one click.
- **Your disk is full.** Pulse shows how much space is left and finds the
  folders that take up the most room.
- **Your computer is hot or the fan is loud.** Pulse shows temperatures and
  fan speeds.
- **Your internet seems slow.** Pulse shows how much each network connection
  is downloading and uploading right now.
- **You want to be warned.** Pulse can send you a notification, for example
  when memory is almost full or the processor stays at 100% for too long.
  This keeps working when the window is closed.

## Install

### Linux

1. Open a **Terminal** (search for "Terminal" in your applications menu).
2. Paste this command and press <kbd>Enter</kbd>:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/tfem1/pulse/main/install.sh | sh
   ```

3. If your password is requested, type it (nothing appears as you type, which
   is normal) and press <kbd>Enter</kbd>.

Pulse is now in your applications menu.

### Windows

1. Open **PowerShell**: right-click the Start button, then choose
   _Terminal_ or _Windows PowerShell_.
2. Paste this command and press <kbd>Enter</kbd>:

   ```powershell
   irm https://raw.githubusercontent.com/tfem1/pulse/main/install.ps1 | iex
   ```

Pulse is now in the Start menu. No administrator rights are needed.

### Prefer a classic installer?

Download the file for your system from the
[Releases page](https://github.com/tfem1/pulse/releases):

- **Windows:** the file ending in `-setup.exe`
- **Ubuntu, Debian, Mint:** the `.deb` file (double-click it)
- **Other Linux:** the `.AppImage` file (right-click → Properties → allow
  executing, then double-click)

### Update

Open _Settings → About_ and click **Check for updates**. If a new version is
out, click **Update now**: Pulse downloads it, checks that the file is intact,
installs it and restarts by itself. Your settings are kept. (With the `.deb`
package, your password is asked for.)

You can also just run the install command again.

### Uninstall

- **Linux:**

  ```bash
  curl -fsSL https://raw.githubusercontent.com/tfem1/pulse/main/install.sh | sh -s -- --uninstall
  ```

- **Windows:** _Settings → Apps → Pulse → Uninstall_.

## What you'll find in Pulse

| Page            | What it shows                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard**   | Everything at a glance: processor, memory, disk, network, graphics card.                                                                                                                                                                   |
| **Performance** | Detailed graphs for the last minute, 5 minutes or 15 minutes.                                                                                                                                                                              |
| **Processes**   | Like Task Manager: the **Apps** view lists your open applications (all of an app's processes together) with an **End task** button; the **List** and **Tree** views show every process. Search, sort, close, pause or slow down a program. |
| **Storage**     | Space used on each disk, and the biggest folders.                                                                                                                                                                                          |
| **Network**     | Download and upload speed of each connection.                                                                                                                                                                                              |
| **Sensors**     | Temperatures, fan speeds and voltages.                                                                                                                                                                                                     |
| **Alerts**      | Your warning rules, for example "notify me if memory goes above 90%".                                                                                                                                                                      |
| **Settings**    | Theme, language (English / French), refresh speed, notifications, data export.                                                                                                                                                             |

**A few tips:**

- In **Processes → Apps**, click **End task** next to an application to close
  it. Pulse asks it to close, as its own close button would, and ends it after
  5 seconds if it doesn't respond. **Force end** closes it immediately, for
  example when it is frozen. Right-click for more options. The **List** and
  **Tree** views manage individual processes.
- Click the **Pause** button in the top bar to freeze the graphs and read
  them at your own pace.
- When you close the window, Pulse keeps running in the corner of the
  taskbar (the tray), so your alerts keep working. To quit completely,
  right-click its icon there and choose **Quit Pulse**.
- Keyboard shortcuts: <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>8</kbd> switch
  between pages, and <kbd>/</kbd> searches the process list.

## Screenshots

| Processes                                    | Performance                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- |
| ![Processes](docs/screenshots/processes.png) | ![Performance](docs/screenshots/performance.png)                 |
| **Storage**                                  | **Appearance settings**                                          |
| ![Storage](docs/screenshots/storage.png)     | ![Appearance settings](docs/screenshots/settings-appearance.png) |

Pulse comes in **seven black-and-white themes**, dark and light, including a
high-contrast theme for low vision. By default it follows your system's
dark or light mode.

| Obsidian                              | Graphite                              | Slate                                           | Paper                           |
| ------------------------------------- | ------------------------------------- | ----------------------------------------------- | ------------------------------- |
| ![Obsidian](docs/themes/obsidian.png) | ![Graphite](docs/themes/graphite.png) | ![Slate](docs/themes/slate.png)                 | ![Paper](docs/themes/paper.png) |
| **Fog**                               | **Carbon**                            | **High Contrast**                               |                                 |
| ![Fog](docs/themes/fog.png)           | ![Carbon](docs/themes/carbon.png)     | ![High Contrast](docs/themes/high-contrast.png) |                                 |

## Common questions

**Why can't I close some programs?**
Programs that belong to the system or to another user are protected. To
manage them, start Pulse as administrator (Windows) or with `sudo pulse`
(Linux). Pulse tells you clearly when this is the case.

**Why don't I see temperatures on Windows?**
Windows doesn't share them with ordinary apps. Install the free
[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor),
start it as administrator, and Pulse shows its readings automatically.

**Does Pulse slow down my computer?**
No. When it runs in the background it uses less than 1% of one processor core
and about 100 MB of memory.

**Does Pulse send my data anywhere?**
No. Pulse doesn't connect to the internet on its own. It only contacts GitHub
when you click **Check for updates** in _Settings → About_, or at start-up if
you turn on the automatic check there (off by default).

**I don't see the Pulse icon near the clock (Linux).**
Some desktops, such as GNOME (default on Ubuntu), need the _AppIndicator_
extension to show tray icons. Without it, Pulse still works normally; closing
the window simply quits the app.

## For developers

Pulse is built with Rust and [Tauri 2](https://tauri.app) for the system
part, and React with TypeScript for the interface.

```bash
git clone https://github.com/tfem1/pulse.git
```

```bash
cd pulse
```

```bash
npm ci
```

```bash
npm run tauri dev
```

- [CONTRIBUTING.md](CONTRIBUTING.md): system prerequisites, tests, code
  rules, and how to publish a release.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the app works inside.
- [CHANGELOG.md](CHANGELOG.md): history of changes.

## License

[MIT](LICENSE): free to use, modify and share.
