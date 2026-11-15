'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const model = require('./lib/model.cjs');
const layout = require('./lib/layout.cjs');
const i18n = require('./lib/i18n.cjs');
const { t, msg, VitalsError } = i18n;
const { createEditorServer } = require('./lib/editor-server.cjs');
const { cpuSnapshot, cpuUsage, createSensors } = require('./lib/sensors.cjs');
const { createFps } = require('./lib/fps.cjs');

function activate(ctx) {
  const configPath = path.join(ctx.dataDir, 'settings.json');
  const locales = i18n.systemLocales(ctx.electron);
  const applyLanguage = preference => i18n.setLanguage(i18n.resolve(preference, locales));
  let raw, configError = '';
  try { raw = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') configError = 'err.settingsUnreadable'; }
  // The language must be known before defaults are built, since default page names are translated.
  applyLanguage(raw?.language);
  let config = model.restore(raw);
  const sensors = createSensors(ctx.dataDir);
  const fps = ctx.fps || createFps();
  let lastViewed = 0, lastIslandViewed = 0, enablePending = null, fpsSetupMessage = null;
  let previous = cpuSnapshot(), readings = {}, slowReadings = {}, slowTime = 0;
  let histories = {}, cache, revision = 0, timer, slowTimer, closed = false, sampling = false, slowBusy = false;
  let started = false, refreshing = true, error = '', telemetryError = '', fpsError = '', fpsDetail = null, sampledAt = 0;
  const alarmStates = new Map(), notifiedAt = new Map();
  let editorWindow, editorUrl = '';
  const editor = createEditorServer({
    state: () => ({ revision: cache.revision, interval: config.interval, pages: config.pages.map(p => ({ ...p, name: i18n.pageName(p.name) })), widgets: cache.widgets.map(({ history, ...w }) => w),
      colors: model.colors, displays: layout.displays, limits: layout.LIMITS,
      errors: { overlap: t('err.overlap'), cut: t('err.cut'), portraitWidths: t('err.portraitWidths') },
      language: config.language, lang: i18n.language(), languages: i18n.languageOptions(), t: i18n.table('ed'), colorNames: i18n.table('color') }),
    language(value) { setLanguage(value); save(config); },
    save(value) {
      if (!value || typeof value !== 'object') throw new VitalsError('err.layout');
      const pages = layout.validatePages(value.pages);
      const widgets = Array.isArray(value.widgets) ? config.widgets.map(w => { const next = value.widgets.find(n => n?.id === w.id); return next ? model.validateWidget({ ...w, ...next, id: w.id }) : w; }) : config.widgets;
      save({ ...config, version: 2, pages, widgets });
    }
  });

  async function openEditor() {
    editorUrl = await editor.start();
    const electron = ctx.electron;
    if (electron?.BrowserWindow) {
      if (editorWindow && !editorWindow.isDestroyed()) { editorWindow.show(); editorWindow.focus(); return; }
      editorWindow = new electron.BrowserWindow({ width: 1280, height: 820, minWidth: 960, minHeight: 640, title: t('ed.title'), backgroundColor: '#0C1118', autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
      // Links leave the editor for the real browser; the editor itself never navigates away.
      editorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      editorWindow.webContents.on('will-navigate', e => e.preventDefault());
      await editorWindow.loadURL(editorUrl);
    } else if (electron?.shell?.openExternal) await electron.shell.openExternal(editorUrl);
    else throw new VitalsError('err.openBrowser', { url: editorUrl });
  }

  function rebuild() {
    // A metric is shown (and may alert) when at least one tile of a page displays it.
    const onPage = new Set(config.pages.flatMap(p => [...p.tiles, ...(p.portrait || [])].map(t => t.metric)));
    const widgets = model.view(config, readings, histories).map(w => ({ ...w, visible: onPage.has(w.id),
      hint: w.id === 'fps' && !w.available && fps.available && (!config.fpsEnabled || !fps.installed()) ? t('det.fpsEnable') : '' }));
    const alerts = widgets.filter(w => w.visible && ['warning', 'critical'].includes(w.status));
    cache = {
      revision: ++revision, loading: !started, refreshing, error: [configError && t(configError), i18n.say(error), i18n.say(telemetryError), i18n.say(fpsError)].filter(Boolean).join(' '),
      fpsStatus: i18n.say(fpsDetail),
      fpsEnabled: config.fpsEnabled, fpsSetupMessage: i18n.say(fpsSetupMessage),
      host: os.hostname(), system: t('sys.cores', { os: { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || os.type(), cores: os.cpus().length }),
      cpuModel: os.cpus()[0]?.model || t('metric.cpu'), uptime: Math.floor(os.uptime()), sampledAt,
      interval: config.interval, notifications: config.notifications, islandEnabled: config.islandEnabled, islandDisplay: config.islandDisplay, widgets, alerts,
      pages: layout.view(config.pages, widgets), pageCount: config.pages.length,
      pageList: config.pages.map(p => ({ id: p.id, name: i18n.pageName(p.name), enabled: p.enabled !== false })), editorUrl,
      visibleCount: widgets.filter(w => w.visible).length,
      status: alerts.length === 1 ? t('sys.alertsOne') : alerts.length ? t('sys.alertsMany', { count: alerts.length }) : t('sys.ok'),
      statusTint: alerts.some(w => w.status === 'critical') ? 'red' : alerts.length ? 'orange' : 'mint',
      availableCount: widgets.filter(w => w.available).length,
      historyLabel: t('sys.history'), intervalText: t('ui.everySeconds', { s: config.interval }), availableText: t('sys.available', { count: widgets.filter(w => w.available).length, total: widgets.length }),
      t: i18n.table('ui'), colorNames: i18n.table('color'), language: config.language, languages: i18n.languageOptions(),
      telemetryConnected: Object.values(readings).some(r => r.source?.key === 'src.telemetry')
    };
    if (!closed) for (const w of widgets) {
      const prior = alarmStates.get(w.id);
      if (config.notifications && config.islandEnabled && w.visible && w.status === 'critical' && prior !== 'critical' && Date.now() - (notifiedAt.get(w.id) || 0) > 60000) {
        try { ctx.notifications?.post({ id: `vitals-${w.id}`, title: t('sys.criticalTitle', { name: w.name }), body: `${w.display} · ${w.thresholdText}` }); notifiedAt.set(w.id, Date.now()); } catch {}
      }
      alarmStates.set(w.id, w.status);
    }
  }

  async function sample() {
    if (closed || sampling) return;
    sampling = true;
    try {
      const current = cpuSnapshot();
      const cpu = cpuUsage(previous, current); previous = current;
      const [memory, external] = await Promise.all([sensors.memory(), sensors.external()]);
      if (closed) return;
      // Explicit telemetry wins. An FPS island also works without opening the phone dashboard.
      const phoneActive = Date.now() - lastViewed < 10000;
      const pageNeedsFps = phoneActive && config.pages.some(p => p.enabled !== false && [...p.tiles, ...(p.portrait || [])].some(tile => tile.metric === 'fps'));
      const islandNeedsFps = config.islandEnabled && config.islandDisplay === 'fps' && Date.now() - lastIslandViewed < 10000;
      const automatic = fps.sample(config.fpsEnabled && (pageNeedsFps || islandNeedsFps) && !external.readings.fps);
      fpsError = external.readings.fps ? '' : automatic.error;
      fpsDetail = external.readings.fps ? external.readings.fps.detail : (!config.fpsEnabled && fps.available ? msg('det.fpsEnable') : automatic.detail);
      const now = Date.now();
      const old = now - slowTime > 15000;
      readings = { ...(old ? {} : slowReadings), ...automatic.readings, ...external.readings,
        cpu: { value: cpu, source: msg('src.system'), detail: msg('det.cpu', { cores: os.cpus().length }) }, memory };
      if (process.platform !== 'win32') readings.load = { value: os.loadavg()[0] / Math.max(1, os.cpus().length) * 100, source: msg('src.system'), detail: msg('det.load') };
      for (const d of model.definitions) {
        if (!readings[d.id]) readings[d.id] = { value: null, source: '', detail: d.id === 'fps' && fpsDetail ? fpsDetail : msg(d.id === 'fps' ? 'det.fpsMissing' : d.id === 'load' ? 'det.loadWindows' : 'det.missing') };
        const history = (histories[d.id] || []).filter(p => p.x >= now / 1000 - 60);
        // Split on missing readings rather than drawing a line across a sensor outage.
        histories[d.id] = Number.isFinite(readings[d.id].value) ? [...history, { x: now / 1000, y: readings[d.id].value }].slice(-120) : [];
      }
      telemetryError = external.error; sampledAt = now; started = true;
    } catch { error = msg('err.sampleFailed'); readings = {}; histories = {}; }
    finally { sampling = false; if (!closed) { rebuild(); timer = setTimeout(sample, config.interval * 1000); timer.unref?.(); } }
  }

  async function slowSample() {
    if (closed || slowBusy) return;
    slowBusy = true; refreshing = true;
    try {
      const result = await sensors.slow();
      if (closed) return;
      slowReadings = result.readings; slowTime = Date.now(); error = result.error;
    } catch { if (!closed) error = msg('err.hardware'); }
    finally { slowBusy = false; refreshing = false; if (!closed) { rebuild(); slowTimer = setTimeout(slowSample, 5000); slowTimer.unref?.(); } }
  }

  function save(next) {
    try {
      fs.mkdirSync(ctx.dataDir, { recursive: true });
      fs.writeFileSync(configPath + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
      fs.renameSync(configPath + '.tmp', configPath);
    } catch { throw new VitalsError('err.save'); }
    config = next; configError = ''; rebuild();
  }

  function setLanguage(value) {
    if (value !== 'auto' && !i18n.LANGS.includes(value)) throw new VitalsError('err.language');
    config = { ...config, language: value };
    applyLanguage(value);
  }

  function setIslandOption(action, value) {
    if (typeof value !== 'boolean') throw new VitalsError('err.setting');
    const next = action === 'islandEnabled' ? { ...config, islandEnabled: value }
      : action === 'islandFps' ? { ...config, islandDisplay: value ? 'fps' : 'system' }
      : { ...config, notifications: value };
    // Notices belong to Vitals only. Turning them off must also dismiss earlier threshold notices.
    if (!next.notifications || !next.islandEnabled) {
      for (const definition of model.definitions) { try { ctx.notifications?.clear?.(`vitals-${definition.id}`); } catch {} }
    }
    save(next);
    if ((!next.islandEnabled || next.islandDisplay !== 'fps') && Date.now() - lastViewed >= 10000) fps.sample(false);
    clearTimeout(timer); if (!sampling) void sample();
    return { saved: true };
  }

  function enableFps() {
    if (!fps.available || closed) throw new VitalsError('err.setting');
    if (enablePending) return enablePending;
    fpsSetupMessage = msg('pc.fpsInstalling'); rebuild();
    enablePending = (async () => {
      try {
        const result = await fps.install();
        if (closed) return { enabled: false };
        if (result.installed) {
          fpsSetupMessage = msg('pc.fpsEnabled');
          save({ ...config, fpsEnabled: true }); fps.reset();
          clearTimeout(timer); if (!sampling) void sample();
          return { enabled: true };
        }
        fpsSetupMessage = msg(result.cancelled ? 'pc.fpsCancelled' : 'pc.fpsFailed'); rebuild();
        return { enabled: false, cancelled: !!result.cancelled };
      } catch {
        fpsSetupMessage = msg('pc.fpsFailed'); rebuild(); return { enabled: false };
      }
    })();
    enablePending.then(() => { enablePending = null; });
    return enablePending;
  }

  function disableFps() {
    if (!fps.available) throw new VitalsError('err.setting');
    fps.sample(false);
    if (readings.fps?.source?.key !== 'src.telemetry') { delete readings.fps; delete histories.fps; }
    fpsSetupMessage = null; fpsError = ''; fpsDetail = msg('det.fpsEnable');
    save({ ...config, fpsEnabled: false });
    return { enabled: false };
  }

  rebuild();
  timer = setTimeout(sample, 250); timer.unref?.();
  void slowSample();
  return {
    data() { lastViewed = Date.now(); return cache; },
    command(action, value) {
      if (closed) throw new VitalsError('err.closed');
      if (action === 'saveWidget') {
        const widget = model.validateWidget(value);
        save({ ...config, widgets: config.widgets.map(w => w.id === widget.id ? widget : w) });
      } else if (action === 'move') {
        if (!value || ![-1, 1].includes(value.direction)) throw new VitalsError('err.move');
        const widgets = [...config.widgets], index = widgets.findIndex(w => w.id === value.id);
        if (index < 0) throw new VitalsError('err.widgetMissing');
        const target = index + value.direction;
        if (target >= 0 && target < widgets.length) { [widgets[index], widgets[target]] = [widgets[target], widgets[index]]; save({ ...config, widgets }); }
      } else if (action === 'interval') {
        if (![1, 2, 5].includes(value)) throw new VitalsError('err.interval');
        save({ ...config, interval: value });
        clearTimeout(timer); if (!sampling) void sample();
      } else if (action === 'notifications') {
        if (typeof value !== 'boolean') throw new VitalsError('err.notifications');
        return setIslandOption(action, value);
      } else if (action === 'language') {
        setLanguage(value);
        save(config);
      } else if (action === 'togglePage' || action === 'pageEnabled') {
        // togglePage: the phone sends a page id. pageEnabled: {id, enabled} for an explicit state.
        const id = action === 'togglePage' ? value : value?.id;
        const page = config.pages.find(p => p.id === id);
        const enabled = action === 'togglePage' ? page?.enabled === false : value?.enabled;
        if (!page || typeof enabled !== 'boolean') throw new VitalsError('err.setting');
        const pages = config.pages.map(p => (p.id === id ? { ...p, enabled } : p));
        if (!pages.some(p => p.enabled !== false)) throw new VitalsError('err.lastPage');
        save({ ...config, pages });
      } else if (action === 'openEditor') {
        openEditor().catch(e => { ctx.log?.warn?.('Page editor:', e.message); });
        return { opened: true };
      } else if (action === 'refresh') {
        fps.reset?.();
        clearTimeout(slowTimer); if (!slowBusy) void slowSample();
        clearTimeout(timer); if (!sampling) void sample();
      } else throw new VitalsError('err.unknown');
      return { saved: true };
    },
    island() {
      if (!config.islandEnabled) return null;
      if (config.islandDisplay === 'fps') lastIslandViewed = Date.now();
      const cpu = cache.widgets.find(w => w.id === 'cpu');
      const memory = cache.widgets.find(w => w.id === 'memory'), frameRate = cache.widgets.find(w => w.id === 'fps');
      const percentage = widget => widget.available ? `${Math.round(widget.value)}%` : '—';
      const fpsText = frameRate.available ? frameRate.display : 'FPS —';
      const compact = config.islandDisplay === 'fps' ? fpsText : `CPU${percentage(cpu)} RAM${percentage(memory)}`;
      const expanded = config.islandDisplay === 'fps' ? fpsText : `CPU ${cpu.display} · RAM ${memory.display}`;
      const showAlerts = config.notifications && cache.alerts.length > 0;
      const note = showAlerts ? cache.status : config.islandDisplay === 'fps' && !frameRate.available ? frameRate.hint || frameRate.detail : '';
      return { priority: showAlerts ? 12 : 1,
        compact: { title: compact, accent: showAlerts ? '#FF9F0A' : '#63E6BE' },
        expanded: { title: 'Vitals', subtitle: expanded, footer: { label: t('island.openEditor'), action: 'openEditor', note } } };
    },
    settings: {
      describe() { return { status: { label: cache.status, tone: cache.alerts.length ? 'warning' : 'success' }, items: [
        { type: 'button', label: t('island.openEditor'), action: 'openEditor', primary: true },
        { type: 'text', text: t('pc.intro') },
        { type: 'toggle', label: t('pc.showIsland'), detail: t('pc.islandScope'), value: config.islandEnabled, action: 'islandEnabled' },
        { type: 'toggle', label: t('pc.islandFps'), detail: t('pc.islandFpsDetail'), value: config.islandDisplay === 'fps', action: 'islandFps' },
        { type: 'toggle', label: t('pc.alerts'), detail: t('pc.islandAlertsDetail'), value: config.notifications, action: 'notifications' },
        ...(editorUrl ? [{ type: 'text', text: t('pc.editorAt', { url: editorUrl.split('#')[0] }) }] : []),
        { type: 'note', text: t('pc.sources') },
        ...(fps.available ? [
          { type: 'note', text: t('pc.fpsAuto') },
          { type: 'button', label: t(config.fpsEnabled && fps.installed() ? 'pc.disableFps' : 'pc.enableFps'), action: config.fpsEnabled && fps.installed() ? 'disableFps' : 'enableFps' },
          { type: 'note', text: t('pc.fpsConsent') },
          ...(cache.fpsSetupMessage ? [{ type: 'text', text: cache.fpsSetupMessage }] : []),
          ...(cache.fpsStatus ? [{ type: 'text', text: cache.fpsStatus }] : [])
        ] : []),
        { type: 'text', text: t('pc.telemetryFile', { path: path.join(ctx.dataDir, 'telemetry.json') }) },
        { type: 'note', text: t('pc.telemetryFormat') }
      ] }; },
      action(action, values) {
        // Installation is desktop-settings-only; a phone command cannot trigger a UAC prompt.
        if (action === 'enableFps') return enableFps();
        if (action === 'disableFps') return disableFps();
        if (action === 'openEditor') { openEditor().catch(e => ctx.log?.warn?.('Page editor:', e.message)); return { opened: true }; }
        if (!['notifications', 'islandEnabled', 'islandFps'].includes(action)) throw new VitalsError('err.setting');
        return setIslandOption(action, values?.on);
      }
    },
    close() { closed = true; try { if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close(); } catch {} editor.close(); clearTimeout(timer); clearTimeout(slowTimer); sensors.close(); fps.close(); }
  };
}

module.exports = { activate };
