# Vitals documentation

[App README](../README.md)

## Installation and updates

Onbun runs the backend on your computer and renders `ui/screen.json` using native phone components. The same screen serves iPhone and Android; no phone build is needed to install or edit this app.

Open **Onbun island → Settings → Apps → Open folder**, then copy the complete `vitals` app folder there. Its `manifest.json` must sit directly inside `apps/vitals/`, without an extra nested folder. Onbun loads the app and watches its files for changes.

To update, copy the new app files over the installed app. Preferences live separately in Onbun’s private app-data directory, so replacing the app files preserves them. Reloading the app clears its in-memory history.

## Pages, tiles and the PC editor

The phone shows one full-screen page at a time; swipe sideways to change page. Each page is a stack of **rows**, and the tiles of a row share its width equally. Pages never scroll: the editor warns when a page is taller than a landscape phone (280 pt under the bar) or a portrait one (600 pt).

| Element | Options |
|---|---|
| Page | Name (1–24 characters), order. 1 to 8 pages. |
| Row | Height: Fine (72 pt), Moyenne (124 pt), Haute (176 pt), Très haute (260 pt). 1 to 4 rows per page, 1 to 4 tiles per row. |
| Tile | Metric, display (Chiffre: large number · Jauge: gauge · Courbe: one-minute chart · Barre: number and bar), color (or the metric's color). |
| Metric | Warning and critical thresholds and default color, shared by every tile that shows it. |

Tiles keep their chosen color and turn orange at the warning threshold and red at the critical one. A metric that sits on no page is not shown, does not count in the alert summary and does not notify.

### Opening the editor

The editor runs on the computer, in a window opened by Onbun (Windows, macOS and Linux). Open it from the grid button in the phone's top bar, from **Mesures → Ouvrir l’éditeur de pages** in the phone settings, or from the Vitals card on the island. It shows live values in a phone-shaped preview, in landscape or portrait.

Click a row or a tile to edit it on the right. Drag a tile onto another row to move it, or onto a tile to swap them. Delete removes the selected tile and Escape clears the selection. **Envoyer au téléphone** (Ctrl/⌘+S) validates and saves the layout; the phone updates on its next refresh. **Annuler** discards unsent changes. Closing the window discards them too.

The editor is served by the app on `127.0.0.1` only, on a random port, and every API call needs a random token that is generated at launch and passed in the URL fragment. Other hosts are refused.

On the phone, the settings sheet still edits each metric's thresholds and color.

### Languages

Vitals speaks French, English, Spanish, German, Simplified Chinese and Japanese: the phone screen, the PC editor, the island card, the PC settings page, notifications and error messages. By default it follows the computer's language (Electron's preferred system languages, then the system locale); any other language falls back to English. **Réglages → Langue** on the phone and the language menu in the editor override it, and the choice is saved in `settings.json` as `language` (`auto`, `fr`, `en`, `es`, `de`, `zh` or `ja`). Page names are yours and are not translated; default pages are named in the language active when they are created.

Translations live in `lib/i18n.cjs` (French, English, Spanish and German side by side for each key) and `lib/locales/zh.cjs`, `lib/locales/ja.cjs`. A test fails if any language misses a key or a placeholder. To add a language, add a locale file with every key and register it in `LANGS`.

### Upgrading from 1.0

Version 1.0 settings listed widgets instead of pages. On first launch, visible widgets are converted into pages in their saved order: large widgets become a chart row, and medium or small widgets are grouped into rows of up to two or four, with three rows per page.

### Sampling and history

CPU and memory are sampled at the selected interval: 1, 2 or 5 seconds. The local telemetry file is read on the same cycle. Disk and hardware-sensor collection runs in a separate loop, with a five-second delay after each collection completes. Slow commands can make that loop take longer.

The phone requests cached data about every 1.5 seconds, temporarily faster during initial loading. Refresh requests a new sample without overlapping an active collection. `data()` returns the cache rather than launching processes or reading sensors.

Charts retain the last 60 seconds, capped at 120 points per metric. They reset when a metric becomes unavailable, so a chart does not draw a line across a sensor outage. App reloads also reset history.

### Notifications and the desktop island

Critical notifications are optional and disabled by default. When enabled, metrics shown on a page can post an Onbun notification on entering the critical state, at most once per minute per widget. Remaining critical does not produce a continuous stream of notifications. These are Onbun notifications; Vitals does not independently send email, SMS or push messages.

The desktop island shows a CPU summary or a threshold alert. Its expanded card shows CPU and memory readings and a refresh action.

## Sensor support

