// Plantilla: "Incidentes abiertos" para analistas (BMC Helix Dashboards / Grafana 12, datasource BMC Helix modo SQL).
// Uso: abrir en Chrome cualquier página de <tenant>.onbmc.com/dashboards con sesión iniciada y ejecutar
// este archivo completo con javascript_tool. Funciona en cualquier ambiente: toma el datasource y un
// target de ejemplo del propio ambiente. Devuelve un JSON con el resultado.

const CONFIG = {
  uid: 'claude-prueba-incidentes',
  titulo: 'Prueba Claude - Incidentes abiertos',
  carpeta: 'Claude',
  sobrescribir: false,          // true = reemplaza el dashboard si ya existe ese uid
  rango: { from: 'now-1y', to: 'now' },
};

const api = async (m, p, b) => {
  const r = await fetch('/dashboards' + p, { method: m, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};

// --- 1. Datasource y target de ejemplo del ambiente ---
const dsInfo = (await api('GET', '/api/datasources')).j.find(d => d.type === 'bmchelix-ade-datasource');
if (!dsInfo) throw new Error('No hay datasource bmchelix-ade-datasource en este ambiente');
const DS = { type: dsInfo.type, uid: dsInfo.uid };

const buscarTemplate = async () => {
  const candidatos = [...(await api('GET', '/api/search?type=dash-db&query=Aging%20Incident&limit=5')).j,
                      ...(await api('GET', '/api/search?type=dash-db&query=Incident&limit=40')).j];
  for (const d of candidatos) {
    const f = (await api('GET', '/api/dashboards/uid/' + d.uid)).j;
    const ps = (f.dashboard.panels || []).flatMap(p => p.panels ? [p, ...p.panels] : [p]);
    for (const p of ps) for (const t of (p.targets || []))
      if (t.sourceType === 'remedy' && t.sourceQuery?.queryType === 'SQL') return { t, origen: d.title };
  }
  throw new Error('No encontré un panel de Service Management en modo SQL para usar de plantilla');
};
const { t: tplRaw, origen } = await buscarTemplate();
const tpl = JSON.parse(JSON.stringify(tplRaw, (k, v) => k === '$$hashKey' ? undefined : v));

// --- 2. SQL ---
const HD = '`HPD:Help Desk`'; const F = c => `${HD}.\`${c}\``;
// Filtros multi-valor: con "All" (allValue '__ALL__') no se filtra, así se conservan los NULL.
const filtro = (col, v) => `(${F(col)} IN (\${${v}:sqlstring}) OR '__ALL__' IN (\${${v}:sqlstring}))`;
const W = [filtro('Company', 'company'), filtro('Assigned Support Organization', 'org'), filtro('Assigned Group', 'grupo'),
           filtro('Priority', 'prioridad'), filtro('Reported Source', 'fuente')].join(' AND ');
const OPEN = `${F('Status')} < 'Resolved'`;
const B = `${OPEN} AND ${W}`;
const TP = `${F('Submit Date')} >= $__from/1000 AND ${F('Submit Date')} <= $__to/1000 AND ${W}`;
const TR = `${F('Status')} >= 'Resolved' AND ${F('Last Resolved Date')} >= $__from/1000 AND ${F('Last Resolved Date')} <= $__to/1000 AND ${W}`;
const AGE = `DATEDIFF('day', ${F('Submit Date')}, currentDate())`;   // DATEDIFF solo acepta 'day' o 'second'
const BUCKET = `CASE WHEN ${AGE} <= 7 THEN '1. 0-7 días' WHEN ${AGE} <= 30 THEN '2. 8-30 días' WHEN ${AGE} <= 90 THEN '3. 31-90 días' WHEN ${AGE} <= 180 THEN '4. 91-180 días' WHEN ${AGE} <= 365 THEN '5. 181-365 días' ELSE '6. Más de 1 año' END`;
const N = `COUNT(${F('Entry ID')})`;
const cnt = p => `SUM(CASE WHEN ${F('Priority')} = '${p}' THEN 1 ELSE 0 END)`;
// CASE sirve para campos de texto; en campos enum (Reported Source) falla: ahí se usa value mapping.
const conVacio = (c, txt) => `CASE WHEN ${F(c)} IS NULL THEN '${txt}' ELSE ${F(c)} END`;

// --- 3. Constructores de paneles ---
const mk = (sql, fmt = 'Table', refId = 'A') => {
  const t = JSON.parse(JSON.stringify(tpl));
  t.refId = refId; t.datasource = DS;
  t.sourceQuery.rawQuery = sql; t.sourceQuery.formatAs = fmt; t.sourceQuery.guid = crypto.randomUUID();
  return t;
};
let id = 1;
const P = (type, title, gridPos, targets, extra = {}) => ({ id: id++, type, title, gridPos, datasource: DS, targets, ...extra });
const row = (title, y) => ({ id: id++, type: 'row', title, collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 }, panels: [] });
const thr = steps => ({ mode: 'absolute', steps: steps.map(([color, value]) => ({ color, value })) });
const semaforoDias = thr([['green', null], ['orange', 7], ['red', 30]]);
const stat = (title, i, y0, sql, description, o = {}) => P('stat', title, { x: (i % 4) * 6, y: y0 + Math.floor(i / 4) * 4, w: 6, h: 4 }, [mk(sql)], {
  description,
  options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'background', graphMode: 'none', textMode: 'value', justifyMode: 'center' },
  fieldConfig: { defaults: { unit: o.unit || 'none', decimals: o.decimals ?? 0, color: { mode: o.thr ? 'thresholds' : 'fixed', fixedColor: o.color || 'blue' }, thresholds: o.thr || thr([['blue', null]]) }, overrides: [] },
});
const bar = (title, gridPos, sql, description, color = 'blue') => P('barchart', title, gridPos, [mk(sql)], {
  description,
  options: { orientation: 'horizontal', showValue: 'always', legend: { showLegend: false }, xTickLabelMaxLength: 40, tooltip: { mode: 'single' } },
  fieldConfig: { defaults: { color: { mode: 'fixed', fixedColor: color } }, overrides: [] },
});
const pie = (title, gridPos, sql, description, overrides = []) => P('piechart', title, gridPos, [mk(sql)], {
  description,
  options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: true }, pieType: 'donut', displayLabels: ['percent'], legend: { showLegend: true, displayMode: 'table', placement: 'right', values: ['value', 'percent'] } },
  fieldConfig: { defaults: { color: { mode: 'palette-classic' } }, overrides },
});
const ov = (name, props) => ({ matcher: { id: 'byName', options: name }, properties: props });
const edadCol = name => ov(name, [{ id: 'displayName', value: 'Edad prom.' }, { id: 'unit', value: 'suffix: días' }, { id: 'decimals', value: 0 },
  { id: 'custom.cellOptions', value: { type: 'color-background' } }, { id: 'thresholds', value: semaforoDias }, { id: 'color', value: { mode: 'thresholds' } }]);

