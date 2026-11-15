---
type: Reference
title: "Firespire — contratos de datos"
description: "Contrato entre pipeline y web: tablas DuckDB intermedias, interfaces de los módulos Python y esquema de los artefactos v1."
tags: ["firespire", "nasa-space-apps-2026", "arquitectura", "contrato"]
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-14T21:45:00-03:00"
---
# Resumen
- Es el contrato que comparten `pipeline/` (Python) y `web/` (Next.js). Si cambia algo acá, cambian los dos lados.
- Fuentes de verdad en código: `pipeline/src/firespire/config.py` (parámetros) y `web/lib/artifact-types.ts` (tipos de artefactos y firmas de la web).
- Concreta, para el primer slice, lo que [Arquitectura y método](arquitectura.md) propone como esquema.

# Pipeline
## Etapas y módulos
Todas reciben una conexión DuckDB (`con`) y crean o reemplazan tablas. Corren en este orden desde `cli.py`.

| Orden | Función | Lee | Crea |
|---|---|---|---|
| 1 | `ingest.ingest(con, folders: list[Path]) -> None` | CSV | `detections` |
| 2 | `filters.apply(con) -> None` | `detections` | `detections_filtered` |
| 3 | `celldays.assign_cells(con) -> None` | `detections_filtered` | `det_cells` |
| 4 | `mask.build(con) -> None` | `det_cells` | `masked_cells` |
| 5 | `celldays.build(con) -> None` | `det_cells`, `masked_cells` | `cell_days` |
| 6 | `calibrate.compute(con) -> dict` | `cell_days` | — (devuelve `calibration.json`) |
| 7 | `validate.compute(con) -> dict` | `cell_days` | — (devuelve `validation.json`) |
| 8 | `export.write(con, calibration, validation, out_dir: Path, version: str) -> Path` | `cell_days`, `masked_cells` | artefactos |

CLI: `uv run firespire build <carpeta_csv>... [--version v0] [--out web/public/artifacts]`.

## Descubrimiento de archivos
- `modis_YYYY_<País>.csv` → familia MODIS; el satélite sale de la columna `satellite`.
- `viirs-<clave>_YYYY_<País>.csv` → familia VIIRS; el satélite sale de `<clave>` con `config.VIIRS_FILE_SATELLITE` (`snpp`, `jpss1`, `jpss2`). Los nombres para S-NPP y NOAA-21 no están verificados contra una descarga real. [sin verificar]
- Una clave desconocida es un error, no se ignora.

## Tabla `detections`
| Columna | Tipo | Notas |
|---|---|---|
| `family` | VARCHAR | `MODIS` \| `VIIRS` |
| `satellite` | VARCHAR | `Terra`, `Aqua`, `SNPP`, `N20`, `N21` |
| `lat`, `lon` | DOUBLE | |
| `acq_date` | DATE | día UTC |
| `acq_time` | VARCHAR | `HHMM` UTC, con ceros a la izquierda |
| `confidence_raw` | VARCHAR | valor original (`0`–`100` o `l/n/h`) |
| `confidence_class` | TINYINT | 0 baja, 1 nominal, 2 alta. MODIS: ≥ 80 → 2, ≥ 30 → 1 |
| `type` | TINYINT | NULL si el CSV no trae la columna |
| `frp` | DOUBLE | |
| `daynight` | VARCHAR | `D` \| `N` |
| `product` | VARCHAR | `NRT` si `version` termina en `NRT`; si no, `SP` |

## Filtros (`detections_filtered`, mismas columnas)
- MODIS: confianza numérica ≥ `MODIS_MIN_CONFIDENCE`, y `type = 0` cuando `type` no es NULL.
- VIIRS: confianza fuera de `VIIRS_DROP_CONFIDENCE`, y `type = 0` cuando `type` no es NULL.
- Los CSV NRT de la API no traen `type` (verificado el 2026-11-14 con `/api/area`); en esos datos las fuentes estáticas solo las saca la máscara de persistentes.

