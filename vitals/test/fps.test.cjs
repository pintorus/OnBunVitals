'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createFps } = require('../lib/fps.cjs');
const { activate } = require('../index.cjs');
const model = require('../lib/model.cjs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function harness(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-collector-'));
  const root = path.join(dir, 'protected'), setup = path.join(dir, 'bin/OnbunFpsSetup.exe');
  fs.mkdirSync(path.dirname(setup), { recursive: true }); fs.writeFileSync(setup, 'setup fixture');
  fs.writeFileSync(path.join(path.dirname(setup), 'collector-build.json'), JSON.stringify({ setupSha256: hash('setup fixture') }));
  const calls = [], setups = []; let time = 10000;
  const fps = createFps({ platform: 'win32', arch: 'x64', root, setup, now: () => time,
    spawn(file, args, options) {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
      child.kill = () => { child.killed = true; }; calls.push({ file, args, options, child }); return child;
    },
    execFile(file, args, options, callback) { setups.push({ file, args, options, callback }); }
  });
  function installed() {
    const content = Buffer.from('collector fixture'), sha256 = hash(content), version = '1.0.0-' + sha256.slice(0, 12);
    fs.mkdirSync(path.join(root, version), { recursive: true }); fs.writeFileSync(path.join(root, version, 'OnbunFpsCollector.exe'), content);
    fs.writeFileSync(path.join(root, 'collector.json'), JSON.stringify({ version, sha256 }));
  }
  t.after(() => { fps.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { fps, calls, setups, installed, root, setup, advance: n => { time += n; } };
}

test('every non-Windows host is telemetry-only with no helper, installation check or prompt', async () => {
  for (const platform of ['darwin', 'linux', 'freebsd']) {
    const reject = () => assert.fail('Non-Windows FPS side effect');
    const fps = createFps({ platform, spawn: reject, execFile: reject, io: { readFileSync: reject } });
    assert.equal(fps.available, false); assert.equal(fps.installed(), false);
    assert.deepEqual(fps.sample(true), { readings: {}, error: '', detail: null });
    assert.deepEqual(await fps.install(), { installed: false }); fps.close();
  }
});

test('FPS defaults off, including migration from the previous automatic-collection release', t => {
  assert.equal(model.defaults().fpsEnabled, false);
  for (const raw of [{}, { fpsEnabled: 'true' }, { version: 2 }]) assert.equal(model.restore(raw).fpsEnabled, false);
  const h = harness(t); h.installed(); h.fps.sample();
  assert.equal(h.calls.length, 0); assert.equal(h.setups.length, 0);
});

test('a missing collector only reports the setup hint; sampling cannot invoke UAC', t => {
  const h = harness(t);
  assert.equal(h.fps.sample(true).detail.key, 'det.fpsEnable');
  assert.equal(h.calls.length, 0); assert.equal(h.setups.length, 0);
});

test('setup cancellation leaves the collector absent and simultaneous requests use one prompt', async t => {
  const h = harness(t), first = h.fps.install(), second = h.fps.install();
  assert.equal(first, second); assert.equal(h.setups.length, 1);
  h.setups[0].callback(null, JSON.stringify({ code: 1, cancelled: true }));
  assert.deepEqual(await first, { installed: false, cancelled: true });
  assert.equal(h.fps.installed(), false); assert.equal(h.calls.length, 0);
});

test('setup success requires a verified installed payload, and reuses an existing collector without UAC', async t => {
  const h = harness(t), request = h.fps.install();
  h.installed(); h.setups[0].callback(null, JSON.stringify({ code: 0, cancelled: false }));
  assert.equal((await request).installed, true);
  assert.equal((await h.fps.install()).installed, true); assert.equal(h.setups.length, 1);
  const script = Buffer.from(h.setups[0].args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /OnbunFpsSetup\.exe/); assert.match(script, /-Verb RunAs/);
  assert.doesNotMatch(script, /Onbun\.exe|electron\.exe|Add-LocalGroupMember/);
});

test('corrupt setup and installed metadata cannot select another executable', async t => {
  const h = harness(t); fs.writeFileSync(h.setup, 'modified');
  assert.equal((await h.fps.install()).installed, false); assert.equal(h.setups.length, 0);
  fs.mkdirSync(h.root, { recursive: true }); fs.writeFileSync(path.join(h.root, 'collector.json'), JSON.stringify({ version: '../../other', sha256: 'a'.repeat(64) }));
  assert.equal(h.fps.installed(), false); h.fps.sample(true); assert.equal(h.calls.length, 0);
});

test('verified collection starts one hidden normal client, parses readings, expires them and stops when disabled', t => {
  const h = harness(t); h.installed(); h.fps.sample(true);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].args[0], '--client'); assert.equal(h.calls[0].options.windowsHide, true);
  const output = JSON.stringify({ fps: 144, app: 'game.exe', error: '' }) + '\n';
  h.calls[0].child.stdout.emit('data', output.slice(0, 10)); h.calls[0].child.stdout.emit('data', output.slice(10));
  assert.equal(h.fps.sample(true).readings.fps.value, 144);
  h.advance(4000); assert.deepEqual(h.fps.sample(true).readings, {});
  h.fps.sample(false); assert.equal(h.calls[0].child.killed, true); assert.equal(h.setups.length, 0);
});

