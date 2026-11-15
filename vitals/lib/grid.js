/* Vitals magnetic grid, shared by the app (require) and the PC editor (<script>).
 *
 * Tiles sit on a 12-column grid: x and w in columns, y and h in units of UNIT points.
 * Widths snap to quarters, thirds and halves. Tiles never overlap and are pulled up by a
 * "magnet" (gravity) so the page has no holes above a tile.
 *
 * The phone can only draw splits, stacks and grids, so `decompose` cuts a layout into
 * horizontal bands, each band into columns, each column into items (one tile, tiles side
 * by side, or a gap). A layout that cannot be cut this way is refused by the editor and
 * the app alike, so they never disagree about what the phone can show.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VitalsGrid = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  'use strict';
  const COLS = 12, UNIT = 60, GAP = 12, MAX_H = 6, MAX_Y = 24;
  const WIDTHS = [3, 4, 6, 8, 9, 12];
  // Room under the bar on a typical phone: 4 units in landscape, 8 in portrait.
  const FIT = { landscape: 4, portrait: 8 };

  const points = units => units * UNIT + (units - 1) * GAP;
  const snapWidth = w => WIDTHS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const bottom = tiles => tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0);

  // Keeps a tile inside the grid with a snapped width.
  function clampTile(t) {
    const w = snapWidth(t.w), h = Math.max(1, Math.min(MAX_H, Math.round(t.h)));
    const x = Math.max(0, Math.min(COLS - w, Math.round(t.x))), y = Math.max(0, Math.min(MAX_Y - h, Math.round(t.y)));
    return { ...t, x, y, w, h };
  }

  // The magnet: every tile rises until it touches the top or another tile.
  function compact(tiles) {
    const placed = [];
    for (const t of [...tiles].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const tile = { ...t };
      while (tile.y > 0 && !placed.some(p => overlap(p, { ...tile, y: tile.y - 1 }))) tile.y--;
      placed.push(tile);
    }
    return tiles.map(t => placed.find(p => p.id === t.id));
  }

  // Puts `moved` where asked, pushes the tiles it lands on downwards, then applies the magnet.
  function place(tiles, moved) {
    const target = clampTile(moved);
    let others = tiles.filter(t => t.id !== target.id).map(t => ({ ...t }));
    const settled = [target];
    const queue = others.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const t of queue) {
      while (settled.some(s => overlap(s, t))) t.y++;
      settled.push(t);
    }
    const order = tiles.map(t => t.id);
    return compact(settled).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  function reflow(tiles, target) {
    const order = tiles.map(x => x.id);
    const displaced = tiles.filter(x => x.id !== target.id && overlap(x, target));
    let kept = compact([target, ...tiles.filter(x => x.id !== target.id && !overlap(x, target))]);
    for (const d of displaced) kept = compact([...kept, { ...d, ...freeSpot(kept, d.w, d.h) }]);
    return kept.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  // The smart magnet: place the tile where asked if the phone can draw the result, otherwise at
  // the nearest position (move) or nearest size (resize) that it can draw. Null if none.
  function placeNearest(tiles, moved, kind = 'move', options = {}) {
    const ok = list => decompose(list, options).ok;
    const want = clampTile(moved);
    const candidates = [];
    if (kind === 'move') {
      for (let d = 0; d <= 8; d++) for (let dy = -d; dy <= d; dy++) {
        const rest = d - Math.abs(dy);
        for (const dx of rest ? [-rest, rest] : [0]) candidates.push({ ...want, x: want.x + dx, y: want.y + dy });
      }
    } else {
      const widths = [...WIDTHS].sort((a, b) => Math.abs(a - want.w) - Math.abs(b - want.w));
      for (let dh = 0; dh < MAX_H; dh++) for (const w of widths) for (const h of [want.h - dh, want.h + dh]) {
        if (h >= 1 && h <= MAX_H && want.x + w <= COLS) candidates.push({ ...want, w, h });
      }
    }
    const seen = new Set();
    for (const c of candidates) {
      const tile = clampTile(c), key = `${tile.x},${tile.y},${tile.w},${tile.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // First push the tiles in the way downwards; if the result cannot be drawn, take them
      // out and drop each one into the first free spot instead (reflow).
      const next = place(tiles, tile);
      if (ok(next)) return next;
      const flowed = reflow(tiles, tile);
      if (flowed && ok(flowed)) return flowed;
    }
    return null;
  }

  // First free spot for a new tile of the given size, scanning top to bottom, left to right.
  function freeSpot(tiles, w, h) {
    for (let y = 0; y < MAX_Y; y++) for (let x = 0; x + w <= COLS; x++) {
      const probe = { x, y, w, h };
      if (!tiles.some(t => overlap(t, probe))) return { x, y };
    }
    return { x: 0, y: bottom(tiles) };
  }

  // Positions where nothing straddles: the places a band or a column can be cut.
  function cuts(tiles, from, to, start, size) {
    const out = [from];
    for (let p = from + 1; p < to; p++) if (!tiles.some(t => start(t) < p && p < start(t) + size(t))) out.push(p);
    out.push(to);
    return out;
  }

  function decompose(tiles, options = {}) {
    if (!tiles.length) return { ok: false, reason: 'empty' };
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (overlap(tiles[i], tiles[j])) return { ok: false, reason: 'overlap' };
    const bands = [];
    const ys = cuts(tiles, 0, bottom(tiles), t => t.y, t => t.h);
    for (let b = 0; b + 1 < ys.length; b++) {
      const y0 = ys[b], y1 = ys[b + 1];
      const inBand = tiles.filter(t => t.y >= y0 && t.y < y1);
      if (!inBand.length) { bands.push({ y: y0, h: y1 - y0, empty: true, groups: [] }); continue; }
      const xs = cuts(inBand, 0, COLS, t => t.x, t => t.w);
      const columns = [];
      for (let c = 0; c + 1 < xs.length; c++) {
        const x0 = xs[c], x1 = xs[c + 1];
        const inCol = inBand.filter(t => t.x >= x0 && t.x < x1);
        const items = [];
        const iy = inCol.length ? cuts(inCol, y0, y1, t => t.y, t => t.h) : [y0, y1];
        for (let k = 0; k + 1 < iy.length; k++) {
          const top = iy[k], h = iy[k + 1] - top;
          const here = inCol.filter(t => t.y >= top && t.y < top + h).sort((a, b) => a.x - b.x);
          if (!here.length) { items.push({ kind: 'gap', y: top, h }); continue; }
          // Tiles of one item must sit side by side, same height, equal widths, filling the column.
          const w = here[0].w;
          const fills = here.every((t, i) => t.y === top && t.h === h && t.w === w && t.x === x0 + i * w) && here.length * w === x1 - x0;
          if (!fills) return { ok: false, reason: 'nested' };
          items.push({ kind: 'tiles', y: top, h, tiles: here });
        }
        columns.push({ x: x0, w: x1 - x0, items });
      }
      // Neighbouring columns of equal width form a group (a grid); groups are joined by splits.
      const groups = [];
      for (const col of columns) {
        const last = groups[groups.length - 1];
        if (last && last.w === col.w) last.columns.push(col); else groups.push({ w: col.w, columns: [col] });
      }
      if (groups.length > 3) return { ok: false, reason: 'columns' };
      if (options.portrait && groups.length > 1) return { ok: false, reason: 'portrait' };
      bands.push({ y: y0, h: y1 - y0, groups });
    }
    return { ok: true, bands, height: bottom(tiles) };
  }

  return { COLS, UNIT, GAP, MAX_H, MAX_Y, WIDTHS, FIT, points, snapWidth, overlap, bottom, clampTile, compact, place, placeNearest, freeSpot, decompose };
});
