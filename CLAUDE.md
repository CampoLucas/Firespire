# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Firespire: web app para el NASA Space Apps Challenge 2026 (*MODIS and VIIRS Hot Spots*) que muestra focos de calor de NASA FIRMS en Argentina, armonizando MODIS y VIIRS. Los docs de `docs/` (en español, formato OKF, todo en `draft`) son la referencia de producto y método: empezá por `docs/index.md`. Las decisiones abiertas están en `docs/decisiones.md`.

## Estado real vs. objetivo

Existe un primer slice vertical: `pipeline/` (Python) y `web/` (Next.js). Todavía **no** están implementados: baseline y anomalías, `daily.bin`, eventos/museo, proxy `hotspots.csv`, vistas Map/Museum/Today, ni el port del globo a React. Antes de asumir que algo existe, verificalo en el código.

Datos de hoy (artefactos `v1-nrt`, los que sirve `latest.json`):
- SP de `fuentes/`: MODIS y VIIRS NOAA-20, 2023–2024.
- NRT de la API en `fuentes/nrt/` (no versionado): las cuatro fuentes, 2026-09-01 a 2026-11-14, provisorio.
- 2025-01 a 2026-08 no tiene datos: la web lo muestra como "no data".
- **k está sesgado**: V3 se calibró solo con NOAA-20 SP, pero en 2026 observan S-NPP + NOAA-20 + NOAA-21, y la serie armonizada da ~2× MODIS en sep–oct 2026 (vs ~0,9–1,2 en 2023–2024). Se corrige bajando `VIIRS_SNPP_SP` y `VIIRS_NOAA21_SP` (disponibles por API hasta 2026-07-31); `fetch` todavía solo baja fuentes NRT.

## Comandos

- `uv` está en `~/.local/bin` (puede hacer falta agregarlo al PATH). No hay Python de sistema: el toolchain lo maneja uv.
- Pipeline (dentro de `pipeline/`):
  - `uv sync`
  - `uv run firespire fetch --start 2026-09-01` baja NRT de FIRMS a `../fuentes/nrt/` (también `--days N`, `--end`, `--sources`). Necesita `FIRMS_MAP_KEY` en el entorno o en `web/.env.local`.
  - `uv run firespire build ../fuentes ../fuentes/nrt --version v1-nrt` (acepta varias carpetas; escribe `web/public/artifacts/<version>/` y apunta `latest.json` a esa versión)
  - `uv run pytest`; un test: `uv run pytest tests/test_calibrate.py::test_name`
  - `uv run ruff check`
- Web (dentro de `web/`):
  - `npm install`, `npm run dev`, `npm run build`, `npm run lint`
  - `npm test` (vitest); un test: `npx vitest run lib/__tests__/<archivo> -t "<nombre>"`
- Globo: `uv run firespire globe ../fuentes/nrt [--years 2026]` (dentro de `pipeline/`) escribe `web/public/globe/data/data-YYYY.js` y rehace `years.js` con todos los años presentes. Mismo formato que `prep.py`, pero asigna provincias con `provincias.geojson` (el índice `prov` sigue el orden de `provincias.js`) y suma todos los satélites VIIRS del año. Así se generó `data-2026.js`.
- Legado: `python -I prep.py fuentes` (raíz) también escribe `web/public/globe/data/*.js`, pero necesita `fuentes/provincias_ign.json` (111 MB, en `.gitignore`, no está en el repo) y toma un solo archivo VIIRS por año. `data-2023/2024/2025.js` salieron de ahí; los CSV de 2025 no están en el repo.

## Arquitectura

- **Pipeline** (`pipeline/src/firespire/`): `cli.py` orquesta `ingest` → `filters` → `celldays.assign_cells` → `mask` → `celldays.build` → `calibrate` → `validate` → `export`. Tablas DuckDB: `detections`, `detections_filtered`, `det_cells`, `masked_cells`, `cell_days` (detalle en `docs/contratos.md`).
- **Descarga** (`fetch.py`): usa `/api/area` con el recuadro de Argentina y recorta con `pipeline/resources/provincias.geojson`, porque `/api/country` responde "Invalid API call". Todas las fuentes comparten una ventana de fechas: con ventanas distintas, un mes queda con días de un sensor sin el otro y la serie se infla. Los CSV NRT no traen `type`, por eso los filtros aceptan `type` vacío en ambas familias.
- **Huecos de cobertura**: `meta.months_without_data` lista por familia los meses sin filas; la web los muestra como `no_data`, no como cero. La máscara de persistentes cuenta días con datos, no el rango calendario.
- **Artefactos**: `web/public/artifacts/<version>/` con `meta.json`, `cells.json`, `monthly.bin`, `calibration.json`, `validation.json`; más `web/public/artifacts/latest.json`.
- **Regla del método**: el método vive solo en Python. La web solo aplica `calibration.json` (serie armonizada = k × celda-días VIIRS desde `harmonized_start`).
- **Tres lugares que cambian juntos**: `web/lib/artifact-types.ts`, `pipeline/src/firespire/config.py` y `docs/contratos.md`. Si cambia uno, revisar los otros dos.
- **`web/lib/`**: `artifacts.ts` es seguro para el browser (sin `fs`); `artifacts.server.ts` usa `fs` y solo corre en server; `harmonize.ts` aplica la calibración.
- **API**: `/api/v1/series`, `/api/v1/validation`, `/api/v1/export.csv`. Vercel corta respuestas a 4.5 MB, así que los artefactos se sirven siempre como archivos estáticos, no por función. `artifacts.server.ts` cachea los artefactos en memoria: después de un `build` hay que reiniciar `npm run dev` para que la API vea los nuevos.
- **Globo**: `web/public/globe/` es el entregable visual, un `index.html` estático servido en `/globe/index.html`.
- **Regla del globo**: las capas de actividad, el historial y las alertas conservan sus datos reales de FIRMS. Museum of Fires agrega una capa documental separada de exhibiciones ficticias, con rótulos visibles y sin vínculos inferidos con detecciones reales.
- **Alertas y planificación**: muestran actividad observada en los 7 días que terminan en la fecha elegida, en zonas H3 res 4 (celda y vecinas), con niveles por cantidad de focos (≥5, 15, 40, 100). La planificación toma los últimos 7 días con datos hasta hoy (o `?hoy=AAAA-MM-DD`).
- **Zonas prioritarias**: son marcas del usuario guardadas en `localStorage`. No agregues nada que no venga de la API sin acordarlo con el equipo.

## Convenciones

- Idioma: UI y README en inglés (la entrega y la app van en inglés); `docs/` y comentarios de código en español rioplatense.
- Antes de escribir código Next.js, leer `web/AGENTS.md`: Next 16 tiene cambios incompatibles con versiones anteriores.
- Mantener `FIRMS_MAP_KEY` solo del lado servidor y fuera del repo (ver `web/.env.example`). `fetch` nunca la imprime: no la pongas en logs, URLs de commits ni mensajes de error. Límite: 5.000 transacciones cada 10 minutos; un pedido de área cuesta ~4.
- Los artefactos no se editan a mano: se regeneran con `firespire build`.
