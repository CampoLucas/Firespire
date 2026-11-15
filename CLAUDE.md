# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Firespire: web app para el NASA Space Apps Challenge 2026 (*MODIS and VIIRS Hot Spots*) que muestra focos de calor de NASA FIRMS en Argentina, armonizando MODIS y VIIRS. Los docs de `docs/` (en español, formato OKF, todo en `draft`) son la referencia de producto y método: empezá por `docs/index.md`. Las decisiones abiertas están en `docs/decisiones.md`.

## Estado real vs. objetivo

Existe un primer slice vertical: `pipeline/` (Python) y `web/` (Next.js). Todavía **no** están implementados: baseline y anomalías, `daily.bin`, eventos/museo, proxy `hotspots.csv`, vistas Map/Museum/Today, ni el port del globo a React. La calibración corre sobre datos incompletos (solo NOAA-20, 2023–2024), así que los factores k son provisorios. Antes de asumir que algo existe, verificalo en el código.

## Comandos

- `uv` está en `~/.local/bin` (puede hacer falta agregarlo al PATH). No hay Python de sistema: el toolchain lo maneja uv.
- Pipeline (dentro de `pipeline/`):
  - `uv sync`
  - `uv run firespire build ../fuentes --version v0`
  - `uv run pytest`; un test: `uv run pytest tests/test_calibrate.py::test_name`
  - `uv run ruff check`
- Web (dentro de `web/`):
  - `npm install`, `npm run dev`, `npm run build`, `npm run lint`
  - `npm test` (vitest); un test: `npx vitest run lib/__tests__/<archivo> -t "<nombre>"`
- Legado: `python -I prep.py fuentes` (raíz) regenera `web/public/globe/data/*.js`. Necesita `numpy`, `pandas` y `fuentes/provincias_ign.json` (111 MB, en `.gitignore`, no está en el repo); sin ese archivo no corre.

## Arquitectura

- **Pipeline** (`pipeline/src/firespire/`): `cli.py` orquesta `ingest` → `filters` → `celldays.assign_cells` → `mask` → `celldays.build` → `calibrate` → `validate` → `export`. Tablas DuckDB: `detections`, `detections_filtered`, `det_cells`, `masked_cells`, `cell_days` (detalle en `docs/contratos.md`).
- **Artefactos**: `web/public/artifacts/<version>/` con `meta.json`, `cells.json`, `monthly.bin`, `calibration.json`, `validation.json`; más `web/public/artifacts/latest.json`.
- **Regla del método**: el método vive solo en Python. La web solo aplica `calibration.json` (serie armonizada = k × celda-días VIIRS desde `harmonized_start`).
- **Tres lugares que cambian juntos**: `web/lib/artifact-types.ts`, `pipeline/src/firespire/config.py` y `docs/contratos.md`. Si cambia uno, revisar los otros dos.
- **`web/lib/`**: `artifacts.ts` es seguro para el browser (sin `fs`); `artifacts.server.ts` usa `fs` y solo corre en server; `harmonize.ts` aplica la calibración.
- **API** (planificada): `/api/v1/series`, `/api/v1/validation`, `/api/v1/export.csv`. Vercel corta respuestas a 4.5 MB, así que los artefactos se sirven siempre como archivos estáticos, no por función.
- **Globo legado**: `web/public/globe/` es el prototipo estático, servido en `/globe/index.html`. Su vista de planificación usa datos simulados (cuarteles y reportes inventados en `localStorage`); no presentarlos como reales (ver `docs/diseno.md`).

## Convenciones

- Idioma: UI y README en inglés (la entrega y la app van en inglés); `docs/` y comentarios de código en español rioplatense.
- Antes de escribir código Next.js, leer `web/AGENTS.md`: Next 16 tiene cambios incompatibles con versiones anteriores.
- Mantener `FIRMS_MAP_KEY` solo del lado servidor y fuera del repo (ver `web/.env.example`).
- Los artefactos no se editan a mano: se regeneran con `firespire build`.
