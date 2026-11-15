'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { activate } = require('../index.cjs');
const model = require('../lib/model.cjs');

function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-island-'));
  const posts = [], cleared = [], pending = new Map(), samples = [];
  const config = { ...model.defaults(), language: 'en', ...options.config };
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(config));
  const telemetry = readings => fs.writeFileSync(path.join(dir, 'telemetry.json'), JSON.stringify({ timestamp: Date.now(), ...readings }));
  if (options.readings) telemetry(options.readings);
  const app = activate({ dataDir: dir, electron: { app: { getPreferredSystemLanguages: () => ['en'] } },
    notifications: {
      post(note) { posts.push(note); pending.set(note.id, note); },
      clear(id) { cleared.push(id); pending.delete(id); }
    },
    fps: { available: true, installed: () => true,
      install() { assert.fail('Changing the island should not show a setup prompt'); },
      sample(enabled) { samples.push(enabled); return { readings: enabled ? { fps: { value: 90, source: 'Onbun FPS collector', detail: 'game.exe' } } : {}, error: '', detail: null }; },
      reset() {}, close() {} }
  });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, posts, cleared, pending, samples, telemetry, saved: () => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))) };
}
async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), 'Sampling did not finish');
}

test('island defaults restore safely and show CPU plus RAM in compact and expanded views', async t => {
  const defaults = model.defaults();
  assert.equal(defaults.islandEnabled, true); assert.equal(defaults.islandDisplay, 'system'); assert.equal(defaults.notifications, false);
  const invalid = model.restore({ islandEnabled: 'no', islandDisplay: 'shell' });
  assert.equal(invalid.islandEnabled, true); assert.equal(invalid.islandDisplay, 'system');
  const f = fixture(t); await until(() => !f.app.data().loading);
  assert.match(f.app.island().compact.title, /^CPU(?:\d+%|—) RAM(?:\d+%|—)$/);
  assert.match(f.app.island().expanded.subtitle, /^CPU .* · RAM /);
  assert.equal(f.app.island().expanded.footer.note, '');
});

test('threshold notifications can be disabled, clear old notices, and leave readings on the island', async t => {
  const f = fixture(t, { config: { notifications: true }, readings: { gpu: 99 } });
  await until(() => f.posts.some(note => note.id === 'vitals-gpu'));
  assert.equal(f.app.island().priority, 12);
  assert.deepEqual(f.app.settings.action('notifications', { on: false }), { saved: true });
  assert.ok(f.cleared.includes('vitals-gpu')); assert.equal(f.pending.size, 0);
  assert.equal(f.saved().notifications, false);
  assert.equal(f.app.island().priority, 1); assert.equal(f.app.island().expanded.footer.note, '');
  assert.match(f.app.island().compact.title, /CPU.*RAM/);
  const before = f.posts.length;
  f.telemetry({ gpu: 99, cpuTemp: 100 }); f.app.command('refresh');
  await until(() => f.app.data().widgets.find(w => w.id === 'cpuTemp').value === 100);
  assert.equal(f.posts.length, before);
});

test('hiding Vitals removes its island output and threshold notices while keeping the phone dashboard usable', async t => {
  const f = fixture(t, { config: { notifications: true }, readings: { gpu: 99 } });
  await until(() => f.posts.length > 0);
  f.app.settings.action('islandEnabled', { on: false });
  assert.equal(f.app.island(), null); assert.equal(f.pending.size, 0);
  assert.equal(f.saved().islandEnabled, false); assert.ok(f.app.data().pages.length > 0);
  const before = f.posts.length;
  f.telemetry({ gpu: 99, cpuTemp: 100 }); f.app.command('refresh');
  await until(() => f.app.data().widgets.find(w => w.id === 'cpuTemp').value === 100);
  assert.equal(f.posts.length, before);
  f.app.settings.action('islandEnabled', { on: true }); assert.ok(f.app.island().expanded);
});

test('switching the island to telemetry FPS does not enable or install automatic collection', async t => {
  const f = fixture(t, { readings: { fps: 144 } }); await until(() => !f.app.data().loading);
  f.app.settings.action('islandFps', { on: true });
  assert.equal(f.saved().islandDisplay, 'fps'); assert.equal(f.saved().fpsEnabled, false);
  assert.equal(f.app.island().compact.title, '144 FPS'); assert.equal(f.app.island().expanded.subtitle, '144 FPS');
  assert.ok(f.samples.every(enabled => enabled === false));
  f.app.settings.action('islandFps', { on: false });
  assert.equal(f.saved().islandDisplay, 'system'); assert.match(f.app.island().compact.title, /CPU.*RAM/);
});

test('the FPS island can use an already enabled collector without a phone or FPS dashboard tile', async t => {
  const pages = model.defaults().pages.filter(page => page.id === 'system');
  const f = fixture(t, { config: { fpsEnabled: true, islandDisplay: 'fps', pages } });
  f.app.island(); f.app.command('refresh');
  await until(() => f.samples.some(enabled => enabled === true));
  assert.equal(f.app.island().compact.title, '90 FPS');
  f.app.settings.action('islandEnabled', { on: false });
  assert.equal(f.samples.at(-1), false); assert.equal(f.app.island(), null);
});

test('missing FPS stays honest and new island settings reject invalid values', async t => {
  const f = fixture(t); await until(() => !f.app.data().loading);
  f.app.settings.action('islandFps', { on: true });
  assert.equal(f.app.island().compact.title, 'FPS —');
  assert.equal(f.app.island().expanded.footer.note, 'Enable FPS in Onbun island settings');
  for (const action of ['islandEnabled', 'islandFps', 'notifications']) {
    assert.throws(() => f.app.settings.action(action, { on: 'yes' }), /Invalid|invalide/i);
    assert.throws(() => f.app.settings.action(action, {}), /Invalid|invalide/i);
  }
  const toggles = f.app.settings.describe().items.filter(item => item.type === 'toggle').map(item => item.action);
  assert.ok(toggles.includes('islandEnabled')); assert.ok(toggles.includes('islandFps')); assert.ok(toggles.includes('notifications'));
});
