# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Firespire: web app para el NASA Space Apps Challenge 2026 (*MODIS and VIIRS Hot Spots*) que muestra focos de calor de NASA FIRMS en Argentina, armonizando MODIS y VIIRS. Los docs de `docs/` (en español, formato OKF, todo en `draft`) son la referencia de producto y método: empezá por `docs/index.md`. Lo ya decidido está en `docs/decisiones.md` (T-01 a T-19); las decisiones abiertas, ahí mismo. El plan de implementación y los gates de entrega están en `docs/arquitechture-decitions/` (en inglés, empezá por `00_START_HERE.md`).

## Estado real vs. objetivo

Existen `pipeline/` (Python) y `web/` (Next.js) con el flujo completo de armonización y un museo con eventos reales. Implementado:
- Armonización sobre el archivo 2000-11 a 2026-11 (SP + NRT, con corte SP/NRT por fuente), k por régimen **y por mes calendario**, guarda de satélites completos en la calibración y holdout por régimen.
- Museo de incendios con eventos reales curados (`pipeline/resources/museum/events.json`, 8 eventos) cruzados con las detecciones FIRMS (`museum.json`).
- Globo con datos crudos de 2000 a 2026 y textura NASA Blue Marble 8K.

Todavía **no** están implementados: rango de fechas y comparación mes actual vs. mediana/anomalía en `HistoryView`, proxy `/api/v1/hotspots.csv`, `daily.bin`, vistas Map/Today, el port del globo a React, la huella H3 de los eventos del museo sobre el globo, ni la documentación de `museum.json`/`events.json` en `docs/contratos.md`. Antes de asumir que algo existe, verificalo en el código.

Datos de hoy (artefactos `v2-full`, los que sirve `latest.json`):
- 313 meses (2000-11 a 2026-11), 12.144 celdas H3 res 5; meses provisorios (NRT) desde 2026-08.
- Salen de una **carpeta local con los CSV anuales de FIRMS** (`modis_YYYY_Argentina.csv`, `viirs-snpp|jpss1|jpss2_YYYY_Argentina.csv`; ~550 MB, no está en el repo). `fuentes/` solo guarda los SP de MODIS y NOAA-20 de 2023–2024 y `fuentes/nrt/` un NRT parcial (no versionado).
- Los archivos del globo `data-2000.js` a `data-2026.js` salen de esa misma carpeta (74 MB en total; 2020 pesa 8,5 MB).

Límites conocidos (están en `docs/arquitechture-decitions/08_TESTING_FAILURES_AND_RELEASE.md`): k estacional (modelado, pero V3 se apoya en 3–4 años por mes), 2026 queda por encima de MODIS (ene–jul ≈ 1,18×), los meses provisorios dan peor, k es nacional, y MODIS es solo Terra de 2000-11 a 2002-06 (T-19, se declara, no se corrige). `holdout`: MAPE mensual 19,3 % con k por mes (35,8 % con k único).

## Comandos

- `uv` está en `~/.local/bin` (puede hacer falta agregarlo al PATH). No hay Python de sistema: el toolchain lo maneja uv.
- Pipeline (dentro de `pipeline/`):
  - `uv sync`
  - `uv run firespire fetch --after-sp` baja NRT de FIRMS a `../fuentes/nrt/`, cada fuente desde el día siguiente al corte de su SP. Otras opciones: `--start`, `--days N`, `--end`, `--sources`. `--product sp` baja procesamiento estándar a `../fuentes/sp/` (bajar años completos: cada corrida pisa el archivo del año que toca). Necesita `FIRMS_MAP_KEY` en el entorno o en `web/.env.local`.
  - `uv run firespire build <carpeta_csv>... --version v2-full` (acepta varias carpetas; escribe `web/public/artifacts/<version>/` y apunta `latest.json` a esa versión). Si existe `pipeline/resources/museum/events.json`, escribe también `museum.json`.
  - `uv run firespire museum candidates <carpeta_csv>... [--top 15]` rankea episodios de 7 días por anomalía y escribe `pipeline/out/candidates.json` (ignorado por git).
  - `uv run pytest` (93 tests); un test: `uv run pytest tests/test_calibrate.py::test_name`
  - `uv run ruff check`