// --- 4. Paneles ---
const panels = [];
let y = 0;
panels.push(row('Resumen', y)); y += 1;
panels.push(
  stat('Backlog abierto', 0, y, `SELECT ${N} AS Abiertos FROM ${HD} WHERE ${B}`, 'Incidentes no resueltos (estado anterior a Resuelto) según los filtros. No depende del rango de fechas.'),
  stat('Críticos + Altos abiertos', 1, y, `SELECT ${N} AS N FROM ${HD} WHERE ${B} AND ${F('Priority')} IN ('Critical','High')`, 'Backlog de prioridad Crítica o Alta.', { thr: thr([['green', null], ['orange', 1], ['red', 10]]) }),
  stat('Sin asignar', 2, y, `SELECT ${N} AS N FROM ${HD} WHERE ${B} AND ${F('Assignee')} IS NULL`, 'Incidentes abiertos con grupo pero sin persona asignada.', { thr: thr([['green', null], ['orange', 1], ['red', 50]]) }),
  stat('Edad promedio backlog', 3, y, `SELECT AVG(${AGE}) AS Dias FROM ${HD} WHERE ${B}`, 'Días promedio desde la creación de los incidentes abiertos.', { unit: 'suffix: días', thr: semaforoDias }),
  stat('% backlog > 30 días', 4, y, `SELECT SUM(CASE WHEN ${AGE} > 30 THEN 1 ELSE 0 END) * 100.0 / ${N} AS Pct FROM ${HD} WHERE ${B}`, 'Porcentaje del backlog con más de 30 días de antigüedad.', { unit: 'percent', decimals: 1, thr: thr([['green', null], ['orange', 20], ['red', 50]]) }),
  stat('Creados en el periodo', 5, y, `SELECT ${N} AS N FROM ${HD} WHERE ${TP}`, 'Incidentes creados (Submit Date) dentro del rango de fechas seleccionado.', { color: 'purple' }),
  stat('Resueltos en el periodo', 6, y, `SELECT ${N} AS N FROM ${HD} WHERE ${TR}`, 'Incidentes resueltos o cerrados (Last Resolved Date) dentro del rango de fechas.', { color: 'green' }),
  stat('MTTR del periodo', 7, y, `SELECT AVG(DATEDIFF('second', ${F('Submit Date')}, ${F('Last Resolved Date')})) / 86400.0 AS MTTR FROM ${HD} WHERE ${TR}`, 'Tiempo medio de resolución de los incidentes resueltos en el periodo (desde creación hasta resolución).', { unit: 'suffix: días', decimals: 1, color: 'green' }),
); y += 8;
panels.push(row('Composición del backlog', y)); y += 1;
panels.push(
  bar('Backlog por prioridad', { x: 0, y, w: 8, h: 8 }, `SELECT ${F('Priority')} AS Prioridad, ${N} AS Total FROM ${HD} WHERE ${B} GROUP BY ${F('Priority')} ORDER BY ${F('Priority')}`, 'Incidentes abiertos por prioridad.', 'red'),
  pie('Backlog por estado', { x: 8, y, w: 8, h: 8 }, `SELECT ${F('Status')} AS Estado, ${N} AS Total FROM ${HD} WHERE ${B} GROUP BY ${F('Status')}`, 'Distribución del backlog por estado.'),
  bar('Antigüedad del backlog', { x: 16, y, w: 8, h: 8 }, `SELECT ${BUCKET} AS Rango, ${N} AS Total FROM ${HD} WHERE ${B} GROUP BY ${BUCKET} ORDER BY ${BUCKET}`, 'Incidentes abiertos agrupados por días desde su creación.', 'orange'),
); y += 8;
panels.push(
  pie('Backlog por fuente', { x: 0, y, w: 8, h: 8 }, `SELECT ${F('Reported Source')} AS Fuente, ${N} AS Total FROM ${HD} WHERE ${B} GROUP BY ${F('Reported Source')}`, 'Canal por el que se reportaron los incidentes abiertos.',
    [ov('Fuente', [{ id: 'mappings', value: [{ type: 'special', options: { match: 'null+nan', result: { text: '(Sin fuente)', index: 0 } } }, { type: 'special', options: { match: 'empty', result: { text: '(Sin fuente)', index: 1 } } }] }])]),
  bar('Top 10 categorías operacionales (nivel 1)', { x: 8, y, w: 8, h: 8 }, `SELECT ${conVacio('Categorization Tier 1', '(Sin categoría)')} AS Categoria, ${N} AS Total FROM ${HD} WHERE ${B} GROUP BY ${conVacio('Categorization Tier 1', '(Sin categoría)')} ORDER BY ${N} DESC LIMIT 10`, 'Categorías operacionales con más incidentes abiertos.', 'purple'),
  bar('Top 10 categorías de producto (nivel 1)', { x: 16, y, w: 8, h: 8 }, `SELECT ${conVacio('Product Categorization Tier 1', '(Sin categoría)')} AS Producto, ${N} AS Total FROM ${HD} WHERE ${B} GROUP BY ${conVacio('Product Categorization Tier 1', '(Sin categoría)')} ORDER BY ${N} DESC LIMIT 10`, 'Categorías de producto con más incidentes abiertos.', 'purple'),
); y += 8;
panels.push(row('Tendencia (rango de fechas seleccionado)', y)); y += 1;
panels.push(P('timeseries', 'Creados vs resueltos por día', { x: 0, y, w: 24, h: 8 }, [
  mk(`SELECT DATE(${F('Submit Date')}) AS __time__, ${N} AS Creados FROM ${HD} WHERE ${TP} GROUP BY DATE(${F('Submit Date')}) ORDER BY DATE(${F('Submit Date')})`, 'TimeSeries', 'A'),
  mk(`SELECT DATE(${F('Last Resolved Date')}) AS __time__, ${N} AS Resueltos FROM ${HD} WHERE ${TR} GROUP BY DATE(${F('Last Resolved Date')}) ORDER BY DATE(${F('Last Resolved Date')})`, 'TimeSeries', 'B')], {
  description: 'Entrada (creados) contra salida (resueltos) por día. Si la línea de creados va por encima de forma sostenida, el backlog crece.',
  options: { legend: { showLegend: true, displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
  fieldConfig: { defaults: { custom: { drawStyle: 'bars', fillOpacity: 60, barAlignment: 0, lineWidth: 1 }, color: { mode: 'palette-classic' } }, overrides: [
    ov('Creados', [{ id: 'color', value: { mode: 'fixed', fixedColor: 'purple' } }]),
    ov('Resueltos', [{ id: 'color', value: { mode: 'fixed', fixedColor: 'green' } }])] },
})); y += 8;
panels.push(row('Grupos y analistas', y)); y += 1;
panels.push(
  P('table', 'Backlog por grupo asignado', { x: 0, y, w: 15, h: 10 }, [mk(`SELECT ${F('Assigned Support Organization')} AS Organizacion, ${F('Assigned Group')} AS Grupo, ${N} AS Total, ${cnt('Critical')} AS Critica, ${cnt('High')} AS Alta, ${cnt('Medium')} AS Media, ${cnt('Low')} AS Baja, SUM(CASE WHEN ${F('Assignee')} IS NULL THEN 1 ELSE 0 END) AS SinAsignar, SUM(CASE WHEN ${AGE} > 30 THEN 1 ELSE 0 END) AS Mas30d, AVG(${AGE}) AS EdadProm FROM ${HD} WHERE ${B} GROUP BY ${F('Assigned Support Organization')}, ${F('Assigned Group')} ORDER BY ${N} DESC`)], {
    description: 'Carga y antigüedad del backlog por grupo. Ordenable por cualquier columna.',
    options: { showHeader: true, cellHeight: 'sm', footer: { show: true, reducer: ['sum'], fields: ['Total', 'Critica', 'Alta', 'Media', 'Baja', 'SinAsignar', 'Mas30d'] } },
    fieldConfig: { defaults: { custom: { align: 'auto' } }, overrides: [
      ov('Organizacion', [{ id: 'displayName', value: 'Organización' }]),
      ov('Critica', [{ id: 'displayName', value: 'Crítica' }, { id: 'custom.cellOptions', value: { type: 'color-text' } }, { id: 'thresholds', value: thr([['text', null], ['red', 1]]) }, { id: 'color', value: { mode: 'thresholds' } }]),
      ov('Alta', [{ id: 'custom.cellOptions', value: { type: 'color-text' } }, { id: 'thresholds', value: thr([['text', null], ['orange', 1]]) }, { id: 'color', value: { mode: 'thresholds' } }]),
      ov('SinAsignar', [{ id: 'displayName', value: 'Sin asignar' }]),
      ov('Mas30d', [{ id: 'displayName', value: '> 30 días' }]),
      ov('Total', [{ id: 'custom.cellOptions', value: { type: 'gauge', mode: 'basic' } }, { id: 'color', value: { mode: 'continuous-BlPu' } }]),
      edadCol('EdadProm')] },
  }),
  P('table', 'Backlog por analista', { x: 15, y, w: 9, h: 10 }, [mk(`SELECT ${F('Assignee')} AS Analista, ${F('Assigned Group')} AS Grupo, ${N} AS Total, ${cnt('Critical')} + ${cnt('High')} AS CritAlta, AVG(${AGE}) AS EdadProm FROM ${HD} WHERE ${B} AND ${F('Assignee')} IS NOT NULL GROUP BY ${F('Assignee')}, ${F('Assigned Group')} ORDER BY ${N} DESC`)], {
    description: 'Incidentes abiertos por persona asignada (excluye los no asignados).',
    options: { showHeader: true, cellHeight: 'sm' },
    fieldConfig: { defaults: {}, overrides: [ov('CritAlta', [{ id: 'displayName', value: 'Crít.+Alta' }]), edadCol('EdadProm')] },
  }),
); y += 10;
panels.push(row('Detalle de incidentes abiertos', y)); y += 1;
panels.push(P('table', 'Incidentes abiertos (más antiguos primero)', { x: 0, y, w: 24, h: 14 }, [mk(`SELECT ${F('Incident Number')} AS Incidente, ${F('Description')} AS Resumen, ${F('Priority')} AS Prioridad, ${F('Status')} AS Estado, ${F('Status_Reason')} AS Motivo, ${F('Company')} AS Compania, ${F('Assigned Group')} AS Grupo, ${F('Assignee')} AS Asignado, ${F('Reported Source')} AS Fuente, ${F('Submit Date')} AS Creado, ${AGE} AS Dias FROM ${HD} WHERE ${B} ORDER BY ${AGE} DESC`)], {
  description: 'Lista de incidentes abiertos según los filtros. Usa el filtro de columna o el menú del panel → Inspect → Data para exportar a CSV.',
  options: { showHeader: true, cellHeight: 'sm', footer: { show: true, reducer: ['count'], fields: ['Incidente'], countRows: false } },
  fieldConfig: { defaults: { custom: { filterable: true } }, overrides: [
    ov('Incidente', [{ id: 'custom.width', value: 170 }]),
    ov('Resumen', [{ id: 'custom.width', value: 380 }]),
    ov('Compania', [{ id: 'displayName', value: 'Compañía' }]),
    ov('Creado', [{ id: 'unit', value: 'dateTimeAsLocalNoDateIfToday' }, { id: 'custom.width', value: 150 }]),
    ov('Prioridad', [{ id: 'custom.cellOptions', value: { type: 'color-text' } }, { id: 'mappings', value: [{ type: 'value', options: { 'Crítica': { color: 'red', index: 0 }, 'Alta': { color: 'orange', index: 1 }, 'Media': { color: 'yellow', index: 2 }, 'Baja': { color: 'green', index: 3 } } }] }]),
    ov('Dias', [{ id: 'displayName', value: 'Días abierto' }, { id: 'custom.width', value: 110 }, { id: 'custom.cellOptions', value: { type: 'color-background' } }, { id: 'thresholds', value: semaforoDias }, { id: 'color', value: { mode: 'thresholds' } }])] },
}));

// --- 5. Variables (filtros encadenados) ---
const v = (name, label, sql) => ({ type: 'query', name, label, datasource: DS, query: `remedy,{"sql": "${sql}"}`, definition: `remedy,{"sql": "${sql}"}`,
  refresh: 1, includeAll: true, multi: true, allValue: "'__ALL__'", sort: 1, regex: '', allowCustomValue: false, current: { selected: true, text: ['All'], value: ['$__all'] } });
const templating = { list: [
  v('company', 'Compañía', `SELECT DISTINCT ${F('Company')} FROM ${HD} WHERE ${OPEN}`),
  v('org', 'Organización de soporte', `SELECT DISTINCT ${F('Assigned Support Organization')} FROM ${HD} WHERE ${filtro('Company', 'company')}`),
  v('grupo', 'Grupo asignado', `SELECT DISTINCT ${F('Assigned Group')} FROM ${HD} WHERE ${filtro('Company', 'company')} AND ${filtro('Assigned Support Organization', 'org')}`),
  v('prioridad', 'Prioridad', `SELECT DISTINCT ${F('Priority')} FROM ${HD}`),
  v('fuente', 'Fuente', `SELECT DISTINCT ${F('Reported Source')} FROM ${HD}`),
] };

// --- 6. Carpeta y guardado ---
const folders = (await api('GET', '/api/folders')).j;
const folder = folders.find(f => f.title === CONFIG.carpeta) || (await api('POST', '/api/folders', { title: CONFIG.carpeta })).j;
const existente = await api('GET', '/api/dashboards/uid/' + CONFIG.uid);
if (existente.s === 200 && !CONFIG.sobrescribir) throw new Error(`Ya existe un dashboard con uid ${CONFIG.uid}; usa sobrescribir: true o cambia el uid`);

const links = [];
for (const [title, q] of [['Incident Details', 'Incident Details - Drill-through'], ['Incident SLA Details', 'Incident SLA Details - Drill-through']]) {
  const hit = (await api('GET', '/api/search?type=dash-db&query=' + encodeURIComponent(q))).j.find(d => d.title === q);
  if (hit) links.push({ title, type: 'link', url: hit.url, icon: 'external link', targetBlank: true, keepTime: true });
}

const dashboard = {
  uid: CONFIG.uid, title: CONFIG.titulo, tags: ['claude', 'incidentes', 'itsm'], timezone: 'browser', schemaVersion: 39, graphTooltip: 1,
  description: 'Análisis del backlog de incidentes (HPD:Help Desk): KPIs, composición, antigüedad, tendencia, carga por grupo y analista, y detalle. Los indicadores de backlog muestran la foto actual; los del periodo usan el rango de fechas.',
  time: CONFIG.rango, templating, panels, links,
};
if (existente.s === 200) { dashboard.id = existente.j.dashboard.id; dashboard.version = existente.j.dashboard.version; }
const res = await api('POST', '/api/dashboards/db', { dashboard, folderUid: folder.uid, overwrite: false, message: 'Plantilla incidentes_backlog.js' });
JSON.stringify({ host: location.host, status: res.s, resultado: res.j, carpeta: folder.title, plantillaDesde: origen, paneles: panels.length });
