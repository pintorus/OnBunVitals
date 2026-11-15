# Changes

## 1.6.2

- Use English for the manifest description shown in the Onbun app store and submission review page.
- Runtime behavior is unchanged from 1.6.1.

## 1.6.1

Vitals 1.6.1 adds island controls and an optional Windows FPS collector.

- CPU and RAM appear by default in both the compact and expanded island.
- Choose FPS instead, hide Vitals from the island, or disable threshold notifications and clear earlier Vitals notices.
- Automatic FPS is off by default. The tile directs you to **Onbun island → Settings → Vitals → Enable FPS**. Installing/opening Vitals shows no permission prompt and installs no service.
- Explicit Windows setup installs a demand-start collector under the limited LocalService account. Onbun and its installed apps remain unelevated; your account groups are unchanged. The collector stops when unused and can serve the FPS island without a phone open.
- Telemetry FPS takes priority. macOS/Linux remain telemetry-only and run no Windows helpers.

Validation: 39 automated app tests, native aggregation/local-pipe/ownership checks, Onbun package validation, and compact-island text fit checks passed.

**Windows collector status:** the included native setup/collector is an unsigned development build. Windows may show an Unknown publisher warning. UAC/service installation, live game capture under LocalService and capture overhead have not been verified. Automatic FPS remains optional and disabled unless you explicitly enable it; telemetry remains available.

Download `vitals-1.6.1.wmapp` below. `SHA256SUMS` provides its checksum.
