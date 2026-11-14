'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const model = require('../lib/model.cjs');
const { cpuUsage, telemetry, createSensors } = require('../lib/sensors.cjs');
const { activate: start } = require('../index.cjs');
const i18n = require('../lib/i18n.cjs');

// The app follows the computer's language; tests pin French unless they say otherwise.
const french = { app: { getPreferredSystemLanguages: () => ['fr-FR'] } };
const activate = ctx => start({ electron: french, ...ctx });
i18n.setLanguage('fr');

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
  assert.equal(app.data().widgets[0].visible, true, 'a metric shown on a page stays visible');
  assert.equal(app.data().widgets[0].color, 'blue');
  assert.equal(app.data().pages[0].rows[0].tiles.length, 3);
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

const layout = require('../lib/layout.cjs');

test('default pages validate and bind live values into equal-width rows', () => {
  const config = model.defaults();
  assert.deepEqual(layout.validatePages(config.pages), config.pages);
  const pages = layout.view(config.pages, model.view(config, { fps: { value: 25 } }, {}));
  assert.equal(pages[0].name, 'Jeu');
  const fps = pages[0].rows[0].tiles.find(t => t.metric === 'fps');
  assert.equal(fps.number, '25');
  assert.equal(fps.status, 'critical');
  assert.equal(fps.tint, 'red');
  assert.equal(pages[0].rows[0].columns, pages[0].rows[0].tiles.length);
});

test('page validation enforces the limits the phone can draw', () => {
  const ok = model.defaults().pages;
  const bad = mutate => { const p = JSON.parse(JSON.stringify(ok)); mutate(p); return () => layout.validatePages(p); };
  assert.throws(bad(p => { p[0].rows[0].tiles.push(...p[0].rows[1].tiles.map(t => ({ ...t, id: t.id + 'x' })), { id: 'zz', metric: 'cpu', display: 'value', color: 'auto' }); }), /entre 1 et 4 tuiles/);
  assert.throws(bad(p => { p[0].rows[0].height = 'huge'; }), /Hauteur/);
  assert.throws(bad(p => { p[0].rows[0].tiles[0].metric = 'secret'; }), /tuile invalides/);
  assert.throws(bad(p => { p[1].id = p[0].id; }), /Identifiant/);
  assert.throws(bad(p => { p[0].name = ' '; }), /nom/);
  assert.throws(() => layout.validatePages([]), /entre 1 et 8 pages/);
});

test('v1 widget lists migrate into pages and keep their order', () => {
  const old = model.defaults().widgets.map(w => ({ ...w }));
  old.find(w => w.id === 'load').visible = false;
  const restored = model.restore({ interval: 2, widgets: old });
  const metrics = restored.pages.flatMap(p => p.rows.flatMap(r => r.tiles.map(t => t.metric)));
  assert.deepEqual(metrics, old.filter(w => w.visible).map(w => w.id));
  assert.equal(restored.pages[0].rows[0].tiles[0].display, 'chart');
  assert.deepEqual(layout.validatePages(restored.pages), restored.pages);
  const broken = model.restore({ widgets: old, pages: [{ id: 'x' }] });
  assert.equal(broken.pages[0].name, 'Jeu');
});

test('every default page fits a landscape phone without scrolling', () => {
  for (const page of model.defaults().pages) assert.ok(layout.pageHeight(page) <= layout.FIT.landscape, `${page.name}: ${layout.pageHeight(page)} pt`);
});

test('only metrics placed on a page are visible and can alert', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-pages-'));
  const pages = [{ id: 'only', name: 'FPS', rows: [{ id: 'r1', height: 'l', tiles: [{ id: 't1', metric: 'fps', display: 'value', color: 'auto' }] }] }];
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ ...model.defaults(), pages }));
  const app = activate({ dataDir: dir });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const data = app.data();
  assert.deepEqual(data.widgets.filter(w => w.visible).map(w => w.id), ['fps']);
  assert.equal(data.pages.length, 1);
  assert.equal(data.pageCount, 1);
});

test('every language translates every key with the same placeholders', () => {
  const keys = Object.keys(i18n.STRINGS);
  for (const lang of i18n.LANGS) for (const key of keys) {
    const text = i18n.t(key, null, lang);
    assert.ok(text && text !== key, `${lang} ${key}`);
    const names = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
    assert.equal(names(text), names(i18n.t(key, null, 'en')), `${lang} ${key} placeholders`);
  }
  assert.deepEqual(Object.keys(i18n.EXTRA.zh).sort(), keys.slice().sort());
  assert.deepEqual(Object.keys(i18n.EXTRA.ja).sort(), keys.slice().sort());
});

test('language follows the system, falls back to English and can be chosen', async t => {
  assert.equal(i18n.resolve('auto', ['de-AT', 'en-US']), 'de');
  assert.equal(i18n.resolve('auto', ['zh-Hans-CN']), 'zh');
  assert.equal(i18n.resolve('auto', ['pt-BR']), 'en');
  assert.equal(i18n.resolve('ja', ['fr-FR']), 'ja');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-lang-'));
  const app = start({ dataDir: dir, electron: { app: { getPreferredSystemLanguages: () => ['ja-JP'] } } });
  t.after(() => { app.close(); i18n.setLanguage('fr'); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(app.data().widgets[0].name, 'プロセッサ');
  assert.equal(app.data().pages[0].name, 'ゲーム');
  assert.equal(app.data().t.save, '保存');
  app.command('language', 'en');
  assert.equal(app.data().widgets[0].name, 'Processor');
  assert.equal(app.data().language, 'en');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).language, 'en');
  assert.throws(() => app.command('interval', 0), /Choose an interval/);
  assert.throws(() => app.command('language', 'xx'), /Unsupported language/);
});