- Web (dentro de `web/`):
  - `npm install`, `npm run dev`, `npm run build`, `npm run lint`
  - `npm test` (vitest, 59 tests); un test: `npx vitest run lib/__tests__/<archivo> -t "<nombre>"`
  - `npm run check:museum` (tipos de los módulos `.mjs` del museo)
- Globo: `uv run firespire globe <carpeta_csv>... [--years 2026]` (dentro de `pipeline/`) escribe `web/public/globe/data/data-YYYY.js` y rehace `years.js` con todos los años presentes. Mismo formato que `prep.py`, pero asigna provincias con `provincias.geojson` (el índice `prov` sigue el orden de `provincias.js`) y suma todos los satélites VIIRS del año. Así se generaron los archivos de 2000 a 2026.
- Legado: `python -I prep.py fuentes` (raíz) también escribe `web/public/globe/data/*.js`, pero necesita `fuentes/provincias_ign.json` (111 MB, en `.gitignore`, no está en el repo) y toma un solo archivo VIIRS por año. No lo uses: los archivos del globo ya se regeneran con `firespire globe`.

## Arquitectura

- **Pipeline** (`pipeline/src/firespire/`): `cli.py` orquesta `ingest` → `filters` → `celldays.assign_cells` → `mask` → `celldays.build` → `calibrate` → `validate` → `export` → `museum.maybe_build`. Tablas DuckDB: `detections`, `detections_filtered`, `det_cells`, `masked_cells`, `cell_days` (detalle en `docs/contratos.md`).
- **Calibración** (`calibrate.py`): k = Σ MODIS / Σ VIIRS por régimen VIIRS (`config.REGIMES`), usando solo meses SP con MODIS y VIIRS y con todos los satélites que el régimen espera (`CALIBRATION_REQUIRE_ALL_SATELLITES`). Si ningún mes cumple, usa los incompletos y marca `method: "direct_incomplete"`. `seasonal_k` calcula k por mes calendario (mínimo `CALIBRATION_MIN_MONTHS_PER_CALENDAR_MONTH`) y `k_for(regimen, mes)` es la forma de aplicarlo: devuelve el k del mes o, si falta, el del régimen.
- **Validación** (`validate.py`): `holdout` entrena k por régimen y mes sin los últimos 12 meses y compara con k único; `snpp_drop` simula la caída de S-NPP.
- **Descarga** (`fetch.py`): usa `/api/area` con el recuadro de Argentina y recorta con `pipeline/resources/provincias.geojson`, porque `/api/country` responde "Invalid API call". El corte SP/NRT es por fuente (`sp_cutoff`, `after_sp_starts`): MODIS_SP llega más tarde que los VIIRS SP. Con `--after-sp` cada fuente NRT arranca el día siguiente al corte de su SP; sin él, todas comparten una ventana de fechas (con ventanas distintas, un mes queda con días de un sensor sin el otro y la serie se infla). Los CSV NRT no traen `type`, por eso los filtros aceptan `type` vacío en ambas familias.
- **Huecos de cobertura**: `meta.months_without_data` lista por familia los meses sin filas; la web los muestra como `no_data`, no como cero. La máscara de persistentes cuenta días con datos, no el rango calendario.
- **Artefactos**: `web/public/artifacts/<version>/` con `meta.json`, `cells.json`, `monthly.bin`, `calibration.json`, `validation.json` y `museum.json`; más `web/public/artifacts/latest.json`. `calibration.json` suma por régimen `k_by_month`, `k_by_month_n`, `sp_months_incomplete` y `satellites_observed_sp`, y a nivel raíz `k_granularity`.
- **Regla del método**: el método vive solo en Python. La web solo aplica `calibration.json` (serie armonizada = MODIS antes de `harmonized_start`; después, k del mes × celda-días VIIRS). El museo también se cruza en Python (`museum.py`), con el mismo `cell_days` y el mismo k.
- **Tres lugares que cambian juntos**: `web/lib/artifact-types.ts`, `pipeline/src/firespire/config.py` y `docs/contratos.md`. Si cambia uno, revisar los otros dos (pendiente: `museum.json` y `events.json` no están en `artifact-types.ts` ni en `contratos.md`).
- **`web/lib/`**: `artifacts.ts` es seguro para el browser (sin `fs`); `artifacts.server.ts` usa `fs` y solo corre en server; `harmonize.ts` aplica la calibración (`kForMonth` lee `k_by_month` y cae al k del régimen).
- **API**: `/api/v1/series`, `/api/v1/validation`, `/api/v1/export.csv`. Vercel corta respuestas a 4.5 MB, así que los artefactos se sirven siempre como archivos estáticos, no por función. `artifacts.server.ts` cachea los artefactos en memoria: después de un `build` hay que reiniciar `npm run dev` para que la API vea los nuevos.
- **Globo**: `web/public/globe/` es el entregable visual, un `index.html` estático servido en `/globe/index.html`. La textura base es `web/public/globe/textures/earth-bmng-8k.jpg` (NASA Blue Marble: Next Generation, enero de 2004, con relieve y batimetría; crédito NASA Earth Observatory / Reto Stöckli, hay que declararlo en la entrega).
- **Museo** (`web/public/globe/museum/`): `curated.mjs` carga `museum.json` y arma los tableros (una tarjeta por fuente, satelital, curva diaria, contexto y método); si falta el artefacto, cae al catálogo ficticio rotulado (`catalog.mjs`, `validate.mjs`). `curated-validate.mjs` valida el contenido real (solo URLs https) y `blocks.mjs` lo dibuja con DOM seguro. `state.mjs`, `globe-adapter.mjs` y la cámara no cambian.
- **Regla del globo**: las capas de actividad, el historial y las alertas conservan sus datos reales de FIRMS. Museum of Fires muestra eventos reales curados (`pipeline/resources/museum/events.json` → `museum.json`) con un vínculo calculado con las detecciones FIRMS (radio × fechas), rotulado siempre como superposición y no como atribución (T-14).
- **Alertas y planificación**: muestran actividad observada en los 7 días que terminan en la fecha elegida, en zonas H3 res 4 (celda y vecinas), con niveles por cantidad de focos (≥5, 15, 40, 100). La planificación toma los últimos 7 días con datos hasta hoy (o `?hoy=AAAA-MM-DD`).
- **Zonas prioritarias**: son marcas del usuario guardadas en `localStorage`. No agregues nada que no venga de la API sin acordarlo con el equipo.

## Convenciones

- Idioma: UI y README en inglés (la entrega y la app van en inglés); `docs/` y comentarios de código en español rioplatense.
- Antes de escribir código Next.js, leer `web/AGENTS.md`: Next 16 tiene cambios incompatibles con versiones anteriores.
- Mantener `FIRMS_MAP_KEY` solo del lado servidor y fuera del repo (ver `web/.env.example`). `fetch` nunca la imprime: no la pongas en logs, URLs de commits ni mensajes de error. Límite: 5.000 transacciones cada 10 minutos; un pedido de área cuesta ~4.
- `TAVILY_API_KEY` y el MCP de Tavily son solo para curar eventos del museo: nunca en Vercel ni en el repo.
- `events.json` lo cura una persona: cada URL abierta y leída, citas de hasta 25 palabras, causa atribuida a su fuente y redacción siempre como "superposición, no atribución". Hoy es un borrador pendiente de revisión humana.
- Los artefactos no se editan a mano: se regeneran con `firespire build`.
