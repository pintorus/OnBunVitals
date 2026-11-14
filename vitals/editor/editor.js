'use strict';
/* Vitals PC page editor. Talks to the app backend over loopback with the URL token. */
(() => {
  const token = location.hash.slice(1);
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) n.append(k); return n; };
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Translations arrive with the state from the app (state.t); keys are the `ed.*` names with dots as underscores.
  const T = (key, params) => {
    let text = server?.t?.[key.replace(/\./g, '_')] ?? key;
    if (params) text = text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    return text;
  };
  const DISPLAY = () => Object.fromEntries(server.displays.map(d => [d, T(`d.${d}`)]));
  const HEIGHT = () => Object.fromEntries(Object.keys(server.heights).map(h => [h, T(`h.${h}`)]));
  let appliedLang = '';
  function applyTexts() {
    if (!server || server.lang === appliedLang) return;
    appliedLang = server.lang;
    document.documentElement.lang = server.lang;
    document.title = T('title');
    const apply = root => {
      root.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = T(n.dataset.i18n); });
      root.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = T(n.dataset.i18nTitle); });
    };
    apply(document); apply($('hint').content);
    $('orientation').setAttribute('aria-label', T('preview'));
    const select = $('language'); select.setAttribute('aria-label', T('language'));
    select.replaceChildren(...server.languages.map(l => el('option', { value: l.value, textContent: l.label })));
  }
  const BIG = { s: 26, m: 40, l: 58, xl: 80 };

  let server = null;   // last state from the backend
  let pages = [];      // working copy
  let widgets = [];    // working copy of metric settings
  let pageIndex = 0, selected = null, dirty = false, orientation = 'landscape', drag = null;

  async function api(method, path, body) {
    const res = await fetch(path, { method, headers: { 'X-Vitals-Token': token, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  function status(text, kind = '') { const s = $('status'); s.textContent = text; s.className = 'status ' + kind; }
  function markDirty() { dirty = true; $('save').disabled = false; $('revert').disabled = false; status(T('dirty'), 'dirty'); render(); }

  const page = () => pages[pageIndex];
  const live = id => server.widgets.find(w => w.id === id);
  const metric = id => widgets.find(w => w.id === id);
  function find(id) {
    for (const r of page().rows) { if (r.id === id) return { row: r }; const t = r.tiles.find(t => t.id === id); if (t) return { row: r, tile: t }; }
    return {};
  }
  function tint(tile) {
    const w = live(tile.metric), m = metric(tile.metric);
    const v = w.value;
    if (v !== null) {
      if (w.low ? v <= m.critical : v >= m.critical) return 'red';
      if (w.low ? v <= m.warning : v >= m.warning) return 'orange';
    }
    return tile.color === 'auto' ? m.color : tile.color;
  }

  // ---------- Stage ----------
  function renderTabs() {
    const tabs = $('tabs'); tabs.replaceChildren();
    pages.forEach((p, i) => tabs.append(el('button', { textContent: p.name, className: i === pageIndex ? 'on' : '', onclick: () => { pageIndex = i; selected = null; render(); } })));
    $('addPage').disabled = pages.length >= server.limits.pages;
  }

  function chartSvg(points, color) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 40'); svg.setAttribute('preserveAspectRatio', 'none');
    const ys = points.length > 1 ? points : [0.3, 0.45, 0.4, 0.6, 0.5, 0.7, 0.55].map(y => ({ y: y * 100 }));
    const max = Math.max(1, ...ys.map(p => p.y));
    const d = ys.map((p, i) => `${(i / (ys.length - 1)) * 100},${40 - (p.y / max) * 36}`).join(' L');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', `M0,40 L${d} L100,40 Z`); path.setAttribute('fill', `var(--${color})`); path.setAttribute('fill-opacity', '.25');
    path.setAttribute('stroke', `var(--${color})`); path.setAttribute('stroke-width', '1.5'); path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path); return svg;
  }

  function tileNode(tile, row) {
    const w = live(tile.metric), color = tint(tile);
    const node = el('div', { className: 'tile' + (selected === tile.id ? ' selected' : ''), draggable: true, title: T('tileTitle') });
    node.style.borderColor = selected === tile.id ? '' : (color === 'red' || color === 'orange' ? `var(--${color})` : '');
    node.append(el('div', { className: 'label' }, el('b', { textContent: w.name }), row.height !== 's' ? el('span', { textContent: w.statusLabel }) : null));
    const n = w.value === null ? '—' : Math.round(w.value);
    const size = Math.round((BIG[row.height] - (row.tiles.length > 2 ? 8 : 0)) * 0.8);
    if (!w.available && tile.display !== 'value') node.append(el('div', { className: 'na', textContent: T('unavailableHere') }));
    else if (tile.display === 'gauge') {
      const pct = w.value === null ? 0 : Math.min(1, w.value / w.max);
      const ring = el('div', { className: 'big' }); ring.style.cssText = `margin:auto;width:${size * 1.4}px;height:${size * 1.4}px;border-radius:50%;display:grid;place-items:center;font-size:${size * .42}px;background:radial-gradient(var(--tile) 62%,transparent 63%),conic-gradient(var(--${color}) ${pct * 360}deg,var(--raised) 0)`;
      ring.textContent = `${n}`; node.append(ring);
    } else {
      const big = el('div', { className: 'big' }, String(n), el('small', { textContent: w.unit }));
      big.style.fontSize = size + 'px'; big.style.color = `var(--${color})`;
      if (tile.display === 'chart') { big.style.fontSize = Math.round(size * .55) + 'px'; big.style.marginTop = '4px'; node.append(big, chartSvg([], color)); }
      else node.append(big);
      if (tile.display === 'bar') { const bar = el('div', { className: 'bar' }, el('i')); bar.firstChild.style.cssText = `width:${w.value === null ? 0 : Math.min(100, w.value / w.max * 100)}%;background:var(--${color})`; node.append(bar); }
    }
    node.onclick = e => { e.stopPropagation(); selected = tile.id; render(); };
    node.ondragstart = e => { drag = tile.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tile.id); };
    node.ondragend = () => { drag = null; document.querySelectorAll('.drop').forEach(n => n.classList.remove('drop')); };
    node.ondragover = e => { if (drag && drag !== tile.id) { e.preventDefault(); e.stopPropagation(); node.classList.add('drop'); } };
    node.ondragleave = () => node.classList.remove('drop');
    node.ondrop = e => { e.preventDefault(); e.stopPropagation(); swapTiles(drag, tile.id); };
    return node;
  }

  function renderStage() {
    const p = page();
    $('pageName').value = p.name;
    $('pageLeft').disabled = pageIndex === 0; $('pageRight').disabled = pageIndex === pages.length - 1; $('pageDelete').disabled = pages.length === 1;
    $('phone').className = 'phone ' + orientation;
    const screen = $('screen'); screen.replaceChildren();
    const scale = 1; // the preview screen is drawn at phone points
    let used = 0;
    p.rows.forEach((r, ri) => {
      const row = el('div', { className: 'row' + (selected === r.id ? ' selected' : '') });
      row.style.gridTemplateColumns = `repeat(${r.tiles.length}, 1fr)`;
      row.style.height = Math.round(server.heights[r.height] * scale) + 'px';
      used += server.heights[r.height] + (ri ? server.spacing : 0);
      r.tiles.forEach(t => row.append(tileNode(t, r)));
      row.onclick = () => { selected = r.id; render(); };
      row.ondragover = e => { if (drag && r.tiles.length < server.limits.tiles && !r.tiles.some(t => t.id === drag)) { e.preventDefault(); row.classList.add('drop'); } };
      row.ondragleave = () => row.classList.remove('drop');
      row.ondrop = e => { e.preventDefault(); moveTile(drag, r.id); };
      screen.append(row);
    });
    const available = server.fit[orientation]; // visible HUD height in points, typical phone
    const fit = $('fit');
    if (used > available) { fit.textContent = T('overflow', { pt: used - available, orientation: T(orientation).toLowerCase() }); fit.className = 'fit warn'; }
    else { fit.textContent = T('fits', { rows: p.rows.length }); fit.className = 'fit'; }
    $('addRow').disabled = p.rows.length >= server.limits.rows;
  }

  // ---------- Inspector ----------
  function choices(options, current, onPick, labels) {
    return el('div', { className: 'choices' }, ...options.map(o => el('button', { textContent: labels[o], className: o === current ? 'on' : '', onclick: () => onPick(o) })));
  }
  function swatches(current, onPick) {
    return el('div', { className: 'swatches' },
      el('button', { className: 'auto' + (current === 'auto' ? ' on' : ''), title: T('metricColor'), onclick: () => onPick('auto') }),
      ...server.colors.map(c => { const b = el('button', { title: server.colorNames?.[c] || c, className: c === current ? 'on' : '', onclick: () => onPick(c) }); b.style.background = `var(--${c})`; return b; }));
  }
  function field(label, control) { return el('label', { className: 'field' }, el('span', { textContent: label }), control); }

  function metricPanel(id) {
    const m = metric(id), w = live(id);
    const num = key => {
      const input = el('input', { type: 'number', min: 0, max: w.max, value: m[key] });
      input.onchange = () => { m[key] = Number(input.value); markDirty(); };
      return input;
    };
    return [el('h3', { textContent: T('thresholdsOf', { name: w.name }) }),
      el('div', { className: 'thresholds' }, field(T('warningUnit', { unit: w.unit }), num('warning')), field(T('criticalUnit', { unit: w.unit }), num('critical'))),
      el('p', { className: 'note', textContent: T(w.low ? 'lowNote' : 'highNote') }),
      field(T('metricDefaultColor'), swatches(m.color, c => { m.color = c === 'auto' ? m.color : c; markDirty(); })),
      el('p', { className: 'note', textContent: `${w.source || T('noSource')} · ${w.detail || ''}` })];
  }

  function renderInspector() {
    const box = $('inspector'); box.replaceChildren();
    const { row, tile } = selected ? find(selected) : {};
    if (tile) {
      const idx = row.tiles.indexOf(tile);
      const select = el('select', {}, ...server.widgets.map(w => el('option', { value: w.id, textContent: w.name + (w.available ? '' : T('unavailableSuffix')), selected: w.id === tile.metric })));
      select.onchange = () => { tile.metric = select.value; markDirty(); };
      box.append(el('h2', { textContent: T('tile') }),
        field(T('metric'), select),
        field(T('display'), choices(server.displays, tile.display, d => { tile.display = d; markDirty(); }, DISPLAY())),
        field(T('color'), swatches(tile.color, c => { tile.color = c; markDirty(); })),
        el('div', { className: 'actions' },
          el('button', { textContent: '◀', title: T('left'), disabled: idx === 0, onclick: () => { row.tiles.splice(idx - 1, 0, row.tiles.splice(idx, 1)[0]); markDirty(); } }),
          el('button', { textContent: '▶', title: T('right'), disabled: idx === row.tiles.length - 1, onclick: () => { row.tiles.splice(idx + 1, 0, row.tiles.splice(idx, 1)[0]); markDirty(); } }),
          el('button', { textContent: T('duplicate'), disabled: row.tiles.length >= server.limits.tiles, onclick: () => { const c = { ...clone(tile), id: uid('t') }; row.tiles.splice(idx + 1, 0, c); selected = c.id; markDirty(); } }),
          el('button', { textContent: T('delete'), className: 'danger', onclick: () => removeTile(row, tile) })),
        ...metricPanel(tile.metric));
    } else if (row) {
      const ri = page().rows.indexOf(row);
      box.append(el('h2', { textContent: T('row') }),
        field(T('height'), choices(Object.keys(server.heights), row.height, h => { row.height = h; markDirty(); }, HEIGHT())),
        el('div', { className: 'actions' },
          el('button', { textContent: T('addTile'), disabled: row.tiles.length >= server.limits.tiles, onclick: () => { const t = { id: uid('t'), metric: 'cpu', display: 'value', color: 'auto' }; row.tiles.push(t); selected = t.id; markDirty(); } }),
          el('button', { textContent: '▲', title: T('up'), disabled: ri === 0, onclick: () => { page().rows.splice(ri - 1, 0, page().rows.splice(ri, 1)[0]); markDirty(); } }),
          el('button', { textContent: '▼', title: T('down'), disabled: ri === page().rows.length - 1, onclick: () => { page().rows.splice(ri + 1, 0, page().rows.splice(ri, 1)[0]); markDirty(); } }),
          el('button', { textContent: T('deleteRow'), className: 'danger', disabled: page().rows.length === 1, onclick: () => { page().rows.splice(ri, 1); selected = null; markDirty(); } })),
        el('p', { className: 'note', textContent: T('rowNote') }));
    } else {
      box.append($('hint').content.cloneNode(true));
      const interval = el('p', { className: 'note', textContent: T('intervalNote', { s: server.interval }) });
      box.append(interval);
    }
  }

  // ---------- Mutations ----------
  function removeTile(row, tile) {
    row.tiles.splice(row.tiles.indexOf(tile), 1);
    if (!row.tiles.length) { const rows = page().rows; if (rows.length > 1) rows.splice(rows.indexOf(row), 1); else row.tiles.push({ id: uid('t'), metric: 'cpu', display: 'value', color: 'auto' }); }
    selected = null; markDirty();
  }
  function moveTile(tileId, rowId) {
    const from = find(tileId), to = page().rows.find(r => r.id === rowId);
    if (!from.tile || !to || from.row === to || to.tiles.length >= server.limits.tiles) return;
    from.row.tiles.splice(from.row.tiles.indexOf(from.tile), 1);
    to.tiles.push(from.tile);
    if (!from.row.tiles.length) page().rows.splice(page().rows.indexOf(from.row), 1);
    selected = tileId; markDirty();
  }
  function swapTiles(a, b) {
    const x = find(a), y = find(b);
    if (!x.tile || !y.tile) return;
    const i = x.row.tiles.indexOf(x.tile), j = y.row.tiles.indexOf(y.tile);
    x.row.tiles[i] = y.tile; y.row.tiles[j] = x.tile; selected = a; markDirty();
  }

  function render() { if (!server) return; applyTexts(); $('language').value = server.language; renderTabs(); renderStage(); renderInspector(); }

  function load(state, keepEdits, live = false) {
    const first = !server;
    server = state;
    // Live polling only refreshes the preview, so controls in the inspector stay clickable.
    if (live && !first && drag) return;
    if (live && !first && server.lang !== appliedLang) { render(); return; }
    if (live && !first) { if (!keepEdits && JSON.stringify(state.pages) !== JSON.stringify(pages)) { pages = clone(state.pages); pageIndex = Math.min(pageIndex, pages.length - 1); renderTabs(); } renderStage(); return; }
    if (!keepEdits) { pages = clone(state.pages); widgets = clone(state.widgets.map(({ id, visible, size, color, warning, critical }) => ({ id, visible, size, color, warning, critical }))); dirty = false; $('save').disabled = true; $('revert').disabled = true; }
    pageIndex = Math.min(pageIndex, pages.length - 1);
    render();
  }

  // ---------- Wiring ----------
  $('addPage').onclick = () => { pages.push({ id: uid('p'), name: T('newPage', { n: pages.length + 1 }), rows: [{ id: uid('r'), height: 'l', tiles: [{ id: uid('t'), metric: 'fps', display: 'value', color: 'auto' }] }] }); pageIndex = pages.length - 1; selected = null; markDirty(); };
  $('addRow').onclick = () => { const r = { id: uid('r'), height: 'm', tiles: [{ id: uid('t'), metric: 'cpu', display: 'value', color: 'auto' }] }; page().rows.push(r); selected = r.id; markDirty(); };
  $('pageName').oninput = e => { page().name = e.target.value.slice(0, 24); dirty = true; $('save').disabled = false; $('revert').disabled = false; status(T('dirty'), 'dirty'); renderTabs(); };
  $('pageLeft').onclick = () => { pages.splice(pageIndex - 1, 0, pages.splice(pageIndex, 1)[0]); pageIndex--; markDirty(); };
  $('pageRight').onclick = () => { pages.splice(pageIndex + 1, 0, pages.splice(pageIndex, 1)[0]); pageIndex++; markDirty(); };
  $('pageDelete').onclick = () => { if (confirm(T('deletePageConfirm', { name: page().name }))) { pages.splice(pageIndex, 1); pageIndex = Math.max(0, pageIndex - 1); selected = null; markDirty(); } };
  $('orientation').onclick = e => { const o = e.target.dataset.o; if (!o) return; orientation = o; [...$('orientation').children].forEach(b => b.classList.toggle('on', b.dataset.o === o)); render(); };
  $('revert').onclick = () => { selected = null; load(server, false); status(T('discarded')); };
  $('save').onclick = async () => {
    $('save').disabled = true; status(T('sending'));
    try { load(await api('PUT', '/api/layout', { pages, widgets }), false); status(T('sent')); }
    catch (e) { $('save').disabled = false; status(e.message, 'error'); }
  };
  $('language').onchange = async e => {
    try { const state = await api('PUT', '/api/language', { language: e.target.value }); server = { ...server, ...state, pages: server.pages, widgets: server.widgets }; appliedLang = ''; render(); status(T(dirty ? 'dirty' : 'connected'), dirty ? 'dirty' : ''); }
    catch (err) { status(err.message, 'error'); }
  };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (!$('save').disabled) $('save').click(); }
    if (e.key === 'Escape') { selected = null; render(); }
    if ((e.key === 'Delete') && selected && document.activeElement.tagName !== 'INPUT') { const { row, tile } = find(selected); if (tile) removeTile(row, tile); }
  });

  async function poll() {
    try { load(await api('GET', '/api/state'), dirty, true); if (!dirty && !$('status').textContent) status(T('connected')); }
    catch (e) { status(e.message, 'error'); }
    setTimeout(poll, 1500);
  }
  if (!token) status('Open the editor from Vitals (island or phone).', 'error'); else poll();
})();
