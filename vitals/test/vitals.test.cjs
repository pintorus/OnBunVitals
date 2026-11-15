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
  assert.match(i18n.say((await sensors.external()).error), /JSON valide/);
  fs.writeFileSync(file, 'x'.repeat(65537));
  assert.match(i18n.say((await sensors.external()).error), /volumineux/);
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
  assert.equal(app.data().pages[0].tiles.length, 6);
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

test('switching language retranslates readings and default page names at once', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-switch-'));
  const app = activate({ dataDir: dir });
  t.after(() => { app.close(); i18n.setLanguage('fr'); fs.rmSync(dir, { recursive: true, force: true }); });
  const deadline = Date.now() + 4000;
  while (app.data().loading && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(app.data().widgets.find(w => w.id === 'cpu').source, 'Système');
  app.command('language', 'de');
  const data = app.data();
  assert.equal(data.widgets.find(w => w.id === 'cpu').source, 'System');
  assert.match(data.widgets.find(w => w.id === 'cpu').detail, /logische Kerne/);
  assert.deepEqual(data.pages.map(p => p.name), ['Spiel', 'System']);
  assert.equal(i18n.pageName('ページ 3'), 'Seite 3');
  assert.equal(i18n.pageName('Mon setup'), 'Mon setup');
});

test('pages can be hidden and shown again from the phone', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-toggle-'));
  const app = activate({ dataDir: dir });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  app.command('pageEnabled', { id: 'hud', enabled: false });
  assert.deepEqual(app.data().pages.map(p => p.id), ['system']);
  assert.deepEqual(app.data().pageList.map(p => p.enabled), [false, true]);
  assert.throws(() => app.command('pageEnabled', { id: 'system', enabled: false }), /au moins une page/i);
  app.command('togglePage', 'hud');
  assert.deepEqual(app.data().pages.map(p => p.id), ['hud', 'system']);
  assert.throws(() => app.command('pageEnabled', { id: 'nope', enabled: true }), /invalide/);
});

