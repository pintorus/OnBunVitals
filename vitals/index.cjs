'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const model = require('./lib/model.cjs');
const layout = require('./lib/layout.cjs');
const { createEditorServer } = require('./lib/editor-server.cjs');
const { cpuSnapshot, cpuUsage, createSensors } = require('./lib/sensors.cjs');

function activate(ctx) {
  const configPath = path.join(ctx.dataDir, 'settings.json');
  let config = model.defaults(), configError = '';
  try { config = model.restore(JSON.parse(fs.readFileSync(configPath, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') configError = 'Réglages illisibles. Les valeurs par défaut sont actives ; votre fichier sera remplacé au prochain enregistrement.'; }
  const sensors = createSensors(ctx.dataDir);
  let previous = cpuSnapshot(), readings = {}, slowReadings = {}, slowTime = 0;
  let histories = {}, cache, revision = 0, timer, slowTimer, closed = false, sampling = false, slowBusy = false;
  let started = false, refreshing = true, error = '', telemetryError = '', sampledAt = 0;
  const alarmStates = new Map(), notifiedAt = new Map();
  let editorWindow, editorUrl = '';
  const editor = createEditorServer({
    state: () => ({ revision: cache.revision, interval: config.interval, pages: config.pages, widgets: cache.widgets.map(({ history, ...w }) => w),
      colors: model.colors, displays: layout.displays, heights: layout.heights, limits: layout.LIMITS, fit: layout.FIT, spacing: layout.SPACING }),
    save(value) {
      if (!value || typeof value !== 'object') throw new Error('Mise en page invalide.');
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
      editorWindow = new electron.BrowserWindow({ width: 1280, height: 820, minWidth: 960, minHeight: 640, title: 'Vitals · Éditeur de pages', backgroundColor: '#0C1118', autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
      // Links leave the editor for the real browser; the editor itself never navigates away.
      editorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      editorWindow.webContents.on('will-navigate', e => e.preventDefault());
      await editorWindow.loadURL(editorUrl);
    } else if (electron?.shell?.openExternal) await electron.shell.openExternal(editorUrl);
    else throw new Error(`Ouvrez l’éditeur dans votre navigateur : ${editorUrl}`);
  }

  function rebuild() {
    // A metric is shown (and may alert) when at least one tile of a page displays it.
    const onPage = new Set(config.pages.flatMap(p => p.rows.flatMap(r => r.tiles.map(t => t.metric))));
    const widgets = model.view(config, readings, histories).map(w => ({ ...w, visible: onPage.has(w.id) }));
    const alerts = widgets.filter(w => w.visible && ['warning', 'critical'].includes(w.status));
    cache = {
      revision: ++revision, loading: !started, refreshing, error: [configError, error, telemetryError].filter(Boolean).join(' '),
      host: os.hostname(), system: `${{ win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || os.type()} · ${os.cpus().length} cœurs logiques`,
      cpuModel: os.cpus()[0]?.model || 'Processeur', uptime: Math.floor(os.uptime()), sampledAt,
      interval: config.interval, notifications: config.notifications, widgets, alerts,
      pages: layout.view(config.pages, widgets), pageCount: config.pages.length, editorUrl,
      visibleCount: widgets.filter(w => w.visible).length,
      status: alerts.length ? `${alerts.length} seuil${alerts.length > 1 ? 's' : ''} dépassé${alerts.length > 1 ? 's' : ''}` : 'Tout est sous contrôle',
      statusTint: alerts.some(w => w.status === 'critical') ? 'red' : alerts.length ? 'orange' : 'mint',
      availableCount: widgets.filter(w => w.available).length,
      historyLabel: 'Dernière minute · mesures locales',
      telemetryConnected: Object.values(readings).some(r => r.source === 'Télémétrie locale')
    };
    if (!closed) for (const w of widgets) {
      const prior = alarmStates.get(w.id);
      if (config.notifications && w.visible && w.status === 'critical' && prior !== 'critical' && Date.now() - (notifiedAt.get(w.id) || 0) > 60000) {
        try { ctx.notifications?.post({ id: `vitals-${w.id}`, title: `${w.name} : seuil critique`, body: `${w.display} · ${w.thresholdText}` }); notifiedAt.set(w.id, Date.now()); } catch {}
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
      const now = Date.now();
      const old = now - slowTime > 15000;
      readings = { ...(old ? {} : slowReadings), ...external.readings,
        cpu: { value: cpu, source: 'Système', detail: `${os.cpus().length} cœurs logiques · utilisation totale` }, memory };
      if (process.platform !== 'win32') readings.load = { value: os.loadavg()[0] / Math.max(1, os.cpus().length) * 100, source: 'Système', detail: 'Charge moyenne 1 min / cœurs · peut dépasser 100 %.' };
      for (const d of model.definitions) {
        if (!readings[d.id]) readings[d.id] = { value: null, source: '', detail: d.id === 'fps' ? 'Connectez votre outil de capture dans Réglages → Capteurs.' : d.id === 'load' ? 'La charge moyenne Unix n’est pas disponible sur Windows.' : 'Non exposé par ce matériel. Voir Réglages → Capteurs.' };
        const history = (histories[d.id] || []).filter(p => p.x >= now / 1000 - 60);
        // Split on missing readings rather than drawing a line across a sensor outage.
        histories[d.id] = Number.isFinite(readings[d.id].value) ? [...history, { x: now / 1000, y: readings[d.id].value }].slice(-120) : [];
      }
      telemetryError = external.error; sampledAt = now; started = true;
    } catch { error = 'La collecte a échoué. Nouvelle tentative automatique au prochain relevé.'; readings = {}; histories = {}; }
    finally { sampling = false; if (!closed) { rebuild(); timer = setTimeout(sample, config.interval * 1000); timer.unref?.(); } }
  }

  async function slowSample() {
    if (closed || slowBusy) return;
    slowBusy = true; refreshing = true;
    try {
      const result = await sensors.slow();
      if (closed) return;
      slowReadings = result.readings; slowTime = Date.now(); error = result.error;
    } catch { if (!closed) error = 'Les capteurs matériels ne répondent pas. Nouvelle tentative automatique.'; }
    finally { slowBusy = false; refreshing = false; if (!closed) { rebuild(); slowTimer = setTimeout(slowSample, 5000); slowTimer.unref?.(); } }
  }

  function save(next) {
    try {
      fs.mkdirSync(ctx.dataDir, { recursive: true });
      fs.writeFileSync(configPath + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
      fs.renameSync(configPath + '.tmp', configPath);
    } catch { throw new Error('Impossible d’enregistrer les réglages sur cet ordinateur.'); }
    config = next; configError = ''; rebuild();
  }

  rebuild();
  timer = setTimeout(sample, 250); timer.unref?.();
  void slowSample();
  return {
    data() { return cache; },
    command(action, value) {
      if (closed) throw new Error('Vitals est fermé. Rouvrez l’app.');
      if (action === 'saveWidget') {
        const widget = model.validateWidget(value);
        save({ ...config, widgets: config.widgets.map(w => w.id === widget.id ? widget : w) });
      } else if (action === 'move') {
        if (!value || ![-1, 1].includes(value.direction)) throw new Error('Déplacement invalide.');
        const widgets = [...config.widgets], index = widgets.findIndex(w => w.id === value.id);
        if (index < 0) throw new Error('Widget introuvable.');
        const target = index + value.direction;
        if (target >= 0 && target < widgets.length) { [widgets[index], widgets[target]] = [widgets[target], widgets[index]]; save({ ...config, widgets }); }
      } else if (action === 'interval') {
        if (![1, 2, 5].includes(value)) throw new Error('Choisissez une cadence de 1, 2 ou 5 secondes.');
        save({ ...config, interval: value });
        clearTimeout(timer); if (!sampling) void sample();
      } else if (action === 'notifications') {
        if (typeof value !== 'boolean') throw new Error('Choisissez d’activer ou de désactiver les alertes.');
        save({ ...config, notifications: value });
      } else if (action === 'openEditor') {
        openEditor().catch(e => { ctx.log?.error?.('Vitals editor', e); });
        return { opened: true };
      } else if (action === 'refresh') {
        clearTimeout(slowTimer); if (!slowBusy) void slowSample();
        clearTimeout(timer); if (!sampling) void sample();
      } else throw new Error('Commande inconnue.');
      return { saved: true };
    },
    island() {
      const cpu = cache.widgets.find(w => w.id === 'cpu');
      return { priority: cache.alerts.length ? 12 : 1,
        compact: { title: cache.alerts.length ? cache.status : `CPU ${cpu.display}`, accent: cache.alerts.length ? '#FF9F0A' : '#63E6BE' },
        expanded: { title: 'Vitals', subtitle: `${cpu.display} CPU · ${cache.widgets.find(w => w.id === 'memory').display} RAM`, footer: { label: 'Ouvrir l’éditeur de pages', action: 'openEditor', note: cache.status } } };
    },
    settings: {
      describe() { return { status: { label: cache.status, tone: cache.alerts.length ? 'warning' : 'success' }, items: [
        { type: 'text', text: 'Composez vos pages de tuiles dans l’éditeur PC : depuis l’îlot (Vitals → Éditeur) ou le bouton Éditeur du téléphone.' },
        ...(editorUrl ? [{ type: 'text', text: `Éditeur ouvert sur ${editorUrl.split('#')[0]}` }] : []),
        { type: 'note', text: 'CPU et mémoire : système. GPU NVIDIA : nvidia-smi. Windows : Libre Hardware Monitor (WMI). Linux : hwmon CPU et GPU compatibles. Autres GPU et FPS : télémétrie locale.' },
        { type: 'text', text: `Fichier de télémétrie : ${path.join(ctx.dataDir, 'telemetry.json')}` },
        { type: 'note', text: 'JSON : timestamp (millisecondes Unix), fps, gpu (%), cpuTemp et gpuTemp (°C). Écrivez atomiquement toutes les 1 à 5 s ; les valeurs expirent après 10 s.' },
        { type: 'toggle', label: 'Alertes critiques', value: config.notifications, action: 'notifications' }
      ] }; },
      action(action, values) {
        if (action !== 'notifications' || typeof values?.on !== 'boolean') throw new Error('Réglage invalide.');
        save({ ...config, notifications: values.on });
        return { saved: true };
      }
    },
    close() { closed = true; try { if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close(); } catch {} editor.close(); clearTimeout(timer); clearTimeout(slowTimer); sensors.close(); }
  };
}

module.exports = { activate };
