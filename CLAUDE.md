# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Firespire: web app para el NASA Space Apps Challenge 2026 (*MODIS and VIIRS Hot Spots*) que muestra focos de calor de NASA FIRMS en Argentina. Los docs de `docs/` (en español, formato OKF con frontmatter, todo en `draft`) son la referencia de producto y método: empezá por `docs/index.md`. Las decisiones abiertas están en `docs/decisiones.md`.

## Estado real vs. objetivo

El repo hoy es un **prototipo estático**; la arquitectura de `docs/arquitectura.md` (pipeline Python + DuckDB, web Next.js, armonización MODIS/VIIRS, API v1) es **objetivo, todavía no existe en código**. Antes de asumir que algo existe, verificalo en el código. La rama `feature/infra-kick-off` es para arrancar esa infraestructura.

## Comandos

No hay build, linter ni tests.

- **Ver la app:** servir la raíz con cualquier server estático (`python -m http.server`) y abrir `index.html`. `?debug=1` activa el modo debug. Requiere internet (globe.gl, h3-js y texturas por CDN, fuentes de Google).
- **Regenerar datos:** `python -I prep.py fuentes` (acepta varias carpetas de CSV). Necesita `numpy` y `pandas`, y **`fuentes/provincias_ign.json` (111 MB, en `.gitignore`, no está en el repo)**; sin ese archivo no corre. Escribe `data/data-YYYY.js`, `data/years.js` y `data/provincias.js`.

## Arquitectura del prototipo

- `prep.py` lee `modis_YYYY_Argentina.csv` y `viirs-*_YYYY_Argentina.csv`, asigna provincia, clasifica confianza (MODIS ≥80→2, ≥30→1, resto 0; VIIRS l/n/h→0/1/2) y agrega en celdas de 0,1° por `(day, inst, dn, conf, prov, iy, ix)` con `n` (focos) y `f` (suma FRP). Guarda `inst` (MODIS/VIIRS) pero **no el satélite**, **no filtra `type`** ni enmascara fuentes persistentes, y no armoniza nada.
- `data/data-YYYY.js` son salidas generadas, columnares, de ~3 MB cada una, cargadas con `<script>` dinámico (`loadYear`). No editar a mano; regenerar con `prep.py`. `fuentes/` guarda los CSV crudos (solo hay 2023–2024; `data-2025.js` y `years.js` ya incluyen 2025).
- `index.html` es toda la app (HTML, CSS y un `<script type="module">` de ~900+ líneas): estado en el objeto `st`, agrega las celdas de 0,1° a H3 res 2–5 en el navegador (`aggregate`), y dibuja con globe.gl en tres modos (hexágonos, mapa de calor, áreas). También tiene alertas (ventana de 7 días, H3 res 4 + `gridDisk(1)`, niveles por cantidad de focos) y una vista de planificación.
- La vista de **planificación usa datos simulados** (cuarteles y reportes inventados, guardados en `localStorage`). No presentarlos como reales (ver `docs/diseno.md`).

## Convenciones

- Idioma: español rioplatense en docs y UI actual; la entrega al challenge y la app final van en inglés.
- Mantener `FIRMS_MAP_KEY` solo del lado servidor y fuera del repo si se agrega acceso a la API de FIRMS.
