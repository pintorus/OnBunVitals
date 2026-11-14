'use strict';

const definitions = [
  { id: 'cpu', name: 'Processeur', symbol: 'cpu', unit: '%', max: 100, warning: 75, critical: 90, color: 'mint', size: 'large' },
  { id: 'memory', name: 'Mémoire', symbol: 'memorychip', unit: '%', max: 100, warning: 80, critical: 95, color: 'cyan' },
  { id: 'disk', name: 'Disque système', symbol: 'internaldrive', unit: '%', max: 100, warning: 80, critical: 95, color: 'indigo' },
  { id: 'gpu', name: 'Carte graphique', symbol: 'display', unit: '%', max: 100, warning: 85, critical: 95, color: 'purple' },
  { id: 'cpuTemp', name: 'Température CPU', symbol: 'thermometer', unit: '°C', max: 120, warning: 80, critical: 95, color: 'orange' },
  { id: 'gpuTemp', name: 'Température GPU', symbol: 'thermometer', unit: '°C', max: 120, warning: 80, critical: 90, color: 'pink' },
  { id: 'fps', name: 'Images par seconde', symbol: 'gamecontroller', unit: 'FPS', max: 360, warning: 50, critical: 30, low: true, color: 'green' },
  { id: 'load', name: 'Charge système', symbol: 'chart.bar', unit: '%', max: 200, warning: 100, critical: 150, color: 'teal', visible: process.platform !== 'win32' }
];
const colors = ['mint', 'cyan', 'teal', 'blue', 'indigo', 'purple', 'pink', 'green', 'orange', 'yellow', 'white'];
const defaultWidgets = () => definitions.map(d => ({ id: d.id, visible: d.visible !== false, size: d.size || 'medium', color: d.color, warning: d.warning, critical: d.critical }));
// The layout module needs `definitions`, so it is loaded lazily to avoid a require cycle.
const layout = () => require('./layout.cjs');
const defaults = () => ({ version: 2, interval: 2, notifications: false, widgets: defaultWidgets(), pages: layout().defaultPages() });

function validateWidget(value) {
  const d = definitions.find(d => d.id === value?.id);
  if (!d || typeof value.visible !== 'boolean' || !['small', 'medium', 'large'].includes(value.size) || !colors.includes(value.color)) throw new Error('Réglages du widget invalides.');
  const { warning, critical } = value;
  if (![warning, critical].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= d.max) || (d.low ? critical >= warning : critical <= warning)) {
    throw new Error(d.low ? 'Le seuil critique doit être inférieur au seuil de vigilance.' : 'Le seuil critique doit être supérieur au seuil de vigilance.');
  }
  return { id: d.id, visible: value.visible, size: value.size, color: value.color, warning, critical };
}

function restore(raw) {
  const config = defaults();
  if (!raw || typeof raw !== 'object') return config;
  if ([1, 2, 5].includes(raw.interval)) config.interval = raw.interval;
  if (typeof raw.notifications === 'boolean') config.notifications = raw.notifications;
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
    const r = readings[w.id] || { value: null, detail: 'Capteur non disponible.', source: '' };
    const value = Number.isFinite(r.value) ? r.value : null;
    const status = severity(value, w, d);
    return { ...d, ...w, value, available: value !== null, display: value === null ? '—' : `${Math.round(value)} ${d.unit}`, detail: r.detail, source: r.source,
      status, statusLabel: { unavailable: 'Indisponible', normal: 'Normal', warning: 'Vigilance', critical: 'Critique' }[status],
      tint: status === 'critical' ? 'red' : status === 'warning' ? 'orange' : w.color,
      height: { small: 128, medium: 238, large: 310 }[w.size],
      history: histories[w.id] || [], low: !!d.low,
      thresholdText: `${d.low ? 'Sous' : 'Dès'} ${w.warning} ${d.unit} · critique ${w.critical} ${d.unit}`
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
