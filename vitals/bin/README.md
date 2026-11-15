# Bundled Windows FPS collector

- Project: Intel PresentMon, https://github.com/GameTechDev/PresentMon
- Release: 2.6.0, https://github.com/GameTechDev/PresentMon/releases/tag/v2.6.0
- File: `PresentMon-2.6.0-x64.exe` (980,320 bytes)
- Download: https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe
- SHA-256: `b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af`
- License: MIT; reproduced in `PresentMon-LICENSE.txt` from the release tag.

The official binary is embedded in `OnbunFpsSetup.exe`, together with the native collector and its license. `collector-build.json` records the exact setup/collector/payload hashes. Setup verifies the embedded hashes before extracting them to a protected Program Files directory. The vendor source binary is kept with the collector build inputs, outside the Vitals package.

Nothing here is launched by opening or installing Vitals. Only **Enable FPS** in Windows island settings requests setup approval. Onbun stays unelevated; the installed collector uses a demand-start LocalService component. No driver, user-group change or game injection is installed. macOS/Linux never execute this setup or client. The optional component can be removed with `OnbunFpsSetup.exe --uninstall`.

This local development setup/collector is unsigned. The collector build invokes Onbun's existing signing hook; configure signing before public distribution and set `ONBUN_REQUIRE_SIGNING=1` for a release. Do not present this development build as production-audited.
