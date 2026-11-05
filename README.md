# Automechanika Shanghai 26 · Lizarte

App móvil (PWA) para preparar y seguir la visita a Automechanika Shanghai 2026 (2 al 5 de diciembre, NECC Shanghái).

**Dirección:** https://krumkk.github.io/AutoMechaNiKa-Shanghai-26/

## Pestañas

| Pestaña | Contenido |
|---|---|
| General | Datos de la feria, cuenta atrás, vuelos, hoteles y notas del viaje |
| Eventos | Automechanika Shanghai (empresas de la feria) y Visita a empresas. Cada empresa tiene su ficha con notas y fotos de cada usuario |
| Ruta stands | Recorrido ordenado por pabellón y stand, o importantes primero; se marcan los stands visitados |
| Resumen | Cifras y todo lo anotado en las fichas; exportación a Excel |
| Presentaciones | Vídeo corporativo, brochure, OEM · TIER1, Reman y Diversificación |

## Usuarios

Krum y Scrum. Cada uno escribe en su propio bloque de notas y fotos y ve el del otro en solo lectura.
La contraseña de cada usuario se crea la primera vez que entra en cada dispositivo.

## Dónde se guardan los datos

`config.js` → `SHAREPOINT.activo`:

* `false`: todo se guarda en el propio dispositivo (IndexedDB).
* `true`: se guarda en el SharePoint de Lizarte, carpeta `Automechanika-Shanghai-2026` del sitio `MisionesComercialesICEX`, por la misma vía que la app Misión China 2026. Ver `SERVIDOR.md`.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css` | Página y estilos |
| `app.js` | Pantallas y lógica |
| `store.js` | Guardado en el dispositivo o en SharePoint |
| `config.js` | Usuarios, fechas y conexión |
| `sw.js` | Funcionamiento sin conexión y actualizaciones |
| `Presentaciones/`, `brochure-liz-china.html` | Material corporativo |
