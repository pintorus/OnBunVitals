'use strict';

// Every user-facing string, one line per key with its European translations side by side:
// [fr, en, es, de]. Chinese and Japanese live in ./locales (one key per line, same keys;
// a test checks none is missing). Placeholders use {name}.
// The phone screen gets the `ui.*` part as `$t`, the PC editor the `ed.*` part.

const LANGS = ['fr', 'en', 'es', 'de', 'zh', 'ja'];
const EXTRA = { zh: require('./locales/zh.cjs'), ja: require('./locales/ja.cjs') };
const NAMES = { auto: ['Langue du système', 'System language', 'Idioma del sistema', 'Systemsprache', '系统语言', 'システムの言語'], fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', zh: '简体中文', ja: '日本語' };

const S = {
  // Metrics
  'metric.cpu': ['Processeur', 'Processor', 'Procesador', 'Prozessor'],
  'metric.memory': ['Mémoire', 'Memory', 'Memoria', 'Arbeitsspeicher'],
  'metric.disk': ['Disque système', 'System disk', 'Disco del sistema', 'Systemlaufwerk'],
  'metric.gpu': ['Carte graphique', 'Graphics card', 'Tarjeta gráfica', 'Grafikkarte'],
  'metric.cpuTemp': ['Température CPU', 'CPU temperature', 'Temperatura CPU', 'CPU-Temperatur'],
  'metric.gpuTemp': ['Température GPU', 'GPU temperature', 'Temperatura GPU', 'GPU-Temperatur'],
  'metric.fps': ['Images par seconde', 'Frames per second', 'Imágenes por segundo', 'Bilder pro Sekunde'],
  'metric.load': ['Charge système', 'System load', 'Carga del sistema', 'Systemlast'],
  'status.unavailable': ['Indisponible', 'Unavailable', 'No disponible', 'Nicht verfügbar'],
  'status.normal': ['Normal', 'Normal', 'Normal', 'Normal'],
  'status.warning': ['Vigilance', 'Warning', 'Atención', 'Warnung'],
  'status.critical': ['Critique', 'Critical', 'Crítico', 'Kritisch'],
  'threshold.high': ['Dès {warning} {unit} · critique {critical} {unit}', 'From {warning} {unit} · critical {critical} {unit}', 'Desde {warning} {unit} · crítico {critical} {unit}', 'Ab {warning} {unit} · kritisch {critical} {unit}'],
  'threshold.low': ['Sous {warning} {unit} · critique {critical} {unit}', 'Below {warning} {unit} · critical {critical} {unit}', 'Bajo {warning} {unit} · crítico {critical} {unit}', 'Unter {warning} {unit} · kritisch {critical} {unit}'],

  // Sources and details
  'src.system': ['Système', 'System', 'Sistema', 'System'],
  'src.volume': ['Volume système', 'System volume', 'Volumen del sistema', 'Systemvolume'],
  'src.telemetry': ['Télémétrie locale', 'Local telemetry', 'Telemetría local', 'Lokale Telemetrie'],
  'src.linuxSensors': ['Capteurs Linux', 'Linux sensors', 'Sensores Linux', 'Linux-Sensoren'],
  'src.linuxGpu': ['GPU Linux', 'Linux GPU', 'GPU Linux', 'Linux-GPU'],
  'det.cpu': ['{cores} cœurs logiques · utilisation totale', '{cores} logical cores · total usage', '{cores} núcleos lógicos · uso total', '{cores} logische Kerne · Gesamtauslastung'],
  'det.memory': ['{used} / {total} Gio', '{used} / {total} GiB', '{used} / {total} GiB', '{used} / {total} GiB'],
  'det.memoryCache': ['{used} / {total} Gio · cache inclus', '{used} / {total} GiB · cache included', '{used} / {total} GiB · caché incluida', '{used} / {total} GiB · inkl. Cache'],
  'det.disk': ['{free} Gio disponibles / {total} Gio', '{free} GiB free / {total} GiB', '{free} GiB libres / {total} GiB', '{free} GiB frei / {total} GiB'],
  'det.load': ['Charge moyenne 1 min / cœurs · peut dépasser 100 %.', '1-min load average / cores · can exceed 100%.', 'Carga media 1 min / núcleos · puede superar el 100 %.', '1-Min-Lastmittel / Kerne · kann 100 % übersteigen.'],
  'det.telemetryFps': ['Mesure fournie par votre jeu ou votre outil de capture.', 'Reading provided by your game or capture tool.', 'Medida proporcionada por tu juego o herramienta de captura.', 'Messwert von deinem Spiel oder Aufnahme-Tool.'],
  'det.telemetry': ['Mesure fournie par votre outil de monitoring.', 'Reading provided by your monitoring tool.', 'Medida proporcionada por tu herramienta de monitorización.', 'Messwert von deinem Monitoring-Tool.'],
  'det.cpuTempLinux': ['Température maximale des capteurs CPU.', 'Highest CPU sensor temperature.', 'Temperatura máxima de los sensores de CPU.', 'Höchste CPU-Sensortemperatur.'],
  'det.nvidiaGpu': ['Utilisation du premier GPU NVIDIA.', 'Usage of the first NVIDIA GPU.', 'Uso de la primera GPU NVIDIA.', 'Auslastung der ersten NVIDIA-GPU.'],
  'det.nvidiaTemp': ['Température du premier GPU NVIDIA.', 'Temperature of the first NVIDIA GPU.', 'Temperatura de la primera GPU NVIDIA.', 'Temperatur der ersten NVIDIA-GPU.'],
  'det.linuxGpu': ['Utilisation du premier GPU exposant gpu_busy_percent.', 'Usage of the first GPU exposing gpu_busy_percent.', 'Uso de la primera GPU que expone gpu_busy_percent.', 'Auslastung der ersten GPU mit gpu_busy_percent.'],
  'det.amdTemp': ['Température edge du premier GPU AMD disponible.', 'Edge temperature of the first available AMD GPU.', 'Temperatura edge de la primera GPU AMD disponible.', 'Edge-Temperatur der ersten verfügbaren AMD-GPU.'],
  'det.lhm': ['Capteur matériel local (valeur maximale).', 'Local hardware sensor (highest value).', 'Sensor de hardware local (valor máximo).', 'Lokaler Hardwaresensor (Höchstwert).'],
  'det.fpsMissing': ['Connectez votre outil de capture dans Réglages → Capteurs.', 'Connect your capture tool in Settings → Sensors.', 'Conecta tu herramienta de captura en Ajustes → Sensores.', 'Verbinde dein Aufnahme-Tool unter Einstellungen → Sensoren.'],
  'det.loadWindows': ['La charge moyenne Unix n’est pas disponible sur Windows.', 'The Unix load average is not available on Windows.', 'La carga media Unix no está disponible en Windows.', 'Das Unix-Lastmittel ist unter Windows nicht verfügbar.'],
  'det.missing': ['Non exposé par ce matériel. Voir Réglages → Capteurs.', 'Not exposed by this hardware. See Settings → Sensors.', 'No expuesto por este hardware. Ver Ajustes → Sensores.', 'Von dieser Hardware nicht bereitgestellt. Siehe Einstellungen → Sensoren.'],
  'det.unavailable': ['Capteur non disponible.', 'Sensor unavailable.', 'Sensor no disponible.', 'Sensor nicht verfügbar.'],

  // Errors
  'err.telemetryLarge': ['Fichier de télémétrie trop volumineux.', 'Telemetry file too large.', 'Archivo de telemetría demasiado grande.', 'Telemetriedatei zu groß.'],
  'err.telemetryStale': ['Télémétrie périmée : mise à jour attendue toutes les 10 secondes.', 'Stale telemetry: an update is expected every 10 seconds.', 'Telemetría caducada: se espera una actualización cada 10 segundos.', 'Veraltete Telemetrie: alle 10 Sekunden wird ein Update erwartet.'],
  'err.telemetryValue': ['Valeur de télémétrie invalide : {key}.', 'Invalid telemetry value: {key}.', 'Valor de telemetría no válido: {key}.', 'Ungültiger Telemetriewert: {key}.'],
  'err.telemetryJson': ['Le fichier de télémétrie ne contient pas un JSON valide.', 'The telemetry file is not valid JSON.', 'El archivo de telemetría no contiene JSON válido.', 'Die Telemetriedatei enthält kein gültiges JSON.'],
  'err.telemetryAccess': ['Le fichier de télémétrie est inaccessible.', 'The telemetry file cannot be read.', 'No se puede leer el archivo de telemetría.', 'Die Telemetriedatei ist nicht lesbar.'],
  'err.collectStopped': ['Collecte arrêtée.', 'Collection stopped.', 'Recogida detenida.', 'Erfassung gestoppt.'],
  'err.volume': ['Le volume système est inaccessible. Les autres mesures restent disponibles.', 'The system volume cannot be read. Other readings remain available.', 'No se puede leer el volumen del sistema. Las demás medidas siguen disponibles.', 'Das Systemvolume ist nicht lesbar. Andere Messwerte bleiben verfügbar.'],
  'err.settingsUnreadable': ['Réglages illisibles. Les valeurs par défaut sont actives ; votre fichier sera remplacé au prochain enregistrement.', 'Unreadable settings. Defaults are active; your file will be replaced on the next save.', 'Ajustes ilegibles. Se usan los valores predeterminados; tu archivo se sustituirá al guardar.', 'Einstellungen unlesbar. Standardwerte sind aktiv; deine Datei wird beim nächsten Speichern ersetzt.'],
  'err.sampleFailed': ['La collecte a échoué. Nouvelle tentative automatique au prochain relevé.', 'Collection failed. It will retry automatically on the next reading.', 'La recogida ha fallado. Se reintentará automáticamente en la próxima lectura.', 'Erfassung fehlgeschlagen. Beim nächsten Messwert wird es erneut versucht.'],
  'err.hardware': ['Les capteurs matériels ne répondent pas. Nouvelle tentative automatique.', 'Hardware sensors are not responding. Retrying automatically.', 'Los sensores de hardware no responden. Reintento automático.', 'Hardwaresensoren antworten nicht. Automatischer neuer Versuch.'],
  'err.save': ['Impossible d’enregistrer les réglages sur cet ordinateur.', 'Settings could not be saved on this computer.', 'No se pudieron guardar los ajustes en este ordenador.', 'Einstellungen konnten auf diesem Computer nicht gespeichert werden.'],
  'err.closed': ['Vitals est fermé. Rouvrez l’app.', 'Vitals is closed. Reopen the app.', 'Vitals está cerrada. Vuelve a abrir la app.', 'Vitals ist geschlossen. Öffne die App erneut.'],
  'err.move': ['Déplacement invalide.', 'Invalid move.', 'Movimiento no válido.', 'Ungültige Verschiebung.'],
  'err.widgetMissing': ['Mesure introuvable.', 'Metric not found.', 'Medida no encontrada.', 'Messwert nicht gefunden.'],
  'err.interval': ['Choisissez une cadence de 1, 2 ou 5 secondes.', 'Choose an interval of 1, 2 or 5 seconds.', 'Elige un intervalo de 1, 2 o 5 segundos.', 'Wähle ein Intervall von 1, 2 oder 5 Sekunden.'],
  'err.notifications': ['Choisissez d’activer ou de désactiver les alertes.', 'Choose whether to turn alerts on or off.', 'Elige si activar o desactivar las alertas.', 'Wähle, ob Warnungen an oder aus sein sollen.'],
  'err.language': ['Langue non prise en charge.', 'Unsupported language.', 'Idioma no admitido.', 'Nicht unterstützte Sprache.'],
  'err.unknown': ['Commande inconnue.', 'Unknown command.', 'Comando desconocido.', 'Unbekannter Befehl.'],
  'err.setting': ['Réglage invalide.', 'Invalid setting.', 'Ajuste no válido.', 'Ungültige Einstellung.'],
  'err.widget': ['Réglages de la mesure invalides.', 'Invalid metric settings.', 'Ajustes de la medida no válidos.', 'Ungültige Messwert-Einstellungen.'],
  'err.criticalLow': ['Le seuil critique doit être inférieur au seuil de vigilance.', 'The critical threshold must be below the warning threshold.', 'El umbral crítico debe ser inferior al de atención.', 'Die kritische Schwelle muss unter der Warnschwelle liegen.'],
  'err.criticalHigh': ['Le seuil critique doit être supérieur au seuil de vigilance.', 'The critical threshold must be above the warning threshold.', 'El umbral crítico debe ser superior al de atención.', 'Die kritische Schwelle muss über der Warnschwelle liegen.'],
  'err.layout': ['Mise en page invalide.', 'Invalid layout.', 'Diseño no válido.', 'Ungültiges Layout.'],
  'err.pages': ['Il faut entre 1 et {max} pages.', 'You need between 1 and {max} pages.', 'Se necesitan entre 1 y {max} páginas.', 'Es werden 1 bis {max} Seiten benötigt.'],
  'err.id': ['Identifiant de page, de rangée ou de tuile invalide.', 'Invalid page, row or tile identifier.', 'Identificador de página, fila o mosaico no válido.', 'Ungültige Seiten-, Reihen- oder Kachel-ID.'],
  'err.pageName': ['Chaque page a un nom de 1 à {max} caractères.', 'Each page needs a name of 1 to {max} characters.', 'Cada página necesita un nombre de 1 a {max} caracteres.', 'Jede Seite braucht einen Namen mit 1 bis {max} Zeichen.'],
  'err.rows': ['La page « {name} » doit avoir entre 1 et {max} rangées.', 'Page “{name}” needs between 1 and {max} rows.', 'La página «{name}» necesita entre 1 y {max} filas.', 'Seite „{name}“ braucht 1 bis {max} Reihen.'],
  'err.rowHeight': ['Hauteur de rangée invalide.', 'Invalid row height.', 'Altura de fila no válida.', 'Ungültige Reihenhöhe.'],
  'err.tiles': ['Chaque rangée contient entre 1 et {max} tuiles.', 'Each row holds between 1 and {max} tiles.', 'Cada fila contiene entre 1 y {max} mosaicos.', 'Jede Reihe enthält 1 bis {max} Kacheln.'],
  'err.tile': ['Réglages de tuile invalides.', 'Invalid tile settings.', 'Ajustes de mosaico no válidos.', 'Ungültige Kachel-Einstellungen.'],
  'err.host': ['Hôte refusé.', 'Host refused.', 'Host rechazado.', 'Host abgelehnt.'],
  'err.notFound': ['Introuvable.', 'Not found.', 'No encontrado.', 'Nicht gefunden.'],
  'err.editorFile': ['Fichier de l’éditeur manquant.', 'Editor file missing.', 'Falta un archivo del editor.', 'Editor-Datei fehlt.'],
  'err.token': ['Jeton invalide. Rouvrez l’éditeur depuis Vitals.', 'Invalid token. Reopen the editor from Vitals.', 'Token no válido. Vuelve a abrir el editor desde Vitals.', 'Ungültiges Token. Öffne den Editor erneut aus Vitals.'],
  'err.request': ['Requête illisible.', 'Unreadable request.', 'Solicitud ilegible.', 'Unlesbare Anfrage.'],
  'err.openBrowser': ['Ouvrez l’éditeur dans votre navigateur : {url}', 'Open the editor in your browser: {url}', 'Abre el editor en tu navegador: {url}', 'Öffne den Editor in deinem Browser: {url}'],

  // Backend summaries, island, PC settings
  'sys.cores': ['{os} · {cores} cœurs logiques', '{os} · {cores} logical cores', '{os} · {cores} núcleos lógicos', '{os} · {cores} logische Kerne'],
  'sys.alertsOne': ['1 seuil dépassé', '1 threshold crossed', '1 umbral superado', '1 Schwelle überschritten'],
  'sys.alertsMany': ['{count} seuils dépassés', '{count} thresholds crossed', '{count} umbrales superados', '{count} Schwellen überschritten'],
  'sys.ok': ['Tout est sous contrôle', 'All under control', 'Todo bajo control', 'Alles im grünen Bereich'],
  'sys.history': ['Dernière minute · mesures locales', 'Last minute · local readings', 'Último minuto · medidas locales', 'Letzte Minute · lokale Messwerte'],
  'sys.available': ['{count} mesures accessibles sur {total}', '{count} of {total} readings available', '{count} de {total} medidas disponibles', '{count} von {total} Messwerten verfügbar'],
  'sys.criticalTitle': ['{name} : seuil critique', '{name}: critical threshold', '{name}: umbral crítico', '{name}: kritische Schwelle'],
  'sys.defaultPage': ['Principal', 'Main', 'Principal', 'Haupt'],
  'sys.page': ['Page {n}', 'Page {n}', 'Página {n}', 'Seite {n}'],
  'sys.pageGame': ['Jeu', 'Game', 'Juego', 'Spiel'],
  'sys.pageSystem': ['Système', 'System', 'Sistema', 'System'],
  'island.openEditor': ['Ouvrir l’éditeur de pages', 'Open the page editor', 'Abrir el editor de páginas', 'Seiten-Editor öffnen'],
  'pc.intro': ['Composez vos pages de tuiles dans l’éditeur PC : depuis l’îlot (Vitals → Éditeur) ou le bouton grille du téléphone.', 'Build your tile pages in the PC editor: from the island (Vitals → Editor) or the phone’s grid button.', 'Crea tus páginas de mosaicos en el editor del PC: desde la isla (Vitals → Editor) o el botón de cuadrícula del teléfono.', 'Gestalte deine Kachelseiten im PC-Editor: über die Insel (Vitals → Editor) oder die Raster-Taste am Handy.'],
  'pc.editorAt': ['Éditeur ouvert sur {url}', 'Editor open at {url}', 'Editor abierto en {url}', 'Editor geöffnet unter {url}'],
  'pc.sources': ['CPU et mémoire : système. GPU NVIDIA : nvidia-smi. Windows : Libre Hardware Monitor (WMI). Linux : hwmon CPU et GPU compatibles. Autres GPU et FPS : télémétrie locale.', 'CPU and memory: system. NVIDIA GPU: nvidia-smi. Windows: Libre Hardware Monitor (WMI). Linux: compatible CPU and GPU hwmon. Other GPUs and FPS: local telemetry.', 'CPU y memoria: sistema. GPU NVIDIA: nvidia-smi. Windows: Libre Hardware Monitor (WMI). Linux: hwmon de CPU y GPU compatibles. Otras GPU y FPS: telemetría local.', 'CPU und Speicher: System. NVIDIA-GPU: nvidia-smi. Windows: Libre Hardware Monitor (WMI). Linux: kompatible CPU- und GPU-hwmon. Andere GPUs und FPS: lokale Telemetrie.'],
  'pc.telemetryFile': ['Fichier de télémétrie : {path}', 'Telemetry file: {path}', 'Archivo de telemetría: {path}', 'Telemetriedatei: {path}'],
  'pc.telemetryFormat': ['JSON : timestamp (millisecondes Unix), fps, gpu (%), cpuTemp et gpuTemp (°C). Écrivez atomiquement toutes les 1 à 5 s ; les valeurs expirent après 10 s.', 'JSON: timestamp (Unix milliseconds), fps, gpu (%), cpuTemp and gpuTemp (°C). Write atomically every 1–5 s; values expire after 10 s.', 'JSON: timestamp (milisegundos Unix), fps, gpu (%), cpuTemp y gpuTemp (°C). Escribe de forma atómica cada 1–5 s; los valores caducan a los 10 s.', 'JSON: timestamp (Unix-Millisekunden), fps, gpu (%), cpuTemp und gpuTemp (°C). Alle 1–5 s atomar schreiben; Werte verfallen nach 10 s.'],
  'pc.alerts': ['Alertes critiques', 'Critical alerts', 'Alertas críticas', 'Kritische Warnungen'],

  // Phone screen ($t)
  'ui.refresh': ['Actualiser les capteurs', 'Refresh sensors', 'Actualizar sensores', 'Sensoren aktualisieren'],
  'ui.openEditor': ['Ouvrir l’éditeur de pages sur l’ordinateur', 'Open the page editor on the computer', 'Abrir el editor de páginas en el ordenador', 'Seiten-Editor am Computer öffnen'],
  'ui.openSettings': ['Ouvrir les réglages', 'Open settings', 'Abrir ajustes', 'Einstellungen öffnen'],
  'ui.loading': ['Lecture des constantes…', 'Reading vitals…', 'Leyendo constantes…', 'Werte werden gelesen…'],
  'ui.editMetric': ['Modifier la mesure', 'Edit metric', 'Editar medida', 'Messwert bearbeiten'],
  'ui.save': ['Enregistrer', 'Save', 'Guardar', 'Speichern'],
  'ui.current': ['Mesure actuelle', 'Current reading', 'Medida actual', 'Aktueller Wert'],
  'ui.appearance': ['Apparence', 'Appearance', 'Apariencia', 'Darstellung'],
  'ui.color': ['Couleur normale', 'Normal color', 'Color normal', 'Normale Farbe'],
  'ui.colorPreview': ['Aperçu de la couleur', 'Color preview', 'Vista previa del color', 'Farbvorschau'],
  'ui.thresholds': ['Seuils', 'Thresholds', 'Umbrales', 'Schwellen'],
  'ui.lowHelp': ['Alerte lorsque la valeur descend sous le seuil. Critique doit être inférieur à Vigilance.', 'Alerts when the value drops below the threshold. Critical must be below Warning.', 'Alerta cuando el valor baja del umbral. Crítico debe ser inferior a Atención.', 'Warnt, wenn der Wert unter die Schwelle fällt. Kritisch muss unter Warnung liegen.'],
  'ui.highHelp': ['Alerte lorsque la valeur atteint le seuil. Critique doit être supérieur à Vigilance.', 'Alerts when the value reaches the threshold. Critical must be above Warning.', 'Alerta cuando el valor alcanza el umbral. Crítico debe ser superior a Atención.', 'Warnt, wenn der Wert die Schwelle erreicht. Kritisch muss über Warnung liegen.'],
  'ui.warning': ['Vigilance', 'Warning', 'Atención', 'Warnung'],
  'ui.critical': ['Critique', 'Critical', 'Crítico', 'Kritisch'],
  'ui.colorsHelp': ['Vigilance : orange · Critique : rouge. Le texte indique aussi l’état.', 'Warning: orange · Critical: red. The text also states the status.', 'Atención: naranja · Crítico: rojo. El texto también indica el estado.', 'Warnung: orange · Kritisch: rot. Der Text nennt auch den Zustand.'],
  'ui.cancel': ['Annuler', 'Cancel', 'Cancelar', 'Abbrechen'],
  'ui.settings': ['Réglages', 'Settings', 'Ajustes', 'Einstellungen'],
  'ui.done': ['Terminer', 'Done', 'Listo', 'Fertig'],
  'ui.metrics': ['Mesures', 'Metrics', 'Medidas', 'Messwerte'],
  'ui.metricsHelp': ['Touchez une mesure pour régler ses seuils et sa couleur. Les pages et les tuiles se composent dans l’éditeur sur l’ordinateur.', 'Tap a metric to set its thresholds and color. Pages and tiles are built in the editor on the computer.', 'Toca una medida para ajustar sus umbrales y su color. Las páginas y los mosaicos se crean en el editor del ordenador.', 'Tippe auf einen Messwert, um Schwellen und Farbe einzustellen. Seiten und Kacheln entstehen im Editor am Computer.'],
  'ui.shown': ['Affiché', 'Shown', 'Visible', 'Angezeigt'],
  'ui.onNoPage': ['Sur aucune page', 'On no page', 'En ninguna página', 'Auf keiner Seite'],
  'ui.collection': ['Collecte', 'Collection', 'Recogida', 'Erfassung'],
  'ui.interval': ['Cadence CPU et mémoire', 'CPU and memory interval', 'Intervalo de CPU y memoria', 'CPU- und Speicherintervall'],
  'ui.intervalHelp': ['Les capteurs matériels et le disque sont relus toutes les 5 secondes. Historique : 1 minute, conservé en mémoire pendant la session.', 'Hardware sensors and the disk are read every 5 seconds. History: 1 minute, kept in memory for the session.', 'Los sensores de hardware y el disco se leen cada 5 segundos. Historial: 1 minuto, en memoria durante la sesión.', 'Hardwaresensoren und Laufwerk werden alle 5 Sekunden gelesen. Verlauf: 1 Minute, während der Sitzung im Speicher.'],
  'ui.notify': ['Notifier les seuils critiques', 'Notify critical thresholds', 'Notificar umbrales críticos', 'Bei kritischen Schwellen benachrichtigen'],
  'ui.notifyHelp': ['Une notification Onbun à l’entrée en état critique, au plus une par minute et par mesure.', 'One Onbun notification when a metric turns critical, at most once a minute per metric.', 'Una notificación de Onbun al entrar en estado crítico, como máximo una por minuto y medida.', 'Eine Onbun-Benachrichtigung beim Wechsel in den kritischen Zustand, höchstens einmal pro Minute und Messwert.'],
  'ui.language': ['Langue', 'Language', 'Idioma', 'Sprache'],
  'ui.sensors': ['Capteurs', 'Sensors', 'Sensores', 'Sensoren'],
  'ui.sources': ['Sources disponibles', 'Available sources', 'Fuentes disponibles', 'Verfügbare Quellen'],
  'ui.telemetry': ['Télémétrie locale', 'Local telemetry', 'Telemetría local', 'Lokale Telemetrie'],
  'ui.connected': ['Connectée', 'Connected', 'Conectada', 'Verbunden'],
  'ui.notConnected': ['Non connectée', 'Not connected', 'No conectada', 'Nicht verbunden'],
  'ui.thisComputer': ['Cet ordinateur', 'This computer', 'Este ordenador', 'Dieser Computer'],
  'ui.privacy': ['Aucun compte ni service distant. Seules les mesures et les préférences visuelles sont envoyées au téléphone.', 'No account or remote service. Only readings and visual preferences are sent to the phone.', 'Sin cuenta ni servicio remoto. Solo se envían al teléfono las medidas y las preferencias visuales.', 'Kein Konto, kein entfernter Dienst. Nur Messwerte und Anzeigeeinstellungen gehen ans Handy.'],
  'ui.sourcesTitle': ['Sources et capteurs', 'Sources and sensors', 'Fuentes y sensores', 'Quellen und Sensoren'],
  'ui.measured': ['Ce qui est mesuré', 'What is measured', 'Qué se mide', 'Was gemessen wird'],
  'ui.measuredHelp': ['CPU et mémoire : API du système. Disque : espace occupé du volume système, pas le débit ni l’activité. Charge : moyenne Unix sur une minute, normalisée par cœur ; indisponible sous Windows.', 'CPU and memory: system APIs. Disk: used space on the system volume, not throughput or activity. Load: one-minute Unix average, normalized per core; unavailable on Windows.', 'CPU y memoria: API del sistema. Disco: espacio ocupado del volumen del sistema, no la velocidad ni la actividad. Carga: media Unix de un minuto, normalizada por núcleo; no disponible en Windows.', 'CPU und Speicher: System-APIs. Laufwerk: belegter Platz des Systemvolumes, nicht Durchsatz oder Aktivität. Last: Unix-Mittel über eine Minute, je Kern normiert; unter Windows nicht verfügbar.'],
  'ui.gpuTitle': ['GPU et températures', 'GPU and temperatures', 'GPU y temperaturas', 'GPU und Temperaturen'],
  'ui.gpuHelp': ['NVIDIA : nvidia-smi, installé avec le pilote, accessible dans le PATH. Windows : lancez Libre Hardware Monitor avec son fournisseur WMI activé. Linux : capteurs CPU hwmon coretemp/k10temp compatibles ; GPU exposant gpu_busy_percent et température AMD. macOS et autres GPU : utilisez la télémétrie locale. Aucun privilège élevé n’est demandé par Vitals.', 'NVIDIA: nvidia-smi, installed with the driver and on the PATH. Windows: run Libre Hardware Monitor with its WMI provider on. Linux: compatible coretemp/k10temp hwmon CPU sensors; GPUs exposing gpu_busy_percent and AMD temperature. macOS and other GPUs: use local telemetry. Vitals never asks for elevated privileges.', 'NVIDIA: nvidia-smi, instalado con el controlador y en el PATH. Windows: ejecuta Libre Hardware Monitor con su proveedor WMI activado. Linux: sensores de CPU hwmon coretemp/k10temp compatibles; GPU con gpu_busy_percent y temperatura AMD. macOS y otras GPU: usa la telemetría local. Vitals nunca pide privilegios elevados.', 'NVIDIA: nvidia-smi, mit dem Treiber installiert und im PATH. Windows: Libre Hardware Monitor mit aktiviertem WMI-Anbieter starten. Linux: kompatible coretemp/k10temp-hwmon-CPU-Sensoren; GPUs mit gpu_busy_percent und AMD-Temperatur. macOS und andere GPUs: lokale Telemetrie nutzen. Vitals fordert nie erhöhte Rechte an.'],
  'ui.fpsTitle': ['FPS et télémétrie', 'FPS and telemetry', 'FPS y telemetría', 'FPS und Telemetrie'],
  'ui.fpsHelp': ['Les FPS d’un jeu ne sont pas la fréquence de l’écran. Connectez un outil qui produit de vrais relevés (jeu, outil de capture ou moniteur matériel).', 'A game’s FPS is not the screen refresh rate. Connect a tool that produces real readings (game, capture tool or hardware monitor).', 'Los FPS de un juego no son la frecuencia de la pantalla. Conecta una herramienta que dé medidas reales (juego, herramienta de captura o monitor de hardware).', 'Die FPS eines Spiels sind nicht die Bildwiederholrate. Verbinde ein Tool mit echten Messwerten (Spiel, Aufnahme-Tool oder Hardwaremonitor).'],
  'ui.telemetryHelp': ['Sur l’ordinateur : îlot → Réglages → Vitals. Le chemin de telemetry.json et son format y sont indiqués. Votre outil doit écrire un timestamp en millisecondes Unix et les champs fps, gpu, cpuTemp ou gpuTemp toutes les 1 à 5 secondes.', 'On the computer: island → Settings → Vitals shows the path of telemetry.json and its format. Your tool must write a timestamp in Unix milliseconds and the fps, gpu, cpuTemp or gpuTemp fields every 1 to 5 seconds.', 'En el ordenador: isla → Ajustes → Vitals muestra la ruta de telemetry.json y su formato. Tu herramienta debe escribir un timestamp en milisegundos Unix y los campos fps, gpu, cpuTemp o gpuTemp cada 1 a 5 segundos.', 'Am Computer: Insel → Einstellungen → Vitals zeigt den Pfad von telemetry.json und das Format. Dein Tool muss alle 1 bis 5 Sekunden einen Zeitstempel in Unix-Millisekunden und die Felder fps, gpu, cpuTemp oder gpuTemp schreiben.'],
  'ui.expiryHelp': ['Après 10 secondes sans mise à jour, les mesures externes expirent. Les champs absents conservent les sources matérielles disponibles. Les données invalides affichent une erreur.', 'External readings expire after 10 seconds without an update. Missing fields keep the available hardware sources. Invalid data shows an error.', 'Las medidas externas caducan tras 10 segundos sin actualización. Los campos ausentes mantienen las fuentes de hardware disponibles. Los datos no válidos muestran un error.', 'Externe Messwerte verfallen nach 10 Sekunden ohne Update. Fehlende Felder behalten die verfügbaren Hardwarequellen. Ungültige Daten zeigen einen Fehler.'],
  'ui.sourceState': ['État des sources', 'Source status', 'Estado de las fuentes', 'Quellenstatus'],
  'ui.close': ['Fermer', 'Close', 'Cerrar', 'Schließen'],
  'ui.partial': ['Collecte partielle', 'Partial collection', 'Recogida parcial', 'Teilweise Erfassung'],
  'ui.retry': ['Réessayer', 'Retry', 'Reintentar', 'Erneut versuchen'],
  'ui.everySeconds': ['Toutes les {s} s', 'Every {s} s', 'Cada {s} s', 'Alle {s} s'],
  'color.mint': ['Menthe', 'Mint', 'Menta', 'Minze'], 'color.cyan': ['Cyan', 'Cyan', 'Cian', 'Cyan'], 'color.teal': ['Sarcelle', 'Teal', 'Verde azulado', 'Blaugrün'],
  'color.blue': ['Bleu', 'Blue', 'Azul', 'Blau'], 'color.indigo': ['Indigo', 'Indigo', 'Índigo', 'Indigo'], 'color.purple': ['Violet', 'Purple', 'Violeta', 'Violett'],
  'color.pink': ['Rose', 'Pink', 'Rosa', 'Rosa'], 'color.green': ['Vert', 'Green', 'Verde', 'Grün'], 'color.orange': ['Orange', 'Orange', 'Naranja', 'Orange'],
  'color.yellow': ['Jaune', 'Yellow', 'Amarillo', 'Gelb'], 'color.white': ['Blanc', 'White', 'Blanco', 'Weiß'],

  // PC editor (ed.*)
  'ed.title': ['Vitals · Éditeur de pages', 'Vitals · Page editor', 'Vitals · Editor de páginas', 'Vitals · Seiten-Editor'],
  'ed.subtitle': ['Éditeur de pages', 'Page editor', 'Editor de páginas', 'Seiten-Editor'],
  'ed.addPage': ['＋ Page', '＋ Page', '＋ Página', '＋ Seite'],
  'ed.addPageTitle': ['Ajouter une page', 'Add a page', 'Añadir una página', 'Seite hinzufügen'],
  'ed.revert': ['Annuler', 'Discard', 'Descartar', 'Verwerfen'],
  'ed.send': ['Envoyer au téléphone', 'Send to phone', 'Enviar al teléfono', 'An Handy senden'],
  'ed.page': ['Page', 'Page', 'Página', 'Seite'],
  'ed.pageLeft': ['Déplacer la page à gauche', 'Move page left', 'Mover la página a la izquierda', 'Seite nach links'],
  'ed.pageRight': ['Déplacer la page à droite', 'Move page right', 'Mover la página a la derecha', 'Seite nach rechts'],
  'ed.deletePage': ['Supprimer la page', 'Delete page', 'Eliminar página', 'Seite löschen'],
  'ed.deletePageConfirm': ['Supprimer la page « {name} » ?', 'Delete page “{name}”?', '¿Eliminar la página «{name}»?', 'Seite „{name}“ löschen?'],
  'ed.preview': ['Aperçu', 'Preview', 'Vista previa', 'Vorschau'],
  'ed.landscape': ['Paysage', 'Landscape', 'Horizontal', 'Quer'],
  'ed.portrait': ['Portrait', 'Portrait', 'Vertical', 'Hoch'],
  'ed.addRow': ['＋ Ajouter une rangée', '＋ Add a row', '＋ Añadir una fila', '＋ Reihe hinzufügen'],
  'ed.hintTitle': ['Composer une page', 'Build a page', 'Crear una página', 'Seite gestalten'],
  'ed.hint1': ['Cliquez une tuile pour choisir sa mesure, son affichage et sa couleur.', 'Click a tile to choose its metric, display and color.', 'Haz clic en un mosaico para elegir su medida, su vista y su color.', 'Klicke auf eine Kachel, um Messwert, Anzeige und Farbe zu wählen.'],
  'ed.hint2': ['Glissez une tuile vers une autre rangée, ou sur une tuile pour l’échanger.', 'Drag a tile to another row, or onto a tile to swap them.', 'Arrastra un mosaico a otra fila, o sobre otro para intercambiarlos.', 'Ziehe eine Kachel in eine andere Reihe oder auf eine Kachel, um sie zu tauschen.'],
  'ed.hint3': ['Une rangée accueille 1 à 4 tuiles de même largeur ; sa hauteur se règle à droite.', 'A row holds 1 to 4 tiles of equal width; set its height on the right.', 'Una fila admite de 1 a 4 mosaicos del mismo ancho; su altura se ajusta a la derecha.', 'Eine Reihe fasst 1 bis 4 gleich breite Kacheln; ihre Höhe stellst du rechts ein.'],
  'ed.hint4': ['Les couleurs passent à l’orange puis au rouge quand un seuil est franchi.', 'Colors turn orange, then red, when a threshold is crossed.', 'Los colores pasan a naranja y luego a rojo al superar un umbral.', 'Farben werden orange und dann rot, wenn eine Schwelle überschritten wird.'],
  'ed.hint5': ['« Envoyer au téléphone » applique la mise en page en direct.', '“Send to phone” applies the layout live.', '«Enviar al teléfono» aplica el diseño en directo.', '„An Handy senden“ übernimmt das Layout sofort.'],
  'ed.intervalNote': ['Rafraîchissement des mesures : toutes les {s} s (réglable sur le téléphone).', 'Readings refresh every {s} s (set on the phone).', 'Las medidas se actualizan cada {s} s (ajustable en el teléfono).', 'Messwerte werden alle {s} s aktualisiert (am Handy einstellbar).'],
  'ed.language': ['Langue', 'Language', 'Idioma', 'Sprache'],
  'ed.tile': ['Tuile', 'Tile', 'Mosaico', 'Kachel'],
  'ed.row': ['Rangée', 'Row', 'Fila', 'Reihe'],
  'ed.metric': ['Mesure', 'Metric', 'Medida', 'Messwert'],
  'ed.display': ['Affichage', 'Display', 'Vista', 'Anzeige'],
  'ed.color': ['Couleur', 'Color', 'Color', 'Farbe'],
  'ed.metricColor': ['Couleur de la mesure', 'Metric color', 'Color de la medida', 'Farbe des Messwerts'],
  'ed.metricDefaultColor': ['Couleur par défaut de la mesure', 'Default color of the metric', 'Color predeterminado de la medida', 'Standardfarbe des Messwerts'],
  'ed.unavailableSuffix': [' (indisponible)', ' (unavailable)', ' (no disponible)', ' (nicht verfügbar)'],
  'ed.unavailableHere': ['Indisponible sur ce PC', 'Unavailable on this PC', 'No disponible en este PC', 'Auf diesem PC nicht verfügbar'],
  'ed.left': ['Vers la gauche', 'Move left', 'A la izquierda', 'Nach links'],
  'ed.right': ['Vers la droite', 'Move right', 'A la derecha', 'Nach rechts'],
  'ed.up': ['Monter', 'Move up', 'Subir', 'Nach oben'],
  'ed.down': ['Descendre', 'Move down', 'Bajar', 'Nach unten'],
  'ed.duplicate': ['Dupliquer', 'Duplicate', 'Duplicar', 'Duplizieren'],
  'ed.delete': ['Supprimer', 'Delete', 'Eliminar', 'Löschen'],
  'ed.addTile': ['＋ Tuile', '＋ Tile', '＋ Mosaico', '＋ Kachel'],
  'ed.deleteRow': ['Supprimer la rangée', 'Delete row', 'Eliminar fila', 'Reihe löschen'],
  'ed.height': ['Hauteur', 'Height', 'Altura', 'Höhe'],
  'ed.rowNote': ['Les tuiles d’une rangée se partagent sa largeur à parts égales, comme sur le téléphone.', 'Tiles in a row share its width equally, just like on the phone.', 'Los mosaicos de una fila se reparten su ancho por igual, como en el teléfono.', 'Die Kacheln einer Reihe teilen sich die Breite gleichmäßig, wie am Handy.'],
  'ed.h.s': ['Fine', 'Slim', 'Fina', 'Schmal'], 'ed.h.m': ['Moyenne', 'Medium', 'Media', 'Mittel'], 'ed.h.l': ['Haute', 'Tall', 'Alta', 'Hoch'], 'ed.h.xl': ['Très haute', 'Extra tall', 'Muy alta', 'Sehr hoch'],
  'ed.d.value': ['Chiffre', 'Number', 'Número', 'Zahl'], 'ed.d.gauge': ['Jauge', 'Gauge', 'Indicador', 'Anzeige'], 'ed.d.chart': ['Courbe', 'Chart', 'Gráfico', 'Verlauf'], 'ed.d.bar': ['Barre', 'Bar', 'Barra', 'Balken'],
  'ed.thresholdsOf': ['Seuils · {name}', 'Thresholds · {name}', 'Umbrales · {name}', 'Schwellen · {name}'],
  'ed.warningUnit': ['Vigilance ({unit})', 'Warning ({unit})', 'Atención ({unit})', 'Warnung ({unit})'],
  'ed.criticalUnit': ['Critique ({unit})', 'Critical ({unit})', 'Crítico ({unit})', 'Kritisch ({unit})'],
  'ed.lowNote': ['Alerte quand la valeur descend sous le seuil.', 'Alerts when the value drops below the threshold.', 'Alerta cuando el valor baja del umbral.', 'Warnt, wenn der Wert unter die Schwelle fällt.'],
  'ed.highNote': ['Alerte quand la valeur atteint le seuil.', 'Alerts when the value reaches the threshold.', 'Alerta cuando el valor alcanza el umbral.', 'Warnt, wenn der Wert die Schwelle erreicht.'],
  'ed.noSource': ['Source indisponible', 'Source unavailable', 'Fuente no disponible', 'Quelle nicht verfügbar'],
  'ed.tileTitle': ['Cliquer pour modifier · glisser pour déplacer', 'Click to edit · drag to move', 'Haz clic para editar · arrastra para mover', 'Klicken zum Bearbeiten · Ziehen zum Verschieben'],
  'ed.overflow': ['La page dépasse l’écran d’environ {pt} pt en {orientation} : réduisez une rangée pour un affichage tête haute sans défilement.', 'The page is about {pt} pt taller than the screen in {orientation}: shrink a row for a HUD that never scrolls.', 'La página supera la pantalla en unos {pt} pt en {orientation}: reduce una fila para un HUD sin desplazamiento.', 'Die Seite ist im {orientation}-Format etwa {pt} pt zu hoch: verkleinere eine Reihe für ein HUD ohne Scrollen.'],
  'ed.fits': ['{rows} rangée(s) · tient sur l’écran sans défiler.', '{rows} row(s) · fits on screen without scrolling.', '{rows} fila(s) · cabe en pantalla sin desplazamiento.', '{rows} Reihe(n) · passt ohne Scrollen auf den Bildschirm.'],
  'ed.dirty': ['Modifications non envoyées', 'Unsent changes', 'Cambios sin enviar', 'Nicht gesendete Änderungen'],
  'ed.discarded': ['Modifications annulées', 'Changes discarded', 'Cambios descartados', 'Änderungen verworfen'],
  'ed.sending': ['Envoi…', 'Sending…', 'Enviando…', 'Wird gesendet…'],
  'ed.sent': ['Envoyé · le téléphone est à jour', 'Sent · the phone is up to date', 'Enviado · el teléfono está al día', 'Gesendet · das Handy ist aktuell'],
  'ed.connected': ['Connecté · aperçu en direct', 'Connected · live preview', 'Conectado · vista previa en directo', 'Verbunden · Live-Vorschau'],
  'ed.noToken': ['Ouvrez l’éditeur depuis Vitals (îlot ou téléphone).', 'Open the editor from Vitals (island or phone).', 'Abre el editor desde Vitals (isla o teléfono).', 'Öffne den Editor aus Vitals (Insel oder Handy).'],
  'ed.newPage': ['Page {n}', 'Page {n}', 'Página {n}', 'Seite {n}']
};

let current = 'fr';

function resolve(preference, systemLocales = []) {
  if (LANGS.includes(preference)) return preference;
  for (const locale of systemLocales) {
    const code = String(locale || '').toLowerCase().slice(0, 2);
    if (LANGS.includes(code)) return code;
  }
  return 'en';
}

// Locales of the computer, best first: Electron's view of the OS, then Intl, then LANG.
function systemLocales(electron) {
  const list = [];
  try { list.push(...(electron?.app?.getPreferredSystemLanguages?.() || [])); } catch {}
  try { list.push(electron?.app?.getLocale?.()); } catch {}
  try { list.push(Intl.DateTimeFormat().resolvedOptions().locale); } catch {}
  list.push(process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG);
  return list.filter(Boolean);
}

function setLanguage(lang) { current = LANGS.includes(lang) ? lang : 'en'; return current; }
const language = () => current;

function t(key, params, lang = current) {
  const entry = S[key];
  let text = !entry ? key : EXTRA[lang] ? EXTRA[lang][key] ?? entry[1] : entry[LANGS.indexOf(lang)] ?? entry[1];
  if (params) text = text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  return text;
}

// A flat {name: text} table for one prefix, e.g. table('ui') → {refresh: '…'} for `$t.refresh`.
function table(prefix, lang = current) {
  const out = {};
  for (const key of Object.keys(S)) if (key.startsWith(prefix + '.')) out[key.slice(prefix.length + 1).replace(/\./g, '_')] = t(key, null, lang);
  return out;
}

// Errors carry their key so the message follows the language at the moment it is shown.
class VitalsError extends Error {
  constructor(key, params) { super(t(key, params)); this.key = key; this.params = params; }
}

const languageOptions = () => [{ value: 'auto', label: NAMES.auto[LANGS.indexOf(current)] }, ...LANGS.map(l => ({ value: l, label: NAMES[l] }))];

module.exports = { LANGS, STRINGS: S, EXTRA, resolve, systemLocales, setLanguage, language, t, table, VitalsError, languageOptions };
