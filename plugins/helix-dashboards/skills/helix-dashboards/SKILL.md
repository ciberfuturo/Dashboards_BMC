---
name: helix-dashboards
description: Create, improve, copy or promote dashboards in BMC Helix Dashboards (Grafana-based, *.onbmc.com/dashboards) in any environment (dev, QA, prod) through the user's logged-in Chrome session. Use when the user asks for a Helix/BMC dashboard, report, panel or KPI over ITSM data (incidents, changes, problems, assets), or to move a dashboard between Helix environments.
---

# BMC Helix Dashboards

Helix Dashboards is Grafana 12 behind Helix's RSSO single sign-on. **The API only works from inside a logged-in browser tab**: Grafana service-account tokens and Helix access-key JWTs are rejected (401) from outside. Don't retry those routes; work through Claude in Chrome.

Templates bundled with this skill (paths relative to its base directory, which is shown when the skill loads):
- `scripts/incidentes_backlog.js`: an analyst incident-backlog dashboard with chained filters, KPIs, aging, trend, group/analyst load and detail. Portable: it finds the datasource and template target on its own in each environment.

Each person uses their own Helix session: never ask for or store passwords, tokens or access keys.

## 1. Connect
1. Load the Claude in Chrome tools (one ToolSearch call) and run `tabs_context_mcp`. If no browser shows up, `list_connected_browsers`; if the list is empty, ask the user to open the extension's side panel and sign in.
2. Ask for the environment's URL if it isn't known (e.g. `https://<tenant>.onbmc.com/dashboards/`). Open it in a tab of Claude's group; the user's Helix session carries over.
3. **Production** (no "dev"/"qa"/"test" in the host, or the user says so): confirm with the user before every create, modify or delete. Always write to its own folder (`Claude`) and never touch BMC's dashboards.

## 2. Reconnoiter the environment (read-only, with `javascript_tool`)
All calls go to `fetch('/dashboards/api/...', {credentials:'include'})`:
- `/api/frontend/settings` (version), `/api/user` + `/api/user/orgs` (role: must be Editor/Admin to create).
- `/api/datasources`: the ITSM one is type `bmchelix-ade-datasource` (its uid **changes per environment**).
- Find a panel on a BMC dashboard (e.g. "Aging Incident Analysis") whose target has `sourceType: 'remedy'` and `sourceQuery.queryType: 'SQL'`; it's the **target template** (clone it, strip `$$hashKey`, replace `rawQuery`, `formatAs`, `refId`, a new `guid`, and `datasource: {type, uid}`).
- Don't print cookies or headers (the extension blocks them, and they're secrets).

## 3. Test SQL before building
The plugin runs in the browser: `/api/ds/query` returns "plugin unavailable". To test, intercept the plugin's call and reuse its headers without showing them:
```js
const prev = window.fetch; window.fetch = function(u, o) { const url = typeof u==='string'?u:u.url;
  if (url.includes('arsqlquery')) { window.__url = url; window.__hdr = o.headers; } return prev.apply(this, arguments); };
document.querySelector('[data-testid="data-testid RefreshPicker run button"]').click();  // on a dashboard with Helix panels
// then:
await prev(window.__url, {method:'POST', credentials:'include', headers: window.__hdr,
  body: JSON.stringify({date_format:'DD/MM/YYYY', date_time_format:'DD/MM/YYYY HH:MM:SS', output_type:'Table', sql: '... LIMIT 5 OFFSET 0'})}).then(r=>r.text())
```
The hook is lost on page navigation; set it again.

## 4. AR SQL rules (tested)
- Forms and fields in backticks: `` `HPD:Help Desk`.`Status` ``. Incidents `HPD:Help Desk`; other common ones: `CHG:Infrastructure Change`, `PBM:Problem Investigation`, `HPD:Help_Desk_Archive`.
- Open incident: `` `Status` < 'Resolved' ``; resolved/closed: `>= 'Resolved'`. Enum labels in Spanish ('Crítica', 'Asignado') and English ('Critical') both work in `IN (...)`.
- Time range: `` `Submit Date` >= $__from/1000 AND `Submit Date` <= $__to/1000 `` (epoch seconds).
- Time series: `` DATE(col) AS __time__ `` + `GROUP BY DATE(col)` and `formatAs: 'TimeSeries'`.
- `DATEDIFF` only accepts `'day'` or `'second'` (hours = seconds/3600.0). `currentDate()` = today.
- `CASE`, `SUM(CASE ...)`, `GROUP BY`, `ORDER BY`, `LIMIT` work. `CASE` over an **enum** field (e.g. `Reported Source`) fails: label NULLs with a Grafana value mapping (`special` → `null+nan`).
- The plugin appends `LIMIT 2000 OFFSET 0`.

## 5. Variables (filters)
- Query: `remedy,{"sql": "SELECT DISTINCT `HPD:Help Desk`.`Company` FROM `HPD:Help Desk`"}` in both `query` and `definition`; `refresh: 1`.
- Multi-select with "All" that keeps NULLs: `multi: true, includeAll: true, allValue: "'__ALL__'"`, and in SQL
  `` (col IN (${v:sqlstring}) OR '__ALL__' IN (${v:sqlstring})) ``.
- Chain variables by putting that same clause in the dependent variable's query (company → org → group).

## 6. Create or update
- `POST /api/folders {title}` if the folder doesn't exist; `POST /api/dashboards/db {dashboard, folderUid, overwrite:false, message}`.
- To update: GET the current one, edit it, and resend with its `id` and `version` (that keeps the history; the user can go back from Settings → Versions).
- To run the template in another environment: Read `scripts/incidentes_backlog.js` (in this skill's base directory), adjust `CONFIG` (uid/title/folder/overwrite) and pass the whole file as `javascript_tool` text. It finds the datasource and template target on its own.
- Test copies: use a distinct uid and delete them afterwards (`DELETE /api/dashboards/uid/<uid>`) — only the ones you created.

## 7. Verify and report
- Open the dashboard, wait ~10 s, screenshot; check for panels with ⚠ or "No data". `?viewPanel=panel-<id>` opens a single panel.
- Reconcile totals (e.g. backlog against `COUNT` without filters) and try one filter via URL (`&var-company=...`).
- Send the screenshot with SendUserFile and summarize what each section shows, plus anything that stands out in the data.

## 8. Promote between environments
1. Build and validate in dev.
2. With the destination open (and a production confirmation), run the template, or GET the dev JSON and repost it at the destination replacing every `datasource.uid` with the destination's.
3. Check that the forms/fields exist at the destination (step 3) and compare totals with ITSM there.
