'use strict';

const { t, say, VitalsError } = require('./i18n.cjs');

const definitions = [
  { id: 'cpu', symbol: 'cpu', unit: '%', max: 100, warning: 75, critical: 90, color: 'mint', size: 'large' },
  { id: 'memory', symbol: 'memorychip', unit: '%', max: 100, warning: 80, critical: 95, color: 'cyan' },
  { id: 'disk', symbol: 'internaldrive', unit: '%', max: 100, warning: 80, critical: 95, color: 'indigo' },
  { id: 'gpu', symbol: 'display', unit: '%', max: 100, warning: 85, critical: 95, color: 'purple' },
  { id: 'cpuTemp', symbol: 'thermometer', unit: '°C', max: 120, warning: 80, critical: 95, color: 'orange' },
  { id: 'gpuTemp', symbol: 'thermometer', unit: '°C', max: 120, warning: 80, critical: 90, color: 'pink' },
  { id: 'fps', symbol: 'gamecontroller', unit: 'FPS', max: 360, warning: 50, critical: 30, low: true, color: 'green' },
  { id: 'load', symbol: 'chart.bar', unit: '%', max: 200, warning: 100, critical: 150, color: 'teal', visible: process.platform !== 'win32' }
];
const colors = ['mint', 'cyan', 'teal', 'blue', 'indigo', 'purple', 'pink', 'green', 'orange', 'yellow', 'white'];
const defaultWidgets = () => definitions.map(d => ({ id: d.id, visible: d.visible !== false, size: d.size || 'medium', color: d.color, warning: d.warning, critical: d.critical }));
// The layout module needs `definitions`, so it is loaded lazily to avoid a require cycle.
const layout = () => require('./layout.cjs');
const defaults = () => ({ version: 2, language: 'auto', interval: 2, notifications: false, fpsEnabled: false,
  islandEnabled: true, islandDisplay: 'system', widgets: defaultWidgets(), pages: layout().defaultPages() });

function validateWidget(value) {
  const d = definitions.find(d => d.id === value?.id);
  if (!d || typeof value.visible !== 'boolean' || !['small', 'medium', 'large'].includes(value.size) || !colors.includes(value.color)) throw new VitalsError('err.widget');
  const { warning, critical } = value;
  if (![warning, critical].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= d.max) || (d.low ? critical >= warning : critical <= warning)) {
    throw new VitalsError(d.low ? 'err.criticalLow' : 'err.criticalHigh');
  }
  return { id: d.id, visible: value.visible, size: value.size, color: value.color, warning, critical };
}

function restore(raw) {
  const config = defaults();
  if (!raw || typeof raw !== 'object') return config;
  if ([1, 2, 5].includes(raw.interval)) config.interval = raw.interval;
  if (typeof raw.notifications === 'boolean') config.notifications = raw.notifications;
  if (typeof raw.fpsEnabled === 'boolean') config.fpsEnabled = raw.fpsEnabled;
  if (typeof raw.islandEnabled === 'boolean') config.islandEnabled = raw.islandEnabled;
  if (['system', 'fps'].includes(raw.islandDisplay)) config.islandDisplay = raw.islandDisplay;
  if (raw.language === 'auto' || require('./i18n.cjs').LANGS.includes(raw.language)) config.language = raw.language;
  if (Array.isArray(raw.widgets)) {
    const found = new Map();
    for (const w of raw.widgets) { try { if (!found.has(w.id)) found.set(w.id, validateWidget(w)); } catch {} }
    config.widgets = [...found.values(), ...config.widgets.filter(w => !found.has(w.id))];
  }
  if (raw.pages !== undefined) { try { config.pages = layout().validatePages(raw.pages); } catch {} }
  else if (Array.isArray(raw.widgets)) config.pages = layout().fromWidgets(config.widgets);
  return config;
}

function severity(value, widget, definition) {
  if (value === null) return 'unavailable';
  if (definition.low ? value <= widget.critical : value >= widget.critical) return 'critical';
  if (definition.low ? value <= widget.warning : value >= widget.warning) return 'warning';
  return 'normal';
}

function view(config, readings, histories) {
  return config.widgets.map(w => {
    const d = definitions.find(d => d.id === w.id);
    const r = readings[w.id] || { value: null, detail: { key: 'det.unavailable' }, source: '' };
    const value = Number.isFinite(r.value) ? r.value : null;
    const status = severity(value, w, d);
    return { ...d, ...w, name: t(`metric.${d.id}`), value, available: value !== null, display: value === null ? '—' : `${Math.round(value)} ${d.unit}`, detail: say(r.detail), source: say(r.source),
      status, statusLabel: t(`status.${status}`),
      tint: status === 'critical' ? 'red' : status === 'warning' ? 'orange' : w.color,
      height: { small: 128, medium: 238, large: 310 }[w.size],
      history: histories[w.id] || [], low: !!d.low,
      thresholdText: t(d.low ? 'threshold.low' : 'threshold.high', { warning: w.warning, critical: w.critical, unit: d.unit })
    };
  });
}

function rows(widgets) {
  const result = [];
  for (const w of widgets.filter(w => w.visible)) {
    const last = result.at(-1);
    if (w.size !== 'large' && last && last.items.length === 1 && last.items[0].size === w.size) last.items.push(w);
    else result.push({ id: w.id, compact: w.size === 'small', items: [w] });
  }
  return result;
}

module.exports = { definitions, colors, defaults, validateWidget, restore, severity, view, rows };
