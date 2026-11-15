'use strict';

// Pages of tiles for the phone HUD, placed freely on the magnetic grid of ./grid.js
// (12 columns, units of 60 pt). For the phone, each page is cut into bands → column
// groups → columns → items, which the Kit draws with stacks, grids and splits.

const { definitions, colors } = require('./model.cjs');
const { t, pageName, VitalsError } = require('./i18n.cjs');
const grid = require('./grid.js');

const LIMITS = { pages: 8, tiles: 16, name: 24 };
// Page padding on the phone: no bar (long press opens the settings), a margin below.
const SCREEN_TOP = 12, SCREEN_BOTTOM = 40; // keep in sync with the page padding in ui/screen.json
const displays = ['value', 'gauge', 'chart', 'bar'];
const metricIds = definitions.map(d => d.id);

let counter = 0;
const newId = prefix => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;
const tile = (metric, display, x, y, w, h, color = 'auto') => ({ id: newId('t'), metric, display, color, x, y, w, h });

// A HUD for gaming first, the full system second.
function defaultPages() {
  return [
    { id: 'hud', name: t('sys.pageGame'), enabled: true, portrait: null, tiles: [
      // FPS is the big tile a player looks at first; the rest stacks beside it.
      tile('fps', 'value', 0, 0, 6, 4), tile('cpu', 'gauge', 6, 0, 3, 2), tile('gpu', 'gauge', 9, 0, 3, 2),
      tile('cpuTemp', 'value', 6, 2, 3, 1), tile('gpuTemp', 'value', 9, 2, 3, 1), tile('memory', 'bar', 6, 3, 6, 1)
    ] },
    { id: 'system', name: t('sys.pageSystem'), enabled: true, portrait: null, tiles: [
      tile('cpu', 'chart', 0, 0, 8, 2), tile('memory', 'bar', 8, 0, 4, 2),
      tile('disk', 'bar', 0, 2, 4, 2), tile('load', 'value', 4, 2, 4, 2), tile('gpu', 'chart', 8, 2, 4, 2)
    ] }
  ];
}

// 1.1–1.3 saved rows of tiles: heights s/m/l/xl and optional quarter spans. Rows become
// bands of the grid, equal tiles share 12 columns, spans are quarters (3 columns).
const ROW_UNITS = { s: 1, m: 2, l: 3, xl: 4 };
function fromRows(rows) {
  const tiles = [];
  let y = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const list = (Array.isArray(r?.tiles) ? r.tiles : []).slice(0, 4);
    const h = ROW_UNITS[r?.height] || 2;
    const spans = list.map(x => x?.span || 1);
    const equal = spans.every(s => s === spans[0]);
    let x = 0;
    for (const [i, old] of list.entries()) {
      const w = equal ? 12 / list.length : spans[i] * 3;
      tiles.push({ id: old?.id, metric: old?.metric, display: old?.display, color: old?.color ?? 'auto', x, y, w, h });
      x += w;
    }
    if (list.length) y += h;
  }
  return tiles;
}

// Converts the version 1.0 list of widgets into pages, so very old setups survive too.
function fromWidgets(widgets) {
  const rows = [];
  let pending = [];
  const flush = () => { if (pending.length) rows.push({ height: pending[0].size === 'small' ? 's' : 'm', tiles: pending.map(w => ({ id: newId('t'), metric: w.id, display: w.size === 'small' ? 'value' : 'gauge' })) }); pending = []; };
  for (const w of widgets.filter(w => w.visible)) {
    if (w.size === 'large') { flush(); rows.push({ height: 'l', tiles: [{ id: newId('t'), metric: w.id, display: 'chart' }] }); continue; }
    if (pending.length && (pending[0].size !== w.size || pending.length === (w.size === 'small' ? 4 : 2))) flush();
    pending.push(w);
  }
  flush();
  const pages = [];
  for (let i = 0; i < rows.length; i += 3) pages.push({ id: newId('p'), enabled: true, portrait: null, name: pages.length ? t('sys.page', { n: pages.length + 1 }) : t('sys.defaultPage'), tiles: fromRows(rows.slice(i, i + 3)) });
  return pages.slice(0, LIMITS.pages).length ? pages.slice(0, LIMITS.pages) : defaultPages();
}