test('the PC settings page offers a button that opens the editor', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-settings-'));
  let opened = '';
  const app = activate({ dataDir: dir, electron: { ...french, shell: { openExternal: async url => { opened = url; } } } });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const button = app.settings.describe().items.find(i => i.type === 'button');
  assert.equal(button.action, 'openEditor');
  assert.equal(button.primary, true);
  assert.deepEqual(app.settings.action('openEditor', {}), { opened: true });
  for (let i = 0; i < 40 && !opened; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.match(opened, /^http:\/\/127\.0\.0\.1:\d+\/#[0-9a-f]{48}$/);
});

const grid = require('../lib/grid.js');
const T = (id, x, y, w, h, metric = 'cpu') => ({ id, metric, display: 'value', color: 'auto', x, y, w, h });
const onePage = (tiles, extra = {}) => [{ id: 'p', name: 'P', tiles, ...extra }];

test('the magnet snaps widths, pulls tiles up and pushes overlapped tiles down', () => {
  assert.deepEqual([5, 7, 10, 1].map(grid.snapWidth), [4, 6, 9, 3]);
  assert.equal(grid.compact([T('a', 0, 3, 3, 1)])[0].y, 0);
  const placed = grid.place([T('a', 0, 0, 6, 2), T('b', 6, 0, 6, 2)], T('b', 3, 0, 6, 2));
  assert.deepEqual(placed.map(t => [t.id, t.x, t.y]), [['a', 0, 2], ['b', 3, 0]]);
  assert.deepEqual(grid.freeSpot([T('a', 0, 0, 6, 2)], 6, 2), { x: 6, y: 0 });
  assert.equal(grid.points(4), 276);
});

test('layouts are cut into bands, column groups and items, and a pinwheel is refused', () => {
  const game = model.defaults().pages[0].tiles;
  const cut = grid.decompose(game);
  assert.ok(cut.ok);
  assert.equal(cut.bands.length, 1);
  assert.deepEqual(cut.bands[0].groups.map(g => [g.w, g.columns.length]), [[6, 2]]);
  assert.deepEqual(cut.bands[0].groups[0].columns[1].items.map(i => i.tiles.map(t => t.metric)), [['cpu', 'gpu'], ['cpuTemp', 'gpuTemp'], ['memory']]);
  const pinwheel = [T('a', 0, 0, 8, 1), T('b', 8, 0, 4, 2), T('c', 4, 1, 4, 1), T('d', 0, 1, 4, 2), T('e', 4, 2, 8, 1)];
  assert.equal(grid.decompose(pinwheel).reason, 'nested');
  assert.equal(grid.decompose([T('a', 0, 0, 6, 1), T('b', 3, 0, 6, 1)]).reason, 'overlap');
  assert.equal(grid.decompose([T('a', 0, 0, 3, 1), T('b', 3, 0, 9, 1)], { portrait: true }).reason, 'portrait');
});

test('default pages fit a landscape phone and bind into splits for the phone', () => {
  const config = model.defaults();
  for (const page of config.pages) assert.ok(layout.pageHeight(page) <= grid.FIT.landscape, page.name);
  assert.deepEqual(layout.validatePages(config.pages), config.pages);
  const pages = layout.view(config.pages, model.view(config, { fps: { value: 25 } }, {}));
  const fps = pages[0].bands[0].a[0].columns[0].items[0].tiles[0];
  assert.deepEqual([fps.number, fps.status, fps.tint, fps.h], ['25', 'critical', 'red', 276]);
  const system = pages[1].bands[0];
  assert.deepEqual([system.parts, system.ratio], [2, 8 / 12]);
  assert.equal(pages[1].bands[1].a[0].count, 3);
  assert.equal(pages[1].portraitBands[1].a[0].portraitCount, 2, 'a reused layout wraps to two columns in portrait');
});

test('page validation refuses what the phone cannot draw', () => {
  const bad = tiles => () => layout.validatePages(onePage(tiles));
  assert.throws(bad([T('a', 0, 0, 5, 1)]), /Position ou taille/);
  assert.throws(bad([T('a', 10, 0, 3, 1)]), /Position ou taille/);
  assert.throws(bad([T('a', 0, 0, 6, 1), T('b', 3, 0, 6, 1)]), /chevauchent/);
  assert.throws(bad([T('a', 0, 0, 8, 1), T('b', 8, 0, 4, 2), T('c', 4, 1, 4, 1), T('d', 0, 1, 4, 2), T('e', 4, 2, 8, 1)]), /colonnes/);
  assert.throws(bad([{ ...T('a', 0, 0, 3, 1), metric: 'secret' }]), /tuile invalides/);
  assert.throws(() => layout.validatePages([...onePage([T('a', 0, 0, 3, 1)]), ...onePage([T('b', 0, 0, 3, 1)])]), /Identifiant/);
  assert.throws(() => layout.validatePages(onePage([T('a', 0, 0, 3, 1)], { portrait: [T('b', 0, 0, 3, 1), T('c', 3, 0, 9, 1)] })), /portrait/);
  assert.throws(() => layout.validatePages([]), /entre 1 et 8 pages/);
});

test('rows saved by 1.1–1.3 and widget lists from 1.0 migrate to the grid', () => {
  const saved = [{ id: 'hud', name: 'Jeu', enabled: false, portrait: null, rows: [
    { id: 'r1', height: 'l', tiles: [{ id: 'a', metric: 'fps', display: 'value', color: 'auto', span: 2 }, { id: 'b', metric: 'cpu', display: 'gauge', color: 'mint', span: 1 }, { id: 'c', metric: 'gpu', display: 'gauge', color: 'auto', span: 1 }] },
    { id: 'r2', height: 's', tiles: [{ id: 'd', metric: 'memory', display: 'bar', color: 'auto' }, { id: 'e', metric: 'disk', display: 'bar', color: 'auto' }, { id: 'f', metric: 'load', display: 'value', color: 'auto' }] }
  ] }, model.defaults().pages[1]];
  const restored = model.restore({ ...model.defaults(), pages: saved });
  const hud = restored.pages[0];
  assert.equal(hud.enabled, false);
  assert.deepEqual(hud.tiles.map(t => [t.id, t.x, t.y, t.w, t.h]), [['a', 0, 0, 6, 3], ['b', 6, 0, 3, 3], ['c', 9, 0, 3, 3], ['d', 0, 3, 4, 1], ['e', 4, 3, 4, 1], ['f', 8, 3, 4, 1]]);
  assert.equal(hud.tiles[1].color, 'mint');
  const old = model.defaults().widgets.map(w => ({ ...w }));
  old.find(w => w.id === 'load').visible = false;
  const v1 = model.restore({ interval: 2, widgets: old });
  assert.deepEqual(v1.pages.flatMap(p => p.tiles.map(t => t.metric)), old.filter(w => w.visible).map(w => w.id));
  assert.deepEqual(layout.validatePages(v1.pages), v1.pages);
});

test('pages can be hidden and get a portrait layout of their own', () => {
  const base = model.defaults().pages;
  const widgets = model.view(model.defaults(), {}, {});
  assert.deepEqual(layout.view(layout.validatePages([{ ...base[0], enabled: false }, base[1]]), widgets).map(p => p.id), ['system']);
  assert.equal(layout.view(layout.validatePages(base.map(p => ({ ...p, enabled: false }))), widgets).length, 1);
  const own = layout.view(layout.validatePages([{ ...base[0], portrait: [T('pt', 0, 0, 12, 3, 'fps')] }]), widgets)[0];
  assert.equal(own.portraitBands[0].a[0].columns[0].items[0].tiles[0].metric, 'fps');
  assert.equal(own.bands[0].a[0].columns[0].items[0].tiles[0].metric, 'fps');
});

test('the smart magnet finds the nearest layout the phone can draw', () => {
  const game = model.defaults().pages[0].tiles;
  const wider = grid.placeNearest(game, { ...game[1], w: 6 }, 'resize');
  assert.ok(grid.decompose(wider).ok);
  assert.deepEqual((({ x, y, w }) => [x, y, w])(wider.find(t => t.metric === 'cpu')), [6, 0, 6]);
  assert.ok(wider.find(t => t.metric === 'gpu').y >= 2, 'the displaced tile moves out of the way');
  const pinwheelish = grid.placeNearest([T('a', 0, 0, 6, 2), T('b', 6, 0, 6, 1), T('c', 6, 1, 6, 1)], T('a', 3, 1, 6, 2));
  assert.ok(pinwheelish === null || grid.decompose(pinwheelish).ok);
});
