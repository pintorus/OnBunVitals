# OnbunVitals

A native system-monitoring dashboard for [Onbun](https://mathieudvv.github.io/WinMore-releases/docs.html), with configurable widgets on your iPhone or Android phone. The monitoring backend runs on your Windows, macOS or Linux computer.

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

## Sensor availability

CPU, memory and system-disk space use operating-system data. Unix load is available on macOS/Linux. NVIDIA sensors use `nvidia-smi`; supported Linux sensors and Windows Libre Hardware Monitor WMI provide additional readings.

FPS require a real reading from your game or capture tool through the local telemetry file. Other unsupported GPU/temperature readings can use the same interface. Missing measurements show **Indisponible** (Unavailable); they are never simulated.

See the [full documentation](vitals/docs/README.md) for the sensor matrix, telemetry format, Python publishing example, troubleshooting and development reference.

## Development

Run from the repository root:

```sh
node vitals/test/vitals.test.cjs
```

With an Onbun source checkout, also validate the app using:

```sh
npm run check:apps -- /absolute/path/to/OnBunVitals/vitals
```

The app’s screen uses the [official Onbun Kit schema](https://mathieudvv.github.io/WinMore-releases/data/screen.schema.json). Hardware behavior has been exercised on Linux; Windows, macOS and the phone renderers still need hands-on verification.