// Accepts the current format and the 1.1–1.3 row format.
const upgrade = pages => (Array.isArray(pages) ? pages.map(p => (p && !Array.isArray(p.tiles) && Array.isArray(p.rows)
  ? { ...p, tiles: fromRows(p.rows), portrait: Array.isArray(p.portrait) ? fromRows(p.portrait) : null }
  : p)) : pages);

const validId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
const int = v => Number.isInteger(v);

function validatePages(input) {
  const pages = upgrade(input);
  const fail = (key, params) => { throw new VitalsError(key, params); };
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > LIMITS.pages) fail('err.pages', { max: LIMITS.pages });
  const seen = new Set();
  const unique = id => { if (!validId(id) || seen.has(id)) fail('err.id'); seen.add(id); return id; };
  const tiles = (list, portrait) => {
    if (!Array.isArray(list) || list.length < 1 || list.length > LIMITS.tiles) fail('err.tiles', { max: LIMITS.tiles });
    const out = list.map(x => {
      if (!metricIds.includes(x?.metric) || !displays.includes(x.display) || !(x.color === 'auto' || colors.includes(x.color))) fail('err.tile');
      if (![x.x, x.y, x.w, x.h].every(int) || !grid.WIDTHS.includes(x.w) || x.x < 0 || x.x + x.w > grid.COLS || x.h < 1 || x.h > grid.MAX_H || x.y < 0 || x.y + x.h > grid.MAX_Y) fail('err.place');
      return { id: unique(x.id), metric: x.metric, display: x.display, color: x.color, x: x.x, y: x.y, w: x.w, h: x.h };
    });
    const cut = grid.decompose(out, { portrait });
    if (!cut.ok) fail(cut.reason === 'overlap' ? 'err.overlap' : cut.reason === 'portrait' ? 'err.portraitWidths' : 'err.cut');
    return out;
  };
  return pages.map(p => {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (!name || name.length > LIMITS.name) fail('err.pageName', { max: LIMITS.name });
    if (p.enabled !== undefined && typeof p.enabled !== 'boolean') fail('err.layout');
    return { id: unique(p.id), name, enabled: p.enabled !== false, tiles: tiles(p.tiles, false),
      // null: portrait reuses the landscape layout, reflowed by the phone.
      portrait: p.portrait == null ? null : tiles(p.portrait, true) };
  });
}

const pageHeight = page => grid.bottom(page.tiles);

