# OnbunVitals

A native system-monitoring dashboard for [Onbun](https://mathieudvv.github.io/WinMore-releases/docs.html), as a heads-up display of tiled pages on your iPhone or Android phone. The monitoring backend runs on your Windows, macOS or Linux computer.

## Features

- **A heads-up display for gamers**: swipe between full-screen pages of tiles on your phone, and read FPS, CPU, GPU and temperatures without leaving fullscreen or cluttering your game.
- **A real page editor on your computer** (Windows, macOS, Linux): add pages, place and resize tiles freely on a magnetic grid, choose each tile's metric, display (number, gauge, chart or bar) and color, with a live preview in landscape and portrait.
- Tiles stay calm and turn orange or red only when a warning or critical threshold is crossed.
- CPU usage, memory, system-disk space, GPU usage, CPU/GPU temperatures, FPS and system load, when supported by your hardware or a local telemetry source.
- Optional Onbun critical notifications, settings saved on your computer, no npm dependencies, account or remote service.

**Languages:** French, English, Spanish, German, Simplified Chinese and Japanese. Vitals follows your computer's language (English when it is not one of these), and you can pick another in the phone settings (**Language**) or in the editor's top bar. This README and the documentation are in English.

## Install

1. Download or clone this repository.
2. On your computer, open **Onbun island → Settings → Apps → Open folder**.
3. Copy the entire **`vitals`** folder into that apps folder. The folder name must stay `vitals`, matching the app ID.
4. Open **Vitals** on your phone. Onbun loads the app immediately and reloads it when its files change.

Copy `vitals`, rather than the repository folder `OnBunVitals`. Node.js is provided by Onbun; installing Node separately is only needed to run the development tests.

## Customize

Open the editor from the grid button in the phone's top bar, or from the Vitals card on the Onbun island (**Ouvrir l’éditeur de pages**). It opens in a window on your computer.

- Pick a page in the tabs at the top, or add one with **＋ Page** (up to 8). Untick **Affichée sur le téléphone** to hide a page without deleting it.
- Click a tile to choose its metric, display, size and color, and to edit that metric's thresholds. **＋ Tuile** adds one.
- Drag a tile to move it and pull its corner to resize it: it snaps to the grid, other tiles make room, and the magnet keeps the layout drawable on the phone.
- Switch the preview to **Portrait** and tick **Disposition portrait dédiée** to give a page a different layout in portrait.
- The preview warns when a page is taller than the phone screen, so a HUD page never needs scrolling.
- **Envoyer au téléphone** (Send to phone, or Ctrl/⌘+S) saves the layout, and the phone updates immediately. **Annuler** discards unsent changes.

Existing setups from version 1.0 are converted into pages automatically on first launch.

The editor is served only on `127.0.0.1`, behind a random token that changes on every launch.

## Island settings

Open **Onbun island → Settings → Vitals**:

- **Show Vitals on the island** hides or restores Vitals' compact readout and expanded card. Other Onbun apps and the phone dashboard stay available. On by default.
- **Show FPS on the island** switches both island views between FPS and CPU/RAM. CPU/RAM is the default. Changing the display does not install or enable automatic FPS collection; valid telemetry can provide FPS without setup.
- **Threshold notifications** turns Vitals' threshold notices and warning emphasis on or off. Turning it off clears earlier Vitals threshold notices and keeps the readings visible. Off by default. Hiding Vitals also clears and suppresses its notices.

An explicitly enabled FPS collector can serve the FPS island without opening the phone dashboard. Returning to CPU/RAM or hiding Vitals stops island-only FPS collection; the phone can continue requesting readings while its dashboard is open.

## Sensor availability

CPU, memory and system-disk space use operating-system data. Unix load is available on macOS/Linux. NVIDIA sensors use `nvidia-smi`; supported Linux sensors and Windows Libre Hardware Monitor WMI provide additional readings.

On **Windows x64** (and Windows ARM64 with x64 emulation), automatic FPS is **off by default**. The FPS tile says **Enable FPS in Onbun island settings**. Installing or opening Vitals does not install a service, start an FPS helper or show a permission prompt.

To opt in, open **Onbun island → Settings → Vitals → Enable FPS** and approve Windows setup. Only a fixed-payload native installer is elevated. It installs the shared Onbun FPS collector into a protected Program Files folder, using the limited **LocalService** account. Onbun stays unelevated and your account's group memberships are unchanged. Cancelling or failing setup leaves automatic FPS off.

The collector starts on demand while Vitals is open on the phone and an enabled page needs FPS, or while its FPS island is active. Its native client checks the active window once per second, and the service collects only that process's presentation events through PresentMon 2.6.0. It shuts down after 15–20 seconds without requests. **Disable automatic FPS** stops the client immediately; the installed service remains available for future opt-in but does not start at Windows boot. To remove the optional component, run `bin/OnbunFpsSetup.exe --uninstall` and approve its removal.

DirectX, OpenGL and Vulkan applications are supported where Windows exposes usable events. Keep the game window active. This measures application presentation rate, not monitor refresh rate; it cannot guarantee coverage of every game or protected application.

**macOS and Linux use local telemetry by default.** No FPS setup button, installer, client or service runs on those systems. On every platform, valid telemetry FPS takes priority, including zero. Other unsupported GPU/temperature readings can use the same interface. Missing measurements show **Indisponible** (Unavailable); they are never simulated.

See the [full documentation](docs/README.md) for the sensor matrix, telemetry format, Python publishing example, troubleshooting and development reference.

## Development

Run from this app folder:

```sh
node --test test/*.test.cjs
```

With an Onbun source checkout, also validate the app using:

```sh
npm run check:apps -- /absolute/path/to/OnBunVitals/vitals
```

The app’s screen uses the [official Onbun Kit schema](https://mathieudvv.github.io/WinMore-releases/data/screen.schema.json). Native frame aggregation, local pipe ACLs and impersonation have been tested without installing a service. UAC installation, live LocalService capture and native phone rendering still need hands-on verification. This development build is unsigned; sign the native collector and setup before app-store distribution. The collector build uses Onbun's existing Windows signing configuration. No driver or game injection is used.
