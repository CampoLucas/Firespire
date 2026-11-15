---
type: Concept
title: "Firespire — arquitectura y método"
description: "Estado implementado en el repo (prep.py + index.html estático), arquitectura objetivo, datos FIRMS, método de armonización MODIS/VIIRS, artefactos y API."
tags: ["firespire", "nasa-space-apps-2026", "modis-viirs", "arquitectura"]
sources:
  - "https://firms.modaps.eosdis.nasa.gov/api/area/"
  - "/inbox/resumen-contexto-modis-viirs-2026-11-14.md"
origin_default: relato
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-14T21:05:00-03:00"
---
# Resumen
- **Hoy (en el repo):** sitio estático de un solo `index.html` (globe.gl + h3-js + Leaflet) que lee `data/*.js` generados por `prep.py` a partir de los CSV anuales por país de FIRMS. Tiene años 2023–2025, solo VIIRS NOAA-20 y **sin armonización**. [hecho, leído del código]
- **Objetivo:** pipeline Python + DuckDB que arma la serie armonizada 2000–hoy en celda-días H3 y publica artefactos versionados; web Next.js en Vercel que filtra en el navegador y expone una API v1 de solo lectura.
- **Brecha principal:** el método de armonización todavía no existe en código. [inferencia]

# Estado implementado
## Componentes
| Pieza | Qué hace |
|---|---|
| `fuentes/*.csv` | CSV anuales de FIRMS por país: `modis_YYYY_Argentina.csv` y `viirs-jpss1_YYYY_Argentina.csv` (2023 y 2024) |
| `fuentes/provincias_ign.json` | Límites provinciales (111 MB). Está en `.gitignore` y **no está en el repo**: `prep.py` no corre sin él |
| `prep.py` | Asigna cada foco a una provincia, clasifica la confianza y agrega en grilla de 0,1° por día |
| `data/data-YYYY.js` | Un archivo por año (~2,7–2,9 MB), columnar: `day, inst, dn, conf, prov, iy, ix, n, f` |
| `data/years.js`, `data/provincias.js` | Años disponibles; nombres, bbox y contornos simplificados |
| `index.html` | App completa: globo, H3 res 2–5 para mostrar, filtros, alertas, vista de planificación |

## Detalle de `prep.py`
- MODIS: `conf` 2 si confidence ≥ 80, 1 si ≥ 30, 0 si menos. VIIRS: `l/n/h` → 0/1/2.
- `inst`: 0 MODIS, 1 VIIRS. **No distingue satélite** (Terra/Aqua, S-NPP/NOAA-20/NOAA-21). [hecho]
- `dn`: 1 día, 0 noche.
- Agrega por `(day, inst, dn, conf, prov, iy, ix)` con `n` = cantidad de focos y `f` = suma de FRP.
- **No filtra** `type` (fuentes estáticas, volcanes, mar) ni aplica máscara de fuentes persistentes. [hecho]
- Usa `acq_date` (día UTC).

## Detalle de `index.html`
- Librerías por CDN: `globe.gl@2.27.2`, `h3-js@4.1.0`, `leaflet@1.9.4`; texturas de `three-globe` (Blue Marble, dark, night) y mosaicos Esri World Physical Map en la vista de planificación.
- Celdas de 0,1° reagrupadas a H3 res 2–5 en el navegador (`latLngToCell`).
- Alertas: ventana de 7 días, H3 res 4, suma con vecinos `gridDisk(1)`, una alerta por pico local, niveles por cantidad de focos (≥ 5, 15, 40, 100).
- Vista de planificación con **datos simulados**: semana análoga del último año con ruido, cuarteles de bomberos inventados y seguimiento de reportes de ejemplo, guardado en `localStorage`. [hecho]

# Arquitectura objetivo
```
FIRMS (CSV anuales por país + API de área para NRT)
        │
        ▼
pipeline/ (Python + DuckDB + h3)
  ingest → filter → mask → cell-days → calibrate → validate → export
        │
        ▼
data/artifacts/<version>/   (estáticos, versionados)
        │
        ▼
web/ (Next.js App Router + TypeScript, Vercel)
  ├─ cliente: filtros sobre typed arrays, calendario, globo/mapa H3
  └─ /api/v1/*: lee artefactos; hotspots.csv es proxy a FIRMS
```
- **El método vive solo en Python.** La web no recalcula la armonización: aplica los factores de `calibration.json`.
- **Sin base de datos ni login.**
- **MAP_KEY** solo del lado servidor (`FIRMS_MAP_KEY` en local y en Vercel), nunca en el cliente ni en el repo.
- Actualización: corrida manual durante el hackathon; GitHub Actions nocturno queda para después. [inferencia]

## Transición desde lo implementado [hipótesis]
1. `prep.py` pasa a `pipeline/` y se extiende: conservar **satélite** además de instrumento, filtrar `type`, sumar celda-día H3.
2. Agregar los años 2000–2022 y los CSV de los demás satélites VIIRS (S-NPP, NOAA-21).
3. El globo y las alertas se portan a componentes de `web/`, leyendo artefactos en lugar de `data/*.js`.
4. `provincias_ign.json` va como dependencia de build (descarga o Git LFS), no versionado en git normal.

