# Instalación sin GitHub — plugin helix-dashboards

Con este plugin, Claude crea y mejora dashboards de BMC Helix Dashboards a partir de lo que le pidas en texto.

## Antes de empezar (una sola vez)
1. **Claude Code** instalado: app de escritorio (pestaña *Code*) o la terminal, con tu cuenta de Claude.
2. **Extensión Claude in Chrome**: https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn
   Instálala, abre su panel lateral (ícono de Claude en Chrome) e inicia sesión con tu misma cuenta de Claude.
3. **Tu usuario de BMC Helix** con rol **Editor o Admin** en Helix Dashboards.

## Paso 1: descomprimir
Descomprime este ZIP en una carpeta fija que no vayas a borrar, por ejemplo:

```
C:\Herramientas\helix-dashboards-plugin
```

(Dentro deben quedar las carpetas `.claude-plugin` y `plugins` y este archivo.)

## Paso 2: instalar (elige UNA opción)

### Opción A: como plugin (recomendada)
En Claude Code escribe estos dos comandos, uno por uno:

```
/plugin marketplace add C:\Herramientas\helix-dashboards-plugin
/plugin install helix-dashboards@axity-helix
```

Los comandos `/plugin` se escriben en una sesión de `claude` en la terminal. Si tu app de escritorio tiene un
gestor de plugins, también puedes agregar ahí la carpeta como marketplace.

### Opción B: como skill (sin comandos)
Copia la carpeta

```
C:\Herramientas\helix-dashboards-plugin\plugins\helix-dashboards\skills\helix-dashboards
```

dentro de

```
C:\Users\<tu usuario>\.claude\skills\
```

para que quede así: `C:\Users\<tu usuario>\.claude\skills\helix-dashboards\SKILL.md`.
Si la carpeta `skills` no existe, créala. Después cierra y vuelve a abrir Claude Code.

**No uses las dos opciones a la vez**: tendrías el skill duplicado.

## Paso 3: usarlo
1. En Chrome, inicia sesión en tu ambiente de Helix (por ejemplo `https://<tenant>.onbmc.com/dashboards/`).
2. En Claude Code, pide lo que necesites. Por ejemplo:
   - *"Crea en https://<tenant>.onbmc.com el dashboard de backlog de incidentes de la plantilla"*
   - *"Haz un dashboard de cambios por estado y grupo de los últimos 90 días, con filtro por compañía"*
   - *"Mejora el dashboard X: agrega una tendencia mensual"*
3. Claude revisa el ambiente, prueba las consultas, crea el dashboard en la carpeta **Claude** y te muestra una captura.
   En producción te pedirá confirmación antes de cualquier cambio.

## Actualizar a una versión nueva
1. Reemplaza la carpeta `C:\Herramientas\helix-dashboards-plugin` por la del ZIP nuevo.
2. Si usaste la **Opción A**: `/plugin marketplace update axity-helix`.
   Si usaste la **Opción B**: vuelve a copiar la carpeta del skill.

## Problemas comunes
| Síntoma | Solución |
|---|---|
| Claude dice que Chrome no está conectado | Abre el panel lateral de la extensión y verifica que iniciaste sesión con la misma cuenta de Claude |
| "Permission denied" o 403 al crear el dashboard | Tu usuario necesita rol Editor o Admin en Helix Dashboards |
| Claude no reconoce el skill | Revisa la ruta del Paso 2 y reinicia Claude Code |
