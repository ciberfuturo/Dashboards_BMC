# Plugin helix-dashboards para Claude Code

Permite pedirle a Claude, en lenguaje natural, que **cree, mejore o promueva dashboards de BMC Helix Dashboards**
(Grafana) en cualquier ambiente: desarrollo, QA o producción.

Claude trabaja a través de **tu propia sesión de Chrome**, así que no hacen falta tokens ni access keys, y todo lo que
crea queda registrado a tu nombre en el historial de Grafana.

## Requisitos
1. **Claude Code**: app de escritorio (pestaña *Code*) o CLI, con tu cuenta de Claude.
2. **Extensión Claude in Chrome**: https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn.
   Abre su panel lateral e inicia sesión con la misma cuenta de Claude.
3. **Usuario de BMC Helix** con rol **Editor o Admin** en Helix Dashboards en el ambiente donde vayas a trabajar.

## Instalación
En Claude Code, ejecuta:

```
/plugin marketplace add <URL-del-repositorio>
/plugin install helix-dashboards@axity-helix
```

`<URL-del-repositorio>` puede ser `organizacion/repositorio` (GitHub) o la URL git completa (GitLab, Azure DevOps, etc.).
Si el repositorio es privado, tu git local debe tener acceso a él.

Para recibir mejoras más adelante: `/plugin marketplace update axity-helix`.

## Uso
1. En Chrome, inicia sesión en el ambiente de Helix (por ejemplo `https://<tenant>.onbmc.com/dashboards/`).
2. Pídele a Claude lo que necesites. Por ejemplo:
   - *"Crea en https://<tenant>.onbmc.com el dashboard de backlog de incidentes de la plantilla"*
   - *"Haz un dashboard de cambios por estado y grupo de los últimos 90 días, con filtro por compañía"*
   - *"Mejora el dashboard X: agrega tendencia mensual y tabla de detalle"*
   - *"Lleva el dashboard de incidentes de desarrollo a QA"*
3. Antes de crear, Claude revisa el ambiente y prueba las consultas. Luego crea el dashboard en la carpeta `Claude`
   y te muestra una captura.

En **producción**, Claude pide confirmación antes de crear, modificar o borrar cualquier cosa, y nunca toca los
dashboards de BMC.

## Contenido
| Ruta | Qué es |
|---|---|
| `plugins/helix-dashboards/skills/helix-dashboards/SKILL.md` | Procedimiento y reglas (SQL de AR, filtros, verificación, promoción) |
| `plugins/helix-dashboards/skills/helix-dashboards/scripts/incidentes_backlog.js` | Plantilla portable: backlog de incidentes para analistas |

## Agregar plantillas
Crea un nuevo `scripts/<nombre>.js` siguiendo el formato de `incidentes_backlog.js` (bloque `CONFIG` arriba;
detecta el datasource y el target de ejemplo del ambiente), menciónalo en `SKILL.md`, sube la `version` en
`plugin.json` y en `marketplace.json`, y haz commit y push.

## Limitaciones conocidas
- El acceso a la API de Helix Dashboards solo funciona desde el navegador con sesión iniciada. El SSO de Helix (RSSO)
  rechaza los tokens de Grafana y de las access keys desde fuera del navegador.
- Las consultas del datasource "BMC Helix" en modo SQL devuelven como máximo 2000 filas.
