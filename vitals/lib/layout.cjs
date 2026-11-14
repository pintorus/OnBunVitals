'use strict';

// Pages of tiles for the phone HUD. A page is a stack of rows; the tiles of a row
// share its width equally. This is exactly what the Onbun Kit can draw natively
// (grid with a fixed column count per row), so the PC editor offers nothing more.

const { definitions, colors } = require('./model.cjs');

const LIMITS = { pages: 8, rows: 4, tiles: 4, name: 24 };
// Row heights in points, and the room a page has under the floating bar on a typical
// phone, so a HUD page never scrolls (landscape is the gaming posture).
const heights = { s: 72, m: 124, l: 176, xl: 260 };
const SPACING = 12, FIT = { landscape: 280, portrait: 600 };
const pageHeight = page => page.rows.reduce((sum, r, i) => sum + heights[r.height] + (i ? SPACING : 0), 0);
const displays = ['value', 'gauge', 'chart', 'bar'];
const metricIds = definitions.map(d => d.id);

let counter = 0;
const newId = prefix => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

function tile(metric, display = 'value', color = 'auto') { return { id: newId('t'), metric, display, color }; }
function row(height, tiles) { return { id: newId('r'), height, tiles }; }

// A HUD for gaming first, the full system second.
function defaultPages() {
  return [
    { id: 'hud', name: 'Jeu', rows: [
      row('l', [tile('fps', 'value'), tile('cpu', 'gauge'), tile('gpu', 'gauge')]),
      row('s', [tile('cpuTemp', 'value'), tile('gpuTemp', 'value'), tile('memory', 'bar')])
    ] },
    { id: 'system', name: 'Système', rows: [
      row('m', [tile('cpu', 'chart'), tile('memory', 'chart')]),
      row('m', [tile('disk', 'bar'), tile('load', 'value'), tile('gpu', 'chart')])
    ] }
  ];
}

// Converts the former list of widgets (v1 settings) into pages, so existing setups survive.
function fromWidgets(widgets) {
  const rows = [];
  let pending = [];
  const flush = () => { if (pending.length) rows.push(row(pending[0].size === 'small' ? 's' : 'm', pending.map(w => tile(w.id, w.size === 'small' ? 'value' : 'gauge')))); pending = []; };
  for (const w of widgets.filter(w => w.visible)) {
    if (w.size === 'large') { flush(); rows.push(row('l', [tile(w.id, 'chart')])); continue; }
    if (pending.length && (pending[0].size !== w.size || pending.length === (w.size === 'small' ? 4 : 2))) flush();
    pending.push(w);
  }
  flush();
  const pages = [];
  for (let i = 0; i < rows.length; i += 3) pages.push({ id: newId('p'), name: pages.length ? `Page ${pages.length + 1}` : 'Principal', rows: rows.slice(i, i + 3) });
  return pages.slice(0, LIMITS.pages).length ? pages.slice(0, LIMITS.pages) : defaultPages();
}

const validId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);

function validatePages(pages) {
  const fail = message => { throw new Error(message); };
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > LIMITS.pages) fail(`Il faut entre 1 et ${LIMITS.pages} pages.`);
  const seen = new Set();
  const unique = id => { if (!validId(id) || seen.has(id)) fail('Identifiant de page, de rangée ou de tuile invalide.'); seen.add(id); return id; };
  return pages.map(p => {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (!name || name.length > LIMITS.name) fail(`Chaque page a un nom de 1 à ${LIMITS.name} caractères.`);
    if (!Array.isArray(p.rows) || p.rows.length < 1 || p.rows.length > LIMITS.rows) fail(`La page « ${name} » doit avoir entre 1 et ${LIMITS.rows} rangées.`);
    return { id: unique(p.id), name, rows: p.rows.map(r => {
      if (!Object.hasOwn(heights, r?.height)) fail('Hauteur de rangée invalide.');
      if (!Array.isArray(r.tiles) || r.tiles.length < 1 || r.tiles.length > LIMITS.tiles) fail(`Chaque rangée contient entre 1 et ${LIMITS.tiles} tuiles.`);
      return { id: unique(r.id), height: r.height, tiles: r.tiles.map(t => {
        if (!metricIds.includes(t?.metric) || !displays.includes(t.display) || !(t.color === 'auto' || colors.includes(t.color))) fail('Réglages de tuile invalides.');
        return { id: unique(t.id), metric: t.metric, display: t.display, color: t.color };
      }) };
    }) };
  });
}

// Binds live widget data into the page structure the phone draws.
function view(pages, widgets) {
  const byId = new Map(widgets.map(w => [w.id, w]));
  return pages.map((p, index) => ({ id: p.id, name: p.name, index, rows: p.rows.map(r => ({
    id: r.id, height: heights[r.height], size: r.height, columns: r.tiles.length,
    tiles: r.tiles.map(t => {
      const w = byId.get(t.metric);
      const tint = w.status === 'critical' || w.status === 'warning' ? w.tint : (t.color === 'auto' ? w.color : t.color);
      const big = { s: 26, m: 40, l: 58, xl: 80 }[r.height] - (r.tiles.length > 2 ? 8 : 0);
      return { id: t.id, metric: t.metric, display: t.display, name: w.name, symbol: w.symbol, value: w.value, available: w.available,
        number: w.value === null ? '—' : String(Math.round(w.value)), unit: w.unit, displayText: w.display,
        status: w.status, alert: w.status === 'warning' || w.status === 'critical', statusLabel: w.statusLabel, tint, max: w.max,
        ratio: w.value === null ? 0 : Math.max(0, Math.min(1, w.value / w.max)), history: w.history,
        showChart: t.display === 'chart' && w.history.length > 1, bigSize: big, gaugeHeight: Math.max(60, heights[r.height] - 40),
        chartHeight: Math.max(28, heights[r.height] - 78), compact: r.height === 's', showLabel: r.height !== 's' };
    })
  })) }));
}

module.exports = { LIMITS, FIT, SPACING, pageHeight, heights, displays, defaultPages, fromWidgets, validatePages, view };