| Metric | Implementation and limits |
| --- | --- |
| CPU usage | Difference between successive operating-system CPU counters across all logical cores; shown as 0–100%. An initial or unchanged counter can be unavailable. |
| Memory | Used / total memory. Linux prefers `MemAvailable` from `/proc/meminfo`; otherwise the OS free-memory counter is used. macOS’s estimate includes cache. Capacity details use GiB. |
| System disk | Windows system drive, or `/` on macOS/Linux. Shows capacity unavailable to the current user as a percentage, plus available and total GiB. It does not measure disk throughput or disk busy time. |
| System load | One-minute Unix load divided by the number of logical cores, expressed as a percentage. It can exceed 100%. Not available on Windows and hidden there by default. |
| NVIDIA GPU usage and temperature | First GPU reported by `nvidia-smi` found in the computer’s PATH. |
| Linux GPU usage | First sorted DRM card exposing a readable `device/gpu_busy_percent` file, notably supported AMD devices. |
| Linux AMD GPU temperature | `temp1_input` from the selected GPU’s `amdgpu` hwmon sensor. |
| Linux CPU temperature | Maximum valid reading from recognized `coretemp`, `k10temp`, `zenpower`, `cpu_thermal` or `soc_thermal` hwmon devices. |
| Windows additional sensors | An already-running Libre Hardware Monitor WMI provider at `root/LibreHardwareMonitor`. Uses CPU temperatures and GPU Core temperature/load sensors; the maximum matching value is selected. |
| macOS temperatures and other unsupported GPU readings | Local telemetry. No direct Apple hardware sensor integration is included. |
| FPS | Local telemetry from a game, frame-capture tool or an adapter. Monitor refresh rate is not used as FPS. |

Automatic sensor precedence, from lower to higher, is Linux hwmon/DRM, Libre Hardware Monitor, then NVIDIA SMI. A valid local telemetry field overrides the corresponding automatic field. Multi-GPU device selection is not exposed in the editor.

External processes have a 3.5-second timeout and a bounded output buffer. Failed NVIDIA or WMI sources are retried after 60 seconds. Other metrics continue working. Vitals does not request administrator privileges, install drivers or bundle Libre Hardware Monitor, PresentMon, RTSS or MangoHud.

## Local telemetry integration

### Find the destination

On the computer, open **Onbun island → Settings → Vitals**. The page displays the exact destination of `telemetry.json` in the app’s private data directory (`ctx.dataDir`). Use this path rather than the app installation folder.

Your game, monitoring tool or custom adapter must provide the real measurements. Vitals consumes the following JSON format; it does not automatically convert another tool’s export.

### Payload

```json
{
  "timestamp": 1794654000000,
  "fps": 144,
  "gpu": 62,
  "cpuTemp": 68,
  "gpuTemp": 71
}
```

Replace the example timestamp with the **current Unix time in milliseconds** on every write.

| Field | Required | Accepted value |
| --- | --- | --- |
| `timestamp` | Yes | Finite JSON number in Unix milliseconds; no older than 10 seconds and no more than 2 seconds in the future. |
| `fps` | No | Finite number from 0 to 2000, inclusive. Zero is a valid reading. |
| `gpu` | No | Finite number from 0 to 100, inclusive; percentage. |
| `cpuTemp` | No | Finite number from 0 to 150, inclusive; degrees Celsius. |
| `gpuTemp` | No | Finite number from 0 to 150, inclusive; degrees Celsius. |

Use JSON numbers, without unit suffixes or string conversion. Missing or `null` optional fields leave automatic sources in use. Unknown fields are ignored and are not forwarded to the phone. One invalid recognized field rejects the whole external payload for that sample; automatic sources remain available.

Publish every 1–5 seconds, with at most 65,536 bytes per file. Write to a temporary file in the same directory, then replace `telemetry.json` atomically. A stale, oversized, inaccessible or malformed file produces a readable error. Expired external readings fall back to automatic sources where possible; otherwise they become unavailable on the next sample.

### Python publishing helper

Integrate this helper into an adapter that already has real measurements. It writes a payload; it does not measure FPS or hardware itself. Only one publisher should own the destination and its temporary file.

```python
import json
import os
import time
from pathlib import Path


def publish(destination, *, fps=None, gpu=None, cpu_temp=None, gpu_temp=None):
    target = Path(destination)  # Full path shown in Vitals desktop settings.
    values = dict(fps=fps, gpu=gpu, cpuTemp=cpu_temp, gpuTemp=gpu_temp)
    payload = {"timestamp": int(time.time() * 1000)}
    payload.update({key: value for key, value in values.items() if value is not None})
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    os.replace(temporary, target)
```

## Files and privacy

