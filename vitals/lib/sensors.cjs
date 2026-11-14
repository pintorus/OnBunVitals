'use strict';

const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { t, VitalsError } = require('./i18n.cjs');

function cpuSnapshot() {
  return os.cpus().map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
}
function cpuUsage(previous, current) {
  if (!previous.length || previous.length !== current.length) return null;
  let total = 0, idle = 0;
  current.forEach((c, i) => { total += c.total - previous[i].total; idle += c.idle - previous[i].idle; });
  return total > 0 && idle >= 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : null;
}

async function readSmall(file, limit = 65536) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new VitalsError('err.telemetryLarge');
    return buffer.toString('utf8', 0, bytesRead);
  } finally { await handle.close(); }
}

function telemetry(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.timestamp) || now - raw.timestamp > 10000 || raw.timestamp > now + 2000) throw new VitalsError('err.telemetryStale');
  const result = {};
  for (const [key, max] of [['fps', 2000], ['gpu', 100], ['cpuTemp', 150], ['gpuTemp', 150]]) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new VitalsError('err.telemetryValue', { key });
    result[key] = { value, source: t('src.telemetry'), detail: t(key === 'fps' ? 'det.telemetryFps' : 'det.telemetry') };
  }
  return result;
}

function createSensors(dataDir) {
  const children = new Set();
  let closed = false, nextNvidia = 0, nextWindows = 0;
  function run(file, args) {
    return new Promise((resolve, reject) => {
      if (closed) return reject(new VitalsError('err.collectStopped'));
      const child = execFile(file, args, { timeout: 3500, maxBuffer: 128 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
        children.delete(child);
        error ? reject(error) : resolve(stdout);
      });
      children.add(child);
    });
  }

  async function memory() {
    const total = os.totalmem();
    let available = os.freemem();
    if (process.platform === 'linux') {
      try {
        const text = await readSmall('/proc/meminfo');
        const match = text.match(/^MemAvailable:\s+(\d+) kB/m);
        if (match) available = Number(match[1]) * 1024;
      } catch {}
    }
    const used = Math.max(0, total - available);
    const gb = n => (n / 1024 ** 3).toFixed(1);
    return { value: total > 0 ? 100 * used / total : null, source: t('src.system'), detail: t(process.platform === 'darwin' ? 'det.memoryCache' : 'det.memory', { used: gb(used), total: gb(total) }) };
  }

  async function disk() {
    const root = process.platform === 'win32' ? (process.env.SystemDrive || 'C:') + '\\' : path.parse(os.homedir()).root;
    let total, free;
    if (process.platform === 'win32') {
      const script = '$d=Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DeviceID -eq $env:SystemDrive}; "$($d.Size),$($d.FreeSpace)"';
      [total, free] = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])).trim().split(',').map(Number);
    } else {
      try {
        const info = await fs.statfs(root);
        total = Number(info.blocks) * Number(info.bsize);
        free = Number(info.bavail) * Number(info.bsize);
      } catch {
        const line = (await run('/bin/df', ['-kP', root])).trim().split('\n').at(-1).trim().split(/\s+/);
        total = Number(line[1]) * 1024; free = Number(line[3]) * 1024;
      }
    }
    if (!(total > 0) || !Number.isFinite(free)) throw new Error('Espace disque inaccessible.');
    return { value: Math.max(0, Math.min(100, 100 * (1 - free / total))), source: t('src.volume'), detail: t('det.disk', { free: (free / 1024 ** 3).toFixed(1), total: (total / 1024 ** 3).toFixed(0) }) };
  }

  async function linuxTemperature() {
    if (process.platform !== 'linux') return {};
    const candidates = [];
    const base = '/sys/class/hwmon';
    for (const entry of await fs.readdir(base).catch(() => [])) {
      const dir = path.join(base, entry);
      const name = (await readSmall(path.join(dir, 'name')).catch(() => '')).trim();
      if (!/^(coretemp|k10temp|zenpower|cpu_thermal|soc_thermal)$/i.test(name)) continue;
      for (const file of await fs.readdir(dir).catch(() => [])) {
        if (!/^temp\d+_input$/.test(file)) continue;
        const value = Number((await readSmall(path.join(dir, file)).catch(() => '')).trim()) / 1000;
        if (value > 0 && value <= 150) candidates.push(value);
      }
    }
    return candidates.length ? { cpuTemp: { value: Math.max(...candidates), source: t('src.linuxSensors'), detail: t('det.cpuTempLinux') } } : {};
  }

  async function nvidia() {
    if (Date.now() < nextNvidia) return {};
    try {
      const text = await run('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits']);
      const [gpu, temp] = text.trim().split('\n')[0].split(',').map(v => /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
      const result = {};
      if (gpu !== null && gpu >= 0 && gpu <= 100) result.gpu = { value: gpu, source: 'NVIDIA SMI', detail: t('det.nvidiaGpu') };
      if (temp !== null && temp >= 0 && temp <= 150) result.gpuTemp = { value: temp, source: 'NVIDIA SMI', detail: t('det.nvidiaTemp') };
      return result;
    } catch { nextNvidia = Date.now() + 60000; return {}; }
  }

  async function linuxGpu() {
    if (process.platform !== 'linux') return {};
    const base = '/sys/class/drm';
    const result = {};
    for (const card of (await fs.readdir(base).catch(() => [])).filter(name => /^card\d+$/.test(name)).sort()) {
      const device = path.join(base, card, 'device');
      const raw = (await readSmall(path.join(device, 'gpu_busy_percent')).catch(() => '')).trim();
      const value = raw ? Number(raw) : NaN;
      if (!Number.isFinite(value) || value < 0 || value > 100) continue;
      result.gpu = { value, source: t('src.linuxGpu'), detail: t('det.linuxGpu') };
      const hwmon = path.join(device, 'hwmon');
      for (const entry of await fs.readdir(hwmon).catch(() => [])) {
        const dir = path.join(hwmon, entry);
        if ((await readSmall(path.join(dir, 'name')).catch(() => '')).trim() !== 'amdgpu') continue;
        const temp = Number((await readSmall(path.join(dir, 'temp1_input')).catch(() => '')).trim()) / 1000;
        if (temp > 0 && temp <= 150) result.gpuTemp = { value: temp, source: 'AMD Linux', detail: t('det.amdTemp') };
      }
      break;
    }
    return result;
  }

  async function windowsSensors() {
    if (process.platform !== 'win32' || Date.now() < nextWindows) return {};
    try {
      const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor | Where-Object {$_.SensorType -in @('Load','Temperature')} | Select-Object Identifier,Name,SensorType,Value) | ConvertTo-Json -Compress";
      const parsed = JSON.parse(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]));
      const sensors = Array.isArray(parsed) ? parsed : [parsed];
      const result = {};
      for (const sensor of sensors) {
        const id = String(sensor?.Identifier || '');
        const name = String(sensor?.Name || '');
        let key;
        if (sensor?.SensorType === 'Temperature' && /cpu/i.test(id)) key = 'cpuTemp';
        if (sensor?.SensorType === 'Temperature' && /gpu/i.test(id) && /core/i.test(name)) key = 'gpuTemp';
        if (sensor?.SensorType === 'Load' && /gpu/i.test(id) && /core/i.test(name)) key = 'gpu';
        const value = sensor?.Value;
        if (key && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (key === 'gpu' ? 100 : 150)) {
          if (!result[key] || value > result[key].value) result[key] = { value, source: 'Libre Hardware Monitor', detail: t('det.lhm') };
        }
      }
      return result;
    } catch { nextWindows = Date.now() + 60000; return {}; }
  }

  return {
    memory,
    async slow() {
      const [diskResult, linux, gpu, windows, nv] = await Promise.allSettled([disk(), linuxTemperature(), linuxGpu(), windowsSensors(), nvidia()]);
      const readings = {};
      if (diskResult.status === 'fulfilled') readings.disk = diskResult.value;
      for (const r of [linux, gpu, windows, nv]) if (r.status === 'fulfilled') Object.assign(readings, r.value);
      return { readings, error: diskResult.status === 'rejected' ? t('err.volume') : '' };
    },
    async external() {
      try { return { readings: telemetry(JSON.parse(await readSmall(path.join(dataDir, 'telemetry.json')))), error: '' }; }
      catch (e) {
        return { readings: {}, error: e.code === 'ENOENT' ? '' : e instanceof SyntaxError ? t('err.telemetryJson') : e.code ? t('err.telemetryAccess') : e.message };
      }
    },
    close() { closed = true; for (const child of children) child.kill(); children.clear(); }
  };
}

module.exports = { cpuSnapshot, cpuUsage, telemetry, createSensors, readSmall };
