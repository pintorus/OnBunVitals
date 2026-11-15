'use strict';
/* Vitals PC page editor: a magnetic grid. Talks to the app backend over loopback with the
   URL token. Placement rules come from grid.js, the same file the app validates with. */
(() => {
  const G = window.VitalsGrid;
  const token = location.hash.slice(1);
  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) n.append(k); return n; };
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let server = null;   // last state from the backend
  let pages = [];      // working copy
  let widgets = [];    // working copy of metric settings
  let pageIndex = 0, selected = null, dirty = false, orientation = 'landscape', gesture = null, phoneScale = 1;

  // ---------- Translations (state.t holds the `ed.*` strings, dots as underscores) ----------
  const T = (key, params) => {
    let text = server?.t?.[key.replace(/\./g, '_')] ?? key;
    if (params) text = text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    return text;
  };
  const DISPLAY = () => Object.fromEntries(server.displays.map(d => [d, T(`d.${d}`)]));
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
  // The tiles being edited: the page's own portrait layout when it has one.
  const editable = () => orientation === 'landscape' || !!page().portrait;
  const layout = (p = page()) => (orientation === 'portrait' && p.portrait ? p.portrait : p.tiles);
  const setLayout = tiles => { if (orientation === 'portrait' && page().portrait) page().portrait = tiles; else page().tiles = tiles; };
  const tileById = id => layout().find(t => t.id === id);
  const portraitOpts = () => ({ portrait: orientation === 'portrait' && !!page().portrait });

  function tint(tile) {
    const w = live(tile.metric), m = metric(tile.metric), v = w.value;
    if (v !== null) {
      if (w.low ? v <= m.critical : v >= m.critical) return 'red';
      if (w.low ? v <= m.warning : v >= m.warning) return 'orange';
    }
    return tile.color === 'auto' ? m.color : tile.color;
  }

  // Applies a new layout only if the phone can draw it; otherwise says why and keeps the old one.
  const REASONS = { overlap: 'overlap', nested: 'cut', columns: 'cut', portrait: 'portraitWidths' };
  function tryLayout(next, commit = true) {
    const cut = G.decompose(next, { portrait: orientation === 'portrait' && !!page().portrait });
    if (!cut.ok) { status(T('refused', { reason: server.errors?.[REASONS[cut.reason]] || cut.reason }), 'error'); return false; }
    setLayout(next);
    if (commit) markDirty();
    return true;
  }

  // ---------- Tabs ----------
  function renderTabs() {
    const tabs = $('tabs'); tabs.replaceChildren();
    pages.forEach((p, i) => tabs.append(el('button', { textContent: p.enabled === false ? T('disabledTab', { name: p.name }) : p.name,
      className: (i === pageIndex ? 'on' : '') + (p.enabled === false ? ' off' : ''), onclick: () => { pageIndex = i; selected = null; render(); },
      // Drag a tab onto another one to change the order of the pages.
      draggable: true, title: T('dragTab'),
      ondragstart: e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; },
      ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('drop'); },
      ondragleave: e => e.currentTarget.classList.remove('drop'),
      ondrop: e => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isInteger(from) || from === i) return renderTabs();
        const current = pages[pageIndex];
        pages.splice(i, 0, pages.splice(from, 1)[0]);
        pageIndex = pages.indexOf(current); markDirty();
      } })));
    $('addPage').disabled = pages.length >= server.limits.pages;
  }

  // ---------- Tiles ----------
  function chartSvg(color) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 40'); svg.setAttribute('preserveAspectRatio', 'none');
    const ys = [0.3, 0.45, 0.4, 0.6, 0.5, 0.7, 0.55];
    const d = ys.map((y, i) => `${(i / (ys.length - 1)) * 100},${40 - y * 36}`).join(' L');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', `M0,40 L${d} L100,40 Z`); path.setAttribute('fill', `var(--${color})`); path.setAttribute('fill-opacity', '.25');
    path.setAttribute('stroke', `var(--${color})`); path.setAttribute('stroke-width', '1.5'); path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path); return svg;
  }

  function tileNode(tile, interactive) {
    const w = live(tile.metric), color = tint(tile);
    const node = el('div', { className: 'tile' + (selected === tile.id ? ' selected' : '') });
    if (color === 'red' || color === 'orange') node.style.borderColor = `var(--${color})`;
    const h = G.points(tile.h), share = tile.w / G.COLS;
    const size = Math.round(Math.min(80, h * 0.33) * (share >= 0.5 ? 1 : share >= 0.3 ? 0.9 : 0.8));
    node.append(el('div', { className: 'label' }, el('b', { textContent: w.name }), h >= 90 ? el('span', { textContent: w.statusLabel }) : null));
    const n = w.value === null ? '—' : Math.round(w.value);
    if (!w.available && tile.display !== 'value') node.append(el('div', { className: 'na', textContent: T('unavailableHere') }));
    else if (tile.display === 'gauge') {
      const pct = w.value === null ? 0 : Math.min(1, w.value / w.max), d = Math.max(30, Math.min(h - 30, size * 1.4));
      const ring = el('div', { className: 'ring' }); ring.style.cssText = `width:${d}px;height:${d}px;font-size:${d * .3}px;background:radial-gradient(var(--tile) 62%,transparent 63%),conic-gradient(var(--${color}) ${pct * 360}deg,var(--raised) 0)`;
      ring.textContent = `${n}`; node.append(ring);
    } else {
      const big = el('div', { className: 'big' }, String(n), el('small', { textContent: w.unit }));
      big.style.fontSize = (tile.display === 'chart' ? Math.round(size * .55) : size) + 'px'; big.style.color = `var(--${color})`;
      node.append(big);
      if (tile.display === 'chart' && h >= 100) node.append(chartSvg(color));
      if (tile.display === 'bar') { const bar = el('div', { className: 'bar' }, el('i')); bar.firstChild.style.cssText = `width:${w.value === null ? 0 : Math.min(100, w.value / w.max * 100)}%;background:var(--${color})`; node.append(bar); }
    }
    if (interactive) {
      node.title = T('tileTitle');
      node.onpointerdown = e => startGesture(e, tile, 'move');
      const grip = el('div', { className: 'grip-corner', title: T('resizeTitle') });
      grip.onpointerdown = e => startGesture(e, tile, 'resize');
      node.append(grip);
    }
    return node;
  }

  // ---------- Board ----------
  // Grid cell size on screen, from the board's real (scaled) size.
  function cell() {
    const r = $('board').getBoundingClientRect(), gap = G.GAP * phoneScale;
    return { left: r.left, top: r.top, w: (r.width + gap) / G.COLS, h: (G.UNIT + G.GAP) * phoneScale };
  }

  function startGesture(e, tile, kind) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const c = cell(), start = { x: e.clientX, y: e.clientY };
    const before = clone(layout());
    const grab = { dx: (e.clientX - c.left) / c.w - tile.x, dy: (e.clientY - c.top) / c.h - tile.y };
    gesture = { moved: false };
    document.body.classList.add(kind === 'move' ? 'moving' : 'resizing');
    const move = ev => {
      if (!gesture.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      gesture.moved = true;
      const next = kind === 'move'
        ? { ...tile, x: Math.round((ev.clientX - c.left) / c.w - grab.dx), y: Math.round((ev.clientY - c.top) / c.h - grab.dy) }
        : { ...tile, w: G.snapWidth((ev.clientX - c.left) / c.w - tile.x), h: Math.round((ev.clientY - c.top) / c.h - tile.y) };
      // Live preview: the magnet pushes and pulls the other tiles and snaps to the nearest
      // spot the phone can draw, so what you see when you let go is always valid.
      const placed = G.placeNearest(before, next, kind, portraitOpts());
      if (placed) { setLayout(placed); selected = tile.id; renderStage(); }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('moving', 'resizing');
      const moved = gesture.moved; gesture = null;
      if (!moved) { selected = tile.id; render(); return; }
      const result = clone(layout());
      setLayout(before);
      if (!tryLayout(result)) render();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  function renderBoard() {
    const board = $('board'); board.replaceChildren();
    const tiles = layout();
    const rows = Math.max(G.bottom(tiles), G.FIT[orientation]);
    board.style.gridTemplateRows = `repeat(${rows}, ${G.UNIT}px)`;
    board.style.setProperty('--fit', `${G.points(G.FIT[orientation]) + G.GAP / 2}px`);
    if (editable()) {
      board.className = 'board grid';
      for (const t of tiles) {
        const node = tileNode(t, true);
        node.style.gridColumn = `${t.x + 1} / span ${t.w}`; node.style.gridRow = `${t.y + 1} / span ${t.h}`;
        board.append(node);
      }
    } else {
      // Portrait reusing the landscape layout: show how the phone reflows it.
      board.className = 'board flow';
      const cut = G.decompose(page().tiles);
      for (const band of cut.ok ? cut.bands : []) {
        const b = el('div', { className: 'band' });
        for (const g of band.groups) {
          const grp = el('div', { className: 'group' }); grp.style.gridTemplateColumns = `repeat(${Math.min(2, g.columns.length)}, 1fr)`;
          for (const col of g.columns) {
            const c = el('div', { className: 'column' });
            for (const item of col.items) {
              const it = el('div', { className: 'item' }); it.style.height = G.points(item.h) + 'px';
              it.style.gridTemplateColumns = `repeat(${item.tiles?.length || 1}, 1fr)`;
              for (const t of item.tiles || []) it.append(tileNode(t, false));
              c.append(it);
            }
            grp.append(c);
          }
          b.append(grp);
        }
        board.append(b);
      }
    }
  }

  function fitPhone() {
    const wrap = document.querySelector('.phone-wrap'), phone = $('phone');
    phone.style.transform = '';
    const scale = Math.min(1, wrap.clientWidth / phone.offsetWidth);
    phone.style.transform = scale < 1 ? `scale(${scale})` : ''; phoneScale = scale;
    wrap.style.height = Math.ceil(phone.offsetHeight * scale) + 'px';
  }
  new ResizeObserver(() => fitPhone()).observe(document.querySelector('.stage'));

  function renderStage() {
    const p = page();
    if (document.activeElement !== $('pageName')) $('pageName').value = p.name;
    $('pageEnabled').checked = p.enabled !== false;
    $('pageLeft').disabled = pageIndex === 0; $('pageRight').disabled = pageIndex === pages.length - 1; $('pageDelete').disabled = pages.length === 1;
    $('phone').className = 'phone ' + orientation;
    $('portraitBar').hidden = orientation !== 'portrait';
    $('portraitOwn').checked = !!p.portrait;
    $('portraitNote').textContent = T(p.portrait ? 'portraitOwn' : 'portraitAuto');
    renderBoard();
    const units = G.bottom(layout()), max = G.FIT[orientation];
    const fit = $('fit');
    fit.textContent = units > max ? T('overflow', { pt: G.points(units) - G.points(max), orientation: T(orientation).toLowerCase() }) : T('fitUnits', { units, max });
    fit.className = units > max ? 'fit warn' : 'fit';
    $('addTile').disabled = !editable() || layout().length >= server.limits.tiles;
    fitPhone();
  }

  // ---------- Inspector ----------
  function choices(options, current, onPick, labels, disabled = () => false) {
    return el('div', { className: 'choices' }, ...options.map(o => el('button', { textContent: labels[o], className: o === current ? 'on' : '', disabled: disabled(o), onclick: () => onPick(o) })));
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

  const WIDTH_LABELS = { 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 9: '¾', 12: '1' };
  function renderInspector() {
    const box = $('inspector'); box.replaceChildren();
    const tile = selected && editable() ? tileById(selected) : null;
    if (!tile) {
      box.append($('hint').content.cloneNode(true));
      box.append(el('p', { className: 'note', textContent: T('intervalNote', { s: server.interval }) }));
      return;
    }
    const update = patch => { const placed = G.placeNearest(layout(), { ...tile, ...patch }, 'resize', portraitOpts()); if (placed) tryLayout(placed); else status(T('refused', { reason: server.errors.cut }), 'error'); };
    const select = el('select', {}, ...server.widgets.map(w => el('option', { value: w.id, textContent: w.name + (w.available ? '' : T('unavailableSuffix')), selected: w.id === tile.metric })));
    select.onchange = () => { tile.metric = select.value; markDirty(); };
    box.append(el('h2', { textContent: T('tile') }),
      field(T('metric'), select),
      field(T('display'), choices(server.displays, tile.display, d => { tile.display = d; markDirty(); }, DISPLAY())),
      field(T('width'), choices(G.WIDTHS, tile.w, w => update({ w }), WIDTH_LABELS)),
      field(T('tileHeight'), choices([1, 2, 3, 4, 5, 6], tile.h, h => update({ h }), { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' })),
      field(T('color'), swatches(tile.color, c => { tile.color = c; markDirty(); })),
      el('div', { className: 'actions' },
        el('button', { textContent: T('duplicate'), disabled: layout().length >= server.limits.tiles, onclick: () => addTile({ ...clone(tile) }) }),
        el('button', { textContent: T('delete'), className: 'danger', disabled: layout().length === 1, onclick: () => removeTile(tile) })),
      ...metricPanel(tile.metric));
  }

  // ---------- Mutations ----------
  function addTile(base = { metric: 'cpu', display: 'value', color: 'auto', w: 3, h: 1 }) {
    const spot = G.freeSpot(layout(), base.w, base.h);
    const tile = { ...base, id: uid('t'), ...spot };
    if (tryLayout(G.compact([...layout(), tile]))) { selected = tile.id; render(); }
  }
  function removeTile(tile) {
    if (layout().length === 1) return;
    if (tryLayout(G.compact(layout().filter(t => t.id !== tile.id)))) { selected = null; render(); }
  }

  function render() { if (!server) return; applyTexts(); $('language').value = server.language; renderTabs(); renderStage(); renderInspector(); }

  function load(state, keepEdits, live = false) {
    const first = !server;
    server = state;
    // Live polling refreshes values only, and never during a drag.
    if (live && !first && gesture) return;
    if (live && !first && server.lang !== appliedLang) { render(); return; }
    if (live && !first) { if (!keepEdits && JSON.stringify(state.pages) !== JSON.stringify(pages)) { pages = clone(state.pages); pageIndex = Math.min(pageIndex, pages.length - 1); renderTabs(); } renderStage(); return; }
    if (!keepEdits) { pages = clone(state.pages); widgets = clone(state.widgets.map(({ id, visible, size, color, warning, critical }) => ({ id, visible, size, color, warning, critical }))); dirty = false; $('save').disabled = true; $('revert').disabled = true; }
    pageIndex = Math.min(pageIndex, pages.length - 1);
    render();
  }

  // ---------- Wiring ----------
  $('addPage').onclick = () => {
    pages.push({ id: uid('p'), enabled: true, portrait: null, name: T('newPage', { n: pages.length + 1 }), tiles: [{ id: uid('t'), metric: 'fps', display: 'value', color: 'auto', x: 0, y: 0, w: 6, h: 2 }] });
    pageIndex = pages.length - 1; selected = null; markDirty();
  };
  $('addTile').onclick = () => addTile();
  $('pageName').oninput = e => { page().name = e.target.value.slice(0, 24); dirty = true; $('save').disabled = false; $('revert').disabled = false; status(T('dirty'), 'dirty'); renderTabs(); };
  $('pageLeft').onclick = () => { pages.splice(pageIndex - 1, 0, pages.splice(pageIndex, 1)[0]); pageIndex--; markDirty(); };
  $('pageRight').onclick = () => { pages.splice(pageIndex + 1, 0, pages.splice(pageIndex, 1)[0]); pageIndex++; markDirty(); };
  $('pageDelete').onclick = () => { if (confirm(T('deletePageConfirm', { name: page().name }))) { pages.splice(pageIndex, 1); pageIndex = Math.max(0, pageIndex - 1); selected = null; markDirty(); } };
  $('pageEnabled').onchange = e => {
    if (!e.target.checked && pages.filter(p => p.enabled !== false).length === 1) { e.target.checked = true; status(T('lastPage'), 'error'); return; }
    page().enabled = e.target.checked; markDirty();
  };
  $('portraitOwn').onchange = e => {
    if (e.target.checked) {
      // Start the portrait layout from a column of full-width tiles, in reading order.
      let y = 0;
      page().portrait = [...page().tiles].sort((a, b) => a.y - b.y || a.x - b.x).map(t => { const tile = { ...t, id: uid('t'), x: 0, w: 12, y }; y += t.h; return tile; });
    } else page().portrait = null;
    selected = null; markDirty();
  };
  $('orientation').onclick = e => { const o = e.target.dataset.o; if (!o) return; orientation = o; selected = null; [...$('orientation').children].forEach(b => b.classList.toggle('on', b.dataset.o === o)); render(); };
  $('revert').onclick = () => { selected = null; load(server, false); status(T('discarded')); };
  $('save').onclick = async () => {
    $('save').disabled = true; status(T('sending'));
    try { load(await api('PUT', '/api/layout', { pages, widgets }), false); status(T('sent')); }
    catch (e) { $('save').disabled = false; status(e.message, 'error'); }
  };
  $('language').onchange = async e => {
    try { const state = await api('PUT', '/api/language', { language: e.target.value }); appliedLang = ''; load(state, dirty); status(T(dirty ? 'dirty' : 'connected'), dirty ? 'dirty' : ''); }
    catch (err) { status(err.message, 'error'); }
  };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (!$('save').disabled) $('save').click(); return; }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'Escape') { selected = null; render(); return; }
    const tile = selected && editable() ? tileById(selected) : null;
    if (!tile) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeTile(tile); return; }
    // Arrows move the selected tile one cell; with Shift they resize it.
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = e.shiftKey
      ? { ...tile, w: G.WIDTHS[Math.max(0, Math.min(G.WIDTHS.length - 1, G.WIDTHS.indexOf(tile.w) + step[0]))], h: tile.h + step[1] }
      : { ...tile, x: tile.x + step[0], y: tile.y + step[1] };
    const placed = G.placeNearest(layout(), next, e.shiftKey ? 'resize' : 'move', portraitOpts());
    if (placed) tryLayout(placed); else status(T('refused', { reason: server.errors.cut }), 'error');
  });

  async function poll() {
    try { load(await api('GET', '/api/state'), dirty, true); if (!dirty && !$('status').textContent) status(T('connected')); }
    catch (e) { status(e.message, 'error'); }
    setTimeout(poll, 1500);
  }
  if (!token) status('Open the editor from Vitals (island or phone).', 'error'); else poll();
})();
