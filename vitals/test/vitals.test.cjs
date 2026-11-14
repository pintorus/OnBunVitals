'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const model = require('../lib/model.cjs');
const { cpuUsage, telemetry, createSensors } = require('../lib/sensors.cjs');
const { activate } = require('../index.cjs');

test('CPU deltas distinguish idle, busy, hotplug and unchanged counters', () => {
  assert.equal(cpuUsage([{ idle: 100, total: 200 }], [{ idle: 150, total: 300 }]), 50);
  assert.equal(cpuUsage([{ idle: 100, total: 200 }], [{ idle: 200, total: 300 }]), 0);
  assert.equal(cpuUsage([{ idle: 100, total: 200 }], [{ idle: 100, total: 300 }]), 100);
  assert.equal(cpuUsage([], []), null);
  assert.equal(cpuUsage([{ idle: 1, total: 2 }], [{ idle: 1, total: 2 }]), null);
});

test('thresholds validate at the boundary and FPS alerts run in the opposite direction', () => {
  const cpu = model.defaults().widgets[0];
  assert.equal(model.severity(75, cpu, model.definitions[0]), 'warning');
  assert.equal(model.severity(90, cpu, model.definitions[0]), 'critical');
  assert.equal(model.severity(null, cpu, model.definitions[0]), 'unavailable');
  assert.throws(() => model.validateWidget({ ...cpu, critical: 70 }), /supérieur/);
  assert.throws(() => model.validateWidget({ ...cpu, warning: '75' }), /supérieur/);
  assert.throws(() => model.validateWidget({ ...cpu, visible: 1 }), /invalides/);
  assert.throws(() => model.validateWidget({ ...cpu, color: '#ffffff' }), /invalides/);
  const fps = model.defaults().widgets.find(w => w.id === 'fps');
  const definition = model.definitions.find(d => d.id === 'fps');
  assert.equal(model.severity(30, fps, definition), 'critical');
  assert.equal(model.severity(50, fps, definition), 'warning');
  assert.equal(model.severity(60, fps, definition), 'normal');
  assert.throws(() => model.validateWidget({ ...fps, critical: 60 }), /inférieur/);
});

test('restoration rejects invalid preferences, deduplicates and retains defaults', () => {
  const defaults = model.defaults();
  const restored = model.restore({ interval: 0, notifications: 'yes', widgets: [{ ...defaults.widgets[2], size: 'small' }, defaults.widgets[2], { ...defaults.widgets[0], color: 'invalid' }] });
  assert.equal(restored.interval, 2);
  assert.equal(restored.notifications, false);
  assert.equal(restored.widgets.length, model.definitions.length);
  assert.equal(restored.widgets[0].id, 'disk');
  assert.equal(restored.widgets[0].size, 'small');
});

test('local telemetry expires, rejects invalid values and never forwards arbitrary fields', () => {
  const now = 100000;
  assert.equal(telemetry({ timestamp: now, fps: 144, secret: 'no' }, now).fps.value, 144);
  assert.deepEqual(Object.keys(telemetry({ timestamp: now, fps: 0, password: 'secret' }, now)), ['fps']);
  assert.throws(() => telemetry({ timestamp: now - 10001, fps: 60 }, now), /périmée/);
  assert.throws(() => telemetry({ timestamp: now + 2001, fps: 60 }, now), /périmée/);
  for (const value of ['60', -1, NaN, Infinity, 2001]) assert.throws(() => telemetry({ timestamp: now, fps: value }, now), /invalide/);
  assert.throws(() => telemetry({ timestamp: now, gpu: 101 }, now), /invalide/);
});

test('rows preserve order, hide disabled widgets and give large widgets a full row', () => {
  const widgets = model.view(model.defaults(), {}, {});
  const rows = model.rows(widgets);
  assert.equal(rows[0].items.length, 1);
  assert.equal(rows[0].items[0].size, 'large');
  assert.ok(rows.every(r => r.items.length <= 2));
  assert.deepEqual(rows.flatMap(r => r.items.map(w => w.id)), widgets.filter(w => w.visible).map(w => w.id));
  assert.deepEqual(model.rows(widgets.map(w => ({ ...w, visible: false }))), []);
});

test('telemetry file failures are readable; missing and oversized files cannot leak contents', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-sensor-'));
  const sensors = createSensors(dir);
  t.after(() => { sensors.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.deepEqual(await sensors.external(), { readings: {}, error: '' });
  const file = path.join(dir, 'telemetry.json');
  fs.writeFileSync(file, '{password:secret');
  assert.match((await sensors.external()).error, /JSON valide/);
  fs.writeFileSync(file, 'x'.repeat(65537));
  assert.match((await sensors.external()).error, /volumineux/);
  fs.writeFileSync(file, JSON.stringify({ timestamp: Date.now(), fps: 120 }));
  assert.equal((await sensors.external()).readings.fps.value, 120);
});

test('app samples real host, caches JSON, persists edits, rejects commands and closes timers', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-app-'));
  fs.writeFileSync(path.join(dir, 'telemetry.json'), JSON.stringify({ timestamp: Date.now(), fps: 144, gpu: 33, cpuTemp: 54 }));
  const app = activate({ dataDir: dir });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(app.data().loading, true);
  const deadline = Date.now() + 4000;
  while (app.data().loading && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  const data = app.data();
  assert.equal(data.loading, false);
  assert.equal(app.data(), data, 'data returns its existing cache');
  assert.equal(data.widgets.find(w => w.id === 'fps').value, 144);
  assert.ok(data.widgets.find(w => w.id === 'memory').value >= 0);
  assert.doesNotThrow(() => JSON.stringify(data));
  const widget = { ...model.defaults().widgets[0], size: 'small', color: 'blue', visible: false };
  app.command('saveWidget', widget);
  assert.equal(app.data().widgets[0].visible, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).widgets[0].size, 'small');
  app.command('move', { id: 'cpu', direction: 1 });
  assert.equal(app.data().widgets[1].id, 'cpu');
  assert.throws(() => app.command('interval', 0), /cadence/);
  assert.throws(() => app.command('move', { id: 'cpu', direction: 9 }), /invalide/);
  assert.throws(() => app.command('arbitrary'), /inconnue/);
  assert.throws(() => app.settings.action('notifications', {}), /invalide/);
  assert.ok(app.settings.describe().items.some(i => i.text?.includes(path.join(dir, 'telemetry.json'))));
  assert.ok(app.island().expanded.title);
  app.close();
  const revision = app.data().revision;
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(app.data().revision, revision);
  assert.throws(() => app.command('refresh'), /fermé/);
  const reopened = activate({ dataDir: dir });
  assert.equal(reopened.data().widgets[1].size, 'small');
  reopened.close();
});

test('write failure retains current settings', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-write-'));
  const blocked = path.join(dir, 'not-a-directory');
  fs.writeFileSync(blocked, 'keep');
  const app = activate({ dataDir: blocked });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.throws(() => app.command('interval', 5), /enregistrer/);
  assert.equal(app.data().interval, 2);
  assert.equal(fs.readFileSync(blocked, 'utf8'), 'keep');
});