test('malformed readings and service failures never produce FPS or automatic elevation', t => {
  const h = harness(t); h.installed(); h.fps.sample(true);
  for (const fps of ['144', -1, 2001]) {
    h.calls[0].child.stdout.emit('data', JSON.stringify({ fps, app: 'x', error: '' }) + '\n');
    assert.deepEqual(h.fps.sample(true).readings, {});
  }
  h.calls[0].child.stdout.emit('data', JSON.stringify({ fps: null, app: '', error: 'permission' }) + '\n');
  assert.equal(h.fps.sample(true).error.key, 'err.fpsPermission'); assert.equal(h.setups.length, 0);
  h.calls[0].child.emit('error', Error('failed')); h.fps.sample(true); assert.equal(h.calls.length, 1);
  h.advance(61000); h.fps.sample(true); assert.equal(h.calls.length, 2);
});

function appFixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-opt-in-'));
  let installed = false, installs = 0; const samples = [];
  const fps = { available: true, installed: () => installed,
    install: async () => { installs++; if (options.cancelled) return { installed: false, cancelled: true }; installed = true; return { installed: true }; },
    sample: enabled => { samples.push(enabled); return { readings: enabled ? { fps: { value: 87, source: 'Onbun FPS collector', detail: 'game.exe' } } : {}, error: '', detail: null }; }, reset() {}, close() {} };
  if (options.telemetry) fs.writeFileSync(path.join(dir, 'telemetry.json'), JSON.stringify({ timestamp: Date.now(), fps: 0 }));
  const app = activate({ dataDir: dir, fps, electron: { app: { getPreferredSystemLanguages: () => ['en'] } } });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, dir, samples, installs: () => installs };
}
async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), 'Sampling did not complete');
}

test('the FPS tile directs setup to island settings, and a phone command cannot trigger installation', async t => {
  const f = appFixture(t); await until(() => !f.app.data().loading);
  assert.equal(f.app.data().fpsEnabled, false); assert.equal(f.installs(), 0); assert.ok(f.samples.every(x => x === false));
  const tile = f.app.data().pages.flatMap(p => p.tiles).find(tile => tile.metric === 'fps');
  assert.equal(tile.hint, 'Enable FPS in Onbun island settings');
  assert.ok(f.app.settings.describe().items.some(item => item.action === 'enableFps'));
  assert.throws(() => f.app.command('enableFps'), /Unknown|inconnue/i); assert.equal(f.installs(), 0);
});

test('desktop opt-in persists only after successful setup; disabling clears readings and starts no prompt', async t => {
  const f = appFixture(t); await until(() => !f.app.data().loading);
  assert.deepEqual(await f.app.settings.action('enableFps'), { enabled: true });
  await until(() => f.app.data().widgets.find(w => w.id === 'fps').value === 87);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'settings.json'))).fpsEnabled, true);
  assert.equal(f.app.data().pages.flatMap(p => p.tiles).find(tile => tile.metric === 'fps').hint, '');
  assert.deepEqual(f.app.settings.action('disableFps'), { enabled: false });
  assert.equal(f.samples.at(-1), false); assert.equal(f.installs(), 1);
  assert.equal(f.app.data().widgets.find(w => w.id === 'fps').available, false);
});

test('cancelled setup leaves opt-in off and telemetry supplies FPS without a collector', async t => {
  const f = appFixture(t, { cancelled: true, telemetry: true }); await until(() => !f.app.data().loading);
  assert.deepEqual(await f.app.settings.action('enableFps'), { enabled: false, cancelled: true });
  assert.equal(f.app.data().fpsEnabled, false);
  const widget = f.app.data().widgets.find(w => w.id === 'fps');
  assert.equal(widget.value, 0); assert.equal(widget.source, 'Local telemetry');
  assert.ok(f.samples.every(x => x === false));
  assert.match(f.app.data().fpsSetupMessage, /cancelled/i);
});

test('enabling through desktop settings does not collect until Vitals is viewed', async t => {
  const f = appFixture(t); await f.app.settings.action('enableFps');
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.ok(f.samples.length > 0); assert.ok(f.samples.every(x => x === false));
  f.app.data(); f.app.command('refresh'); await until(() => f.samples.some(x => x === true));
});