## Descarga NRT
- `uv run firespire fetch [--days 30 | --start YYYY-MM-DD] [--end YYYY-MM-DD]` baja `MODIS_NRT`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT` y `VIIRS_NOAA21_NRT` a `fuentes/nrt/` con los nombres de arriba.
- Usa `/api/area` con el recuadro `-74,-56,-53,-21` en pedidos de hasta 5 días y recorta con `provincias.geojson` (margen de 0,05°). El endpoint `/api/country` responde "Invalid API call" (verificado el 2026-11-14).
- Todas las fuentes usan una ventana común (si no, un mes tendría días de un sensor sin el otro); cada una se recorta a lo que informa `/api/data_availability`. Para meses comparables, empezar el día 1 con `--start`. La MAP_KEY sale de `FIRMS_MAP_KEY` o de `web/.env.local`.

## Tabla `det_cells`
`detections_filtered` más la columna `h3` (VARCHAR, celda de resolución `H3_RES` calculada con `h3.latlng_to_cell`).

## Tabla `masked_cells`
- Columna `h3`. Celdas con detección (de cualquier familia) en más de `MASK_FRACTION` de los días con datos, si hay al menos `MASK_MIN_DAYS` días con datos.
- Días con datos = fechas distintas con al menos una fila en `det_cells`. Así los huecos de cobertura (años sin CSV) no diluyen la fracción.

## Tabla `cell_days`
Una fila por celda × día × satélite × producto, sin las celdas enmascaradas.

| Columna | Tipo |
|---|---|
| `h3` | VARCHAR |
| `date` | DATE |
| `family` | VARCHAR |
| `satellite` | VARCHAR |
| `product` | VARCHAR |
| `n` | INTEGER (detecciones) |

- **Celda-día de una familia** = existe al menos una fila de esa familia para `(h3, date)`. Varias filas (dos satélites el mismo día) cuentan una sola vez.
- **Focos** = suma de `n`.

# Método
- **Mes** = mes calendario UTC, `YYYY-MM`.
- **Mes provisorio** = tiene al menos una fila `NRT`. `first_provisional_month` es el primero; los meses desde ahí no entran a la calibración.
- **Régimen de un mes** = último régimen de `config.REGIMES` con `start` ≤ día 1 del mes.
- **k de un régimen** = Σ celda-días MODIS / Σ celda-días VIIRS sobre sus meses no provisorios, sumando todas las celdas. `method: "direct"`.
- Régimen sin meses no provisorios: se estima con los meses SP del régimen anterior quitando las filas de `SNPP` (`method: "drop_snpp"`). Si el régimen anterior no tiene filas de `SNPP` o no hay datos, `k: null` y `method: "none"`.
- **Serie armonizada** de una celda-mes: celda-días MODIS si el mes es anterior a `HARMONIZED_START`; si no, `k × celda-días VIIRS`. La calcula la web.
- **Holdout**: k estimado con todos los meses SP menos los últimos 12, aplicado a esos 12. Se informa `mape_monthly` y `bias_total`. Con menos de 24 meses SP: `skipped`.
- **Caída de S-NPP**: desde 2025-01, comparar `k_V3 × VIIRS` con `k_drop × VIIRS sin SNPP` contra MODIS. Sin filas de `SNPP`: `skipped`.

# Artefactos v1
Destino: `web/public/artifacts/<version>/`, más `web/public/artifacts/latest.json` = `{"version": "<version>"}`. Los tipos exactos están en `web/lib/artifact-types.ts`.

| Archivo | Contenido |
|---|---|
| `meta.json` | `schema`, `version`, `generated_at`, `h3_res`, `first_month`, `n_months`, `first_provisional_month`, `n_cells`, `filters`, `satellites`, `warnings`, `monthly.blocks` |
| `cells.json` | `h3[]` (orden lexicográfico), `prov[]` (índice de provincia, -1 si ninguna), `provinces[]` |
| `monthly.bin` | cuatro bloques consecutivos, ver abajo |
| `calibration.json` | `scale`, `harmonized_start`, `regimes[]` |
| `validation.json` | `holdout`, `snpp_drop` |

## `monthly.bin`
- Rango de meses: del mes de la primera fecha al mes de la última, sin huecos.
- Bloques en este orden, cada uno con `n_cells × n_months` elementos, índice `cell × n_months + month`:

| Bloque | Tipo | Contenido |
|---|---|---|
| `celldays_modis` | `uint8` | celda-días MODIS del mes (0–31) |
| `celldays_viirs` | `uint8` | celda-días VIIRS del mes (0–31) |
| `hotspots_modis` | `uint16` little-endian | focos MODIS, con tope 65535 |
| `hotspots_viirs` | `uint16` little-endian | focos VIIRS, con tope 65535 |

- Los offsets en bytes están en `meta.monthly.blocks`. El offset de un bloque `uint16` puede ser impar: el lector tiene que copiar el tramo (`buffer.slice`) antes de crear el `Uint16Array`.
- Tamaño total: `n_cells × n_months × 6` bytes.

## Provincias
- `pipeline/resources/provincias.geojson`: FeatureCollection con `properties.name`, derivada de `web/public/globe/data/provincias.js`.
- Cada celda se asigna a la provincia que contiene su centro. Si falta el archivo, todas quedan en -1 y se agrega un aviso en `meta.warnings`.

## Avisos de cobertura
`meta.warnings` lleva una frase en inglés por cada problema: satélite esperado por un régimen sin datos, familia sin datos en parte del rango, régimen sin k.

# API v1 (este slice)
| Endpoint | Parámetros | Devuelve |
|---|---|---|
| `GET /api/v1/series` | `source` (`harmonized` por defecto, `modis`, `viirs`), `province` (nombre), `from`, `to` (`YYYY-MM`) | JSON `{version, source, province, points: SeriesPoint[]}` |
| `GET /api/v1/validation` | — | `validation.json` + `calibration.json` |
| `GET /api/v1/export.csv` | `province`, `from`, `to` | `h3_cell, month, celldays_modis, celldays_viirs, celldays_harmonized, hotspots_modis, hotspots_viirs, provisional` |

- Parámetro inválido → 400 con `{error}`.
- `export.csv` omite las filas con todo en cero y corta con 413 si la respuesta supera 4 MB (límite de 4,5 MB de las funciones de Vercel): el mensaje pide achicar provincia o rango.