# Datos: FIRMS
## Fuentes
- **Histórico:** CSV anuales por país (los nombres de `fuentes/` siguen ese patrón). Es más rápido que pedir 25 años a la API. Falta confirmar que existen para todos los años y satélites. [inferencia]
- **Reciente (NRT):** API de área: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}/{YYYY-MM-DD}`, `DAY_RANGE` 1–5, 5.000 transacciones cada 10 min.

## Disponibilidad (leída en `data_availability` el 14/11)
| Fuente | Estándar (SP) | NRT |
|---|---|---|
| MODIS | 2000-11-01 a 2026-08-31 | desde 2026-09-01 |
| VIIRS S-NPP | 2012-01-20 a 2026-07-31 | 2026-08-01 a 2026-11-02 |
| VIIRS NOAA-20 | 2018-04-01 a 2026-07-31 | desde 2026-08-01 |
| VIIRS NOAA-21 | 2023-03-01 a 2026-07-31 | desde 2024-01-17 |

## Campos
- MODIS: `brightness`, `bright_t31`, `confidence` 0–100, `type` (0 vegetación, 1 volcán, 2 otra fuente estática, 3 mar).
- VIIRS: `bright_ti4`, `bright_ti5`, `confidence` `l/n/h`, `version`. Los CSV de NOAA-20 del repo traen `type`. [hecho]
- Ambos: `latitude`, `longitude`, `acq_date`, `acq_time` (UTC), `satellite`, `instrument`, `frp`, `daynight`.

# Método de armonización
1. **Ingesta** a un esquema único: `family (MODIS|VIIRS), satellite, lat, lon, acq_date, acq_time, confidence_raw, confidence_class, type, frp, daynight, product (SP|NRT)`.
2. **Filtros:** MODIS `type == 0` y confidence ≥ 30 (umbral supuesto, configurable); VIIRS sin `l` y con `type == 0` si existe; recorte al polígono de Argentina.
3. **Máscara de fuentes persistentes:** celdas con detección en más de la mitad de los días (con ≥ 90 días de datos).
4. **Celda-día:** celda H3 res 5 × día UTC; vale 1 si hubo al menos una detección de esa familia. Se guarda también el conteo crudo.
5. **Regímenes VIIRS** con fechas fijas:

| Régimen | Satélites | Desde | ¿Tiene SP? |
|---|---|---|---|
| V1 | S-NPP | 2012-01-20 | Sí |
| V2 | S-NPP + NOAA-20 | 2018-04-01 | Sí |
| V3 | + NOAA-21 | 2023-03-01 o 2024-01-17 (abierto) | Sí, hasta 2026-07-31 |
| V4 | NOAA-20 + NOAA-21 | 2026-11-03 | **No** |

6. **Factor por régimen:** `k_r = Σ celda-días MODIS / Σ celda-días VIIRS` en los meses SP del régimen. Serie armonizada (escala MODIS): MODIS hasta ene-2012; `k_r × VIIRS` desde feb-2012.
7. **k de V4:** se estima quitando S-NPP de los datos SP de V3. [inferencia]
8. **Validación:** último año SP retenido y caída simulada de S-NPP desde 2025; se publica el error.
9. **Meses NRT:** `provisional = true`; no entran a la calibración.
10. **Línea base de anomalía:** frecuencia por celda y estación (±15 días) con vecinos `gridDisk(1)`; clases habitual / inusual / excepcional.

# Artefactos
Esquemas propuestos. [hipótesis]

| Archivo | Contenido |
|---|---|
| `meta.json` | versión, fecha de corrida, rango de meses, primer mes provisorio, resolución, filtros |
| `cells.json` | celdas H3 res 5 con fuego, en orden; índice de los `.bin` |
| `monthly.bin` | `Uint8` celda-días MODIS y VIIRS + `Uint16` conteos crudos, layout `[cell][month]` |
| `calibration.json` | k y fechas por régimen |
| `validation.json` | métricas y series antes/después |
| `baseline.bin` | `Float32` `[cell][24 quincenas]` |
| `daily.bin` | serie diaria agregada por país y presets, no por celda |
| `events/<id>.json\|csv` | museo |

Con ~10.000–15.000 celdas y 313 meses, `monthly.bin` queda en ~6–9 MB sin comprimir; la serie armonizada se calcula en el navegador (`k × viirs`). [inferencia]

# API v1
| Endpoint | Devuelve |
|---|---|
| `GET /api/v1/series` | serie mensual por región, fechas y fuente (`harmonized\|modis\|viirs`) |
| `GET /api/v1/anomalies` | clase y percentil por celda y total |
| `GET /api/v1/export.csv` | agregados: `h3_cell, month, celldays_modis, celldays_viirs, celldays_harmonized, hotspots_modis, hotspots_viirs, provisional` |
| `GET /api/v1/hotspots.csv` | filas crudas de FIRMS en vivo, máximo 31 días |
| `GET /api/v1/validation` | `validation.json` |
| `GET /api/v1/nrt` | últimos días NRT (opcional) |
