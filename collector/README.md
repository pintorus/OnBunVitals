# Optional Onbun FPS collector

This is the shared Windows component offered by **Vitals → Enable FPS**. Vitals 1.6 defaults to opt-out. Building or installing the app package does not register a service, execute setup, change account privileges or show UAC.

## Build

On Windows with the bundled .NET Framework compiler:

```powershell
node collector/build.cjs
node --test vitals/test/*.test.cjs
# The validation/packing scripts live in an Onbun source checkout:
node /path/to/Onbun/scripts/check-apps.cjs vitals
node /path/to/Onbun/scripts/onbun-pack.cjs vitals --out dist
```

`vendor/PresentMon-2.6.0-x64.exe` is the official 980,320-byte release, SHA-256 `b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af`. Its MIT license is included in the Vitals `bin` directory and embedded in setup. No NuGet dependency, driver or new runtime installation is needed.

The build signs the collector, embeds its exact bytes in setup, then signs setup. It reuses `scripts/sign-windows.cjs` when built inside the Onbun working copy, or an explicit `ONBUN_SIGNING_HOOK`. Standalone clones can set `ONBUN_SIGN_THUMBPRINT` and optionally `ONBUN_SIGNTOOL`, `ONBUN_SIGN_TIMESTAMP` and `ONBUN_SIGN_MACHINE_STORE`. Set `ONBUN_REQUIRE_SIGNING=1` for signed production builds. There is no signing identity configured in this local environment, so the current binaries are unsigned development artifacts. A restricted tool runner may block local pipes; `--skip-native-test` permits compilation there, with `build/OnbunFpsCollector.exe --self-test` subsequently run in a normal user context.

## Privilege boundary

- `Setup.cs`: a fixed-payload installer with `requireAdministrator`, accepting only installation or `--uninstall`. It writes a versioned protected Program Files folder and creates the fixed `OnbunFpsCollector` service. It never accepts app paths, script text or an arbitrary service account. Existing unrelated services are refused. Account group memberships are unchanged.
- The service runs as `LocalService`, retaining `SeChangeNotifyPrivilege` and `SeImpersonatePrivilege`. It loads only protected code and PresentMon; it never loads Vitals, Node or Onbun app code. Users receive query/start rights to the service, not configuration, deletion, stop or DACL rights.
- The local pipe denies network tokens and allows interactive users to request a numeric PID. The service impersonates the client only to verify process ownership. It collects at most one authorized PID and returns FPS/application/status. No shell, file path, arbitrary command, serialized object or dynamic provider is accepted.
- Installation is invoked only by an explicit desktop settings action. Vitals checks the packaged setup hash and the protected client hash. Hash checks detect corruption; signing and protected installation are the publication trust boundary. An arbitrary compromised Onbun app already has normal-user code execution, so unprivileged app hashes alone cannot authenticate an elevation prompt.

## Resource use

- Demand-start rather than boot-start; self-stops after 15–20 seconds without requests.
- Vitals requests readings only while a recently viewed phone page needs FPS or the visible Vitals island is set to FPS, and telemetry is absent. CPU/RAM island mode never starts capture by itself.
- Native foreground-window polling at 1 Hz; no persistent PowerShell watcher.
- PresentMon targets one PID, with GPU/display/input timing disabled. Private captures are stopped on target changes and shutdown; normal timed sessions renew after 60 seconds.
- Two bounded pipe workers, 32-byte requests, read/write deadlines and rate-limited target changes.
- Up to 16 swap chains, each retaining eight 250-ms aggregate buckets instead of individual frames. JSON is emitted once per second, not once per frame. No frame files are recorded.

## Verification and limits

The native self-test exercises frame averaging, separate swap chains, stale/invalid data, quoted CSV, process ownership, actual local-pipe ACLs and client impersonation. JavaScript tests exercise opt-out, explicit setup, cancellation, successful enablement, telemetry priority, corrupt payloads, process shutdown and non-Windows isolation. The Onbun screen validator passes.

The normal native client, with the service absent, used 25.4 MiB working set and 0 measured CPU milliseconds during a five-second steady-state sample on this machine. This is an idle-client observation, not a live-capture benchmark or a cross-machine guarantee.

No service has been installed for testing. UAC, SCM registration, live LocalService/PresentMon capture, under-game overhead, native phone layout and production signing still require verification before public release. Some protected processes may reject ownership queries or presentation capture. Windows ARM64 requires x64 emulation; other hosts keep using telemetry.