App files:

```text
vitals/
├── manifest.json
├── index.cjs
├── lib/
│   ├── model.cjs
│   └── sensors.cjs
├── ui/screen.json
├── icon.svg
├── README.md
├── docs/README.md
└── test/vitals.test.cjs
```

Private runtime files are separate:

| File | Purpose |
| --- | --- |
| `ctx.dataDir/settings.json` | Language, pages, rows and tiles, metric colors and thresholds, sampling interval and notification preference. |
| `ctx.dataDir/settings.json.tmp` | Temporary file used for atomic preference writes. |
| `ctx.dataDir/telemetry.json` | Optional payload written by your external telemetry publisher. |

The backend runs locally without network requests. Onbun sends the computer name, OS and CPU details, readings, chart history and visual preferences to the connected phone. The app does not expose its private data directory as phone assets. Only Onbun’s normal UI, asset and icon paths are public to the phone.

If preferences cannot be read, defaults are used and a warning is shown. The next successful save replaces the unreadable preferences file. Back it up before saving if you want to recover its contents. A failed save leaves the current in-memory preferences unchanged.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Vitals does not appear | Copy `vitals` directly into the active Onbun apps folder. Check that `vitals/manifest.json` exists and its ID is `vitals`. |
| A metric is missing | Open the page editor and add a tile for it. |
| The editor does not open | Check that Onbun is running on the computer, then use the island's Vitals card. |
| A sensor says Indisponible | Check its source in Settings → Capteurs. Unsupported hardware is expected to show this state. |
| NVIDIA readings are unavailable | Ensure `nvidia-smi` is accessible to the Onbun process. After correcting the environment, allow the 60-second retry delay or reload the app. |
| Windows temperature/GPU data are missing | Confirm Libre Hardware Monitor is running and its WMI provider is accessible. The CPU and memory widgets do not require it. |
| FPS stays unavailable | Connect an actual measurement publisher. Confirm its destination, current millisecond timestamp and numeric `fps` field. |
| Telemetry works and then disappears | Check that publishing continues every 1–5 seconds; external data expires after 10 seconds. |
| Threshold edits fail | Critical must be above warning for normal metrics and below warning for FPS. |
| Settings cannot be saved | Check write access to the app’s private data directory and available disk space. |
| A Kit error appears on the phone | Follow the exact property error shown by Onbun; validate the screen against the official schema and, if available, the Onbun app checker. |

## Development reference

No npm installation or build step is required. For tests, use a modern Node.js runtime with `node:test`, from the repository root:

```sh
node vitals/test/vitals.test.cjs
```

Tests cover CPU deltas, threshold validation and FPS direction, configuration restoration, page validation, migration from 1.0, page fit, telemetry validation and file limits, real-host sampling, saving, command errors and shutdown.

Pages are saved by the PC editor through `PUT /api/layout` (`{pages, widgets}`), validated by `lib/layout.cjs`. The backend exports `activate(ctx)`, returning `data()`, `command(action, value)`, `close()`, `island()` and desktop `settings`. Sensor loops run in the background, `data()` returns cached plain JSON with `loading` and `revision`, and `close()` stops timers and child processes.

| Command | Value |
| --- | --- |
| `saveWidget` | `{id, visible, size, color, warning, critical}`; ID must identify an existing metric. |
| `move` | `{id, direction}` with direction `-1` or `1` (metric order in the settings list). |
| `interval` | Number `1`, `2` or `5` (seconds). |
| `notifications` | Boolean. |
| `refresh` | No value required; requests background collection. |
| `language` | `auto` or a language code: `fr`, `en`, `es`, `de`, `zh`, `ja`. |
| `openEditor` | No value required; opens the PC page editor and returns `{ "opened": true }`. |

Successful commands return `{ "saved": true }`; refresh returns before collection completes. Invalid commands or settings throw readable errors for Onbun to display.

Validate `ui/screen.json` against the [official JSON Schema](https://mathieudvv.github.io/WinMore-releases/data/screen.schema.json). From an Onbun source checkout, also run:

```sh
npm run check:apps -- /absolute/path/to/OnBunVitals/vitals
```

Bump `manifest.json`’s version when making changes. Check loading, unavailable, error and all-hidden states, along with both orientations. Schema checks do not replace visual verification on iPhone and Android.

Reference material: [Onbun app guide](https://mathieudvv.github.io/WinMore-releases/data/app-guide.md) and [Kit components](https://mathieudvv.github.io/WinMore-releases/data/components.md).

Linux real-host collection and the automated tests have been exercised. Windows/macOS hardware behavior and native phone rendering have not been manually verified.
