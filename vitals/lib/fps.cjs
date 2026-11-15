'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn: nativeSpawn, execFile: nativeExecFile } = require('node:child_process');
const { msg } = require('./i18n.cjs');

function createFps({ platform = process.platform, arch = process.arch, spawn = nativeSpawn, execFile = nativeExecFile,
  io = fs, now = Date.now, parentPid = process.pid,
  root = path.join(process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files', 'Onbun FPS Collector'),
  setup = path.join(__dirname, '..', 'bin', 'OnbunFpsSetup.exe') } = {}) {
  // No helper processes, installation checks or permission prompts on other platforms.
  if (platform !== 'win32' || !['x64', 'arm64'].includes(arch)) return {
    available: false, installed: () => false, sample: () => ({ readings: {}, error: '', detail: null }),
    install: async () => ({ installed: false }), reset() {}, close() {}
  };
  let client = null, closed = false, retryAt = 0, buffer = '', latest = null, failure = '', pending = null, verified = null;
  let expectedVersion = '1.0.0';
  try { expectedVersion = JSON.parse(io.readFileSync(path.join(path.dirname(setup), 'collector-build.json'), 'utf8')).version || expectedVersion; } catch {}
  function installed() {
    try {
      const metadata = JSON.parse(io.readFileSync(path.join(root, 'collector.json'), 'utf8'));
      if (!/^\d+\.\d+\.\d+-[a-f0-9]{12}$/.test(metadata.version) || !metadata.version.startsWith(expectedVersion + '-') || !/^[a-f0-9]{64}$/.test(metadata.sha256)) return false;
      const file = path.join(root, metadata.version, 'OnbunFpsCollector.exe');
      if (verified?.file === file && verified.hash === metadata.sha256) return file;
      const hash = crypto.createHash('sha256').update(io.readFileSync(file)).digest('hex');
      if (hash !== metadata.sha256) return false;
      verified = { file, hash }; return file;
    } catch { return false; }
  }
  function stop() { const running = client; client = null; latest = null; buffer = ''; if (running) running.kill(); }
  function start() {
    if (client || closed || now() < retryAt) return;
    const file = installed(); if (!file) return;
    failure = ''; buffer = ''; latest = null;
    try {
      const child = spawn(file, ['--client', String(parentPid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      client = child; child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (client !== child) return;
        buffer += chunk;
        if (buffer.length > 16384) { buffer = ''; latest = null; failure = 'err.fpsCollector'; return; }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          try {
            const value = JSON.parse(line);
            if (value.fps !== null && (typeof value.fps !== 'number' || !Number.isFinite(value.fps) || value.fps < 0 || value.fps > 2000)) throw Error('Invalid FPS');
            latest = { value: value.fps, app: typeof value.app === 'string' ? value.app.slice(0, 120) : '', at: now() };
            failure = value.error ? (value.error === 'permission' ? 'err.fpsPermission' : value.error === 'target' ? '' : 'err.fpsCollector') : '';
          } catch { latest = null; failure = 'err.fpsCollector'; }
        }
      });
      const failed = () => { if (client === child) { client = null; latest = null; failure = 'err.fpsCollector'; retryAt = now() + 60000; } };
      child.once('error', failed); child.once('exit', failed);
    } catch { client = null; failure = 'err.fpsCollector'; retryAt = now() + 60000; }
  }
  function install() {
    if (closed) return Promise.resolve({ installed: false });
    if (installed()) return Promise.resolve({ installed: true });
    if (pending) return pending;
    try {
      const build = JSON.parse(io.readFileSync(path.join(path.dirname(setup), 'collector-build.json'), 'utf8'));
      const actual = crypto.createHash('sha256').update(io.readFileSync(setup)).digest('hex');
      if (actual !== build.setupSha256) return Promise.resolve({ installed: false, cancelled: false });
    } catch { return Promise.resolve({ installed: false, cancelled: false }); }
    // Only the fixed-payload native setup is elevated. This wrapper stays unelevated.
    // No caller-supplied executable, command, install location or service argument is accepted.
    const quoted = "'" + setup.replace(/'/g, "''") + "'";
    const script = `$ErrorActionPreference='Stop'; try { $p=Start-Process -FilePath ${quoted} -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop; $p.WaitForExit(); @{code=$p.ExitCode;cancelled=$false}|ConvertTo-Json -Compress } catch { @{code=1;cancelled=($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223)}|ConvertTo-Json -Compress }`;
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    pending = new Promise(resolve => {
      try {
        execFile(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
          { windowsHide: true, maxBuffer: 8192 }, (error, output) => {
            let result = {};
            try { result = JSON.parse(String(output).trim().replace(/^\uFEFF/, '')); } catch {}
            verified = null;
            resolve({ installed: !error && result.code === 0 && !!installed(), cancelled: result.cancelled === true });
          });
      } catch { resolve({ installed: false, cancelled: false }); }
    });
    pending.then(() => { pending = null; });
    return pending;
  }
  return {
    available: true, installed, install,
    sample(enabled = false) {
      if (closed || !enabled) { stop(); return { readings: {}, error: '', detail: null }; }
      if (!installed()) { stop(); return { readings: {}, error: '', detail: msg('det.fpsEnable') }; }
      start();
      const valid = latest && now() - latest.at <= 3500;
      const fps = valid && !failure && latest.value !== null ? { value: latest.value, source: 'Onbun FPS collector', detail: msg('det.fpsWindow', { app: latest.app }) } : null;
      return { readings: fps ? { fps } : {}, error: failure ? msg(failure) : '', detail: failure ? msg(failure) : fps?.detail || msg('det.fpsWaiting') };
    },
    reset() { retryAt = 0; failure = ''; verified = null; },
    close() { if (!closed) { closed = true; stop(); } }
  };
}

module.exports = { createFps };