// Binds live data into the structure the phone draws: bands → groups → columns → items.
function view(pages, widgets) {
  const byId = new Map(widgets.map(w => [w.id, w]));
  const tileView = (x, colsInBand, scale = 1) => {
    const w = byId.get(x.metric);
    const tint = w.status === 'critical' || w.status === 'warning' ? w.tint : (x.color === 'auto' ? w.color : x.color);
    const h = grid.points(x.h * scale), share = x.w / grid.COLS;
    // The number follows the tile's own height and its share of the width.
    const big = Math.round(Math.min(80, h * 0.33) * (share >= 0.5 ? 1 : share >= 0.3 ? 0.9 : 0.8));
    const compact = h < 90;
    // Narrow tiles use the short name (CPU, T° GPU…) unless the user renamed the metric.
    const narrow = share <= 1 / 3 || (compact && share <= 0.5);
    const name = narrow && w.name === t(`metric.${x.metric}`) ? t(`short.${x.metric}`) : w.name;
    return { id: x.id, metric: x.metric, display: x.display, name, symbol: w.symbol, value: w.value, available: w.available,
      number: w.value === null ? '—' : String(Math.round(w.value)), unit: w.unit, displayText: w.display,
      status: w.status, alert: w.status === 'warning' || w.status === 'critical', statusLabel: w.statusLabel, tint, max: w.max,
      ratio: w.value === null ? 0 : Math.max(0, Math.min(1, w.value / w.max)), history: w.history,
      showChart: x.display === 'chart' && w.history.length > 1 && h >= 100, h,
      // A missing reading shows a small dash, not a huge bar-like one.
      bigSize: w.available ? big : Math.min(big, 28), compactSize: w.available ? Math.round(Math.min(26, h * 0.4)) : 16,
      bigSizePortrait: w.available ? Math.round(Math.min(72, h * 0.3)) - (colsInBand > 1 ? 6 : 0) : 24,
      gaugeHeight: Math.max(40, h - 40), chartHeight: Math.max(24, h - 78), compact, showLabel: !compact };
  };
  const layoutView = (tiles, ownPortrait, portrait = false) => {
    const cut = grid.decompose(tiles);
    if (!cut.ok) return [];
    // Portrait has twice the height of landscape: a reused landscape layout grows to use it.
    const scale = portrait && !ownPortrait ? Math.max(1, Math.min(2, Math.floor(grid.FIT.portrait / Math.max(1, cut.height)))) : 1;
    const pts = units => grid.points(units * scale);
    return cut.bands.map((band, bi) => {
      const groups = band.groups.map((g, gi) => ({ id: `g${bi}_${gi}`, columns: g.columns.map((c, ci) => ({
        id: `c${bi}_${gi}_${ci}`, height: pts(band.h),
        // The tallest item of the column stretches when the band grows to the screen's height.
        items: c.items.map((item, ii, all) => {
          const tall = all.reduce((best, it, k) => (it.kind !== 'gap' && (best < 0 || it.h > all[best].h) ? k : best), -1);
          const grow = ii === tall;
          return { id: `i${bi}_${gi}_${ci}_${ii}`, gap: item.kind === 'gap', h: pts(item.h), grow,
            count: item.tiles ? item.tiles.length : 0, tiles: (item.tiles || []).map(x => ({ ...tileView(x, band.groups.length, scale), grow })) };
        })
      })), count: g.columns.length,
      // A reused landscape layout wraps wide groups to two columns in portrait.
      portraitCount: ownPortrait ? g.columns.length : Math.min(2, g.columns.length) }));
      const total = band.groups.reduce((s, g) => s + g.w * g.columns.length, 0);
      const width = g => (groups[g] ? band.groups[g].w * band.groups[g].columns.length : 0);
      // The last band takes the rest of the screen (Kit height "screen" minus what sits above it),
      // so the page fills the phone whatever its size.
      const last = bi === cut.bands.length - 1;
      const above = cut.bands.slice(0, bi).reduce((s, b) => s + pts(b.h) + grid.GAP, 0);
      return { id: `b${bi}`, height: pts(band.h), empty: !!band.empty, parts: groups.length,
        fills: last && !band.empty, screenOffset: SCREEN_TOP + SCREEN_BOTTOM + above,
        a: groups.slice(0, 1), b: groups.slice(1, 2), c: groups.slice(2, 3),
        // Kit split ratios: first part of the band, then the second of what remains.
        ratio: groups.length > 1 ? width(0) / total : 0.5, ratio2: groups.length > 2 ? width(1) / (width(1) + width(2)) : 0.5 };
    });
  };
  // Disabled pages stay in the editor but are not sent to the phone; at least one is always shown.
  const shown = pages.filter(p => p.enabled !== false);
  return (shown.length ? shown : pages.slice(0, 1)).map((p, index) => ({ id: p.id, name: pageName(p.name), index,
    bands: layoutView(p.tiles, false), portraitBands: layoutView(p.portrait || p.tiles, !!p.portrait, true),
    tiles: p.tiles.map(x => tileView(x, 1)) }));
}

module.exports = { SCREEN_TOP, SCREEN_BOTTOM, LIMITS, displays, grid, defaultPages, fromRows, fromWidgets, upgrade, validatePages, pageHeight, view };
