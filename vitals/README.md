# OnbunVitals

A native system-monitoring dashboard for [Onbun](https://mathieudvv.github.io/WinMore-releases/docs.html), with configurable widgets on your iPhone or Android phone. The monitoring backend runs on your Windows, macOS or Linux computer.

## Features

- CPU usage, memory, system-disk space, GPU usage, CPU/GPU temperatures, FPS and system load, when supported by your hardware or a local telemetry source.
- A built-in widget editor: three sizes, ten colors, visibility, ordering, warning thresholds and critical thresholds.
- Gauges, a rolling one-minute history for large widgets, and optional Onbun critical notifications.
- Native portrait and landscape layouts, a desktop-island summary and settings saved on your computer.
- No npm dependencies, account or remote monitoring service.

The app interface is currently in French. This README and the documentation are in English.

## Install

1. Download or clone this repository.
2. On your computer, open **Onbun island → Settings → Apps → Open folder**.
3. Copy the entire **`vitals`** folder into that apps folder. The folder name must stay `vitals`, matching the app ID.
4. Open **Vitals** on your phone. Onbun loads the app immediately and reloads it when its files change.

Copy `vitals`, rather than the repository folder `OnBunVitals`. Node.js is provided by Onbun; installing Node separately is only needed to run the development tests.

## Customize

Tap a widget’s settings icon, or long-press the widget. The settings button in the top bar lists every widget, including hidden ones.

Choose a size, color and thresholds, then tap **Enregistrer** (Save). **Annuler** means Cancel. **Monter** and **Descendre** move a widget up or down and save its position immediately.

## Sensor availability

CPU, memory and system-disk space use operating-system data. Unix load is available on macOS/Linux. NVIDIA sensors use `nvidia-smi`; supported Linux sensors and Windows Libre Hardware Monitor WMI provide additional readings.

FPS require a real reading from your game or capture tool through the local telemetry file. Other unsupported GPU/temperature readings can use the same interface. Missing measurements show **Indisponible** (Unavailable); they are never simulated.

See the [full documentation](docs/README.md) for the sensor matrix, telemetry format, Python publishing example, troubleshooting and development reference.

## Development

Run from this app folder:

```sh
node test/vitals.test.cjs
```

With an Onbun source checkout, also validate the app using:

```sh
npm run check:apps -- /absolute/path/to/OnBunVitals/vitals
```

The app’s screen uses the [official Onbun Kit schema](https://mathieudvv.github.io/WinMore-releases/data/screen.schema.json). Hardware behavior has been exercised on Linux; Windows, macOS and the phone renderers still need hands-on verification.
