---
type: Reference
title: "Firespire — current application audit (MVP baseline)"
description: "What the repo implements on 2026-11-15, harmonization and coverage status, and the nine gaps the MVP must close."
tags: ["firespire", "nasa-space-apps-2026", "architecture", "audit"]
sources:
  - "../contratos.md"
  - "../arquitectura.md"
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-15T14:30:00-03:00"
---
# 01. Current application audit

[Index](00_START_HERE.md) · Next: [architecture](02_ARCHITECTURE_AND_ADRS.md)

Inspected read-only on branch `prototype/museum-of-fires`. Paths are relative to the repo root. No build or test was run for this audit; the original package's earlier read-only checks (mock catalog validation, reducer and camera assertions) are still the only recorded checks.

## Repository and runtime

| Path and symbol | Behavior |
|---|---|
| `web/package.json` | Next 16, React 19, TypeScript, ESLint, Vitest. Scripts `dev`, `build`, `start`, `lint`, `test`, `check:museum` |
| `web/next.config.ts` | `cacheComponents`, `partialPrefetching`; traces artifact files into the three `/api/v1` routes. Read `web/AGENTS.md` before touching Next code |
| `web/app/page.tsx` → `components/HistoryView.tsx` | Harmonized History page: source toggle (Harmonized / MODIS raw / VIIRS raw), province, metric (cell-days / raw hotspots), KPIs, calendar, CSV link, coverage notices, method box |
| `web/lib/harmonize.ts::{monthlySeries,kForMonth,monthIndex,monthAt}` | Applies `calibration.json` in the browser: MODIS before `harmonized_start`, k × VIIRS after |
| `web/lib/csv.ts::parseSeriesParams` | Parses `source`, `province`, `from`, `to` for the API |
| `web/app/api/v1/{series,validation,export.csv}/route.ts` | Monthly series, validation, CSV of cell×month analytics (413 above 4 MB) |
| `web/lib/artifacts.server.ts` | Reads artifacts from disk and caches them in memory: restart `npm run dev` after a `build` |
| `web/public/globe/index.html` | Standalone globe (globe.gl, h3-js from CDN), raw daily detections per year from `data/data-YYYY.js` |
| `web/public/globe/museum/*.mjs` | Museum of Fires prototype: state machine, camera adapter, physical board, two fictional exhibits in `catalog.mjs` |
| `pipeline/src/firespire/cli.py` | `build`, `fetch`, `globe` commands |

## Harmonization pipeline (already implemented)

`cli.py::build` runs `ingest → filters → celldays.assign_cells → mask → celldays.build → calibrate → validate → export` on DuckDB. Contract in [contratos.md](../contratos.md).

| Step | Module and symbol | What it does |
|---|---|---|
| Ingest | `ingest.py::discover,ingest` | Reads `modis_YYYY_<Country>.csv` and `viirs-<key>_YYYY_<Country>.csv`; `<key>` maps through `config.VIIRS_FILE_SATELLITE` (`snpp`, `jpss1`, `jpss2`); `product` = NRT if `version` ends in NRT, else SP |
| Filters | `filters.py` | MODIS confidence ≥ 30; VIIRS drops `l`; `type = 0` when present |
| Cells | `celldays.py::assign_cells` | H3 resolution 5 per detection |
| Mask | `mask.py` | Drops persistent sources (detected on > 50 % of days with data, ≥ 90 days) |
| Cell-days | `celldays.py::build` | One row per cell × day × satellite × product |
| Calibration | `calibrate.py::compute` | k per regime = Σ MODIS cell-days / Σ VIIRS cell-days over SP months; `drop_snpp` fallback for a regime without SP months |
| Validation | `validate.py::{holdout,snpp_drop}` | 12-month holdout (needs ≥ 24 SP months); simulated S-NPP loss from `SNPP_DROP_FROM = "2025-01"` |
| Export | `export.py` | `meta.json`, `cells.json`, `monthly.bin`, `calibration.json`, `validation.json` |

Regimes (`config.py::REGIMES`): V1 S-NPP from 2012-01-20, V2 + NOAA-20 from 2018-04-01, V3 + NOAA-21 from 2023-03-01 (D-05 open), V4 NOAA-20 + NOAA-21 from 2026-11-03. `HARMONIZED_START = "2012-02"`.

A cell-day counts once per family even if two satellites, or an SP and an NRT row, saw the same cell that day. Duplicates therefore do not inflate cell-days, but they do inflate raw hotspot counts and mark the month as provisional.

## Data and coverage today

| Item | Value |
|---|---|
| `fuentes/` (SP) | `modis_2023/2024_Argentina.csv`, `viirs-jpss1_2023/2024_Argentina.csv` (NOAA-20 only) |
| `fuentes/nrt/` (not versioned) | MODIS, S-NPP, NOAA-20, NOAA-21 for 2026-09-01 to 2026-11-14 |
| Served artifacts | `web/public/artifacts/latest.json` → `v1-nrt`: `first_month 2023-01`, `n_months 47`, `n_cells 7796`, `first_provisional_month 2026-09`; 2025-01 to 2026-08 listed in `months_without_data` |
| `calibration.json` (v1-nrt) | V2 k = 0.386 (2 SP months), V3 k = 0.464 calibrated with only NOAA-20 in SP; V1 and V4 without k |
| Globe data | `data-2023/2024/2025.js` from legacy `prep.py`, `data-2026.js` from `firespire globe`; raw counts, all VIIRS satellites summed |

The globe and the History page are different products: the globe shows **raw** detections (`museum/annotations.mjs:32` says so), History shows the **harmonized** series. The MVP keeps both but makes History the core view.

## Museum prototype contracts (unchanged)

| File/symbol | Invariant to preserve |
|---|---|
| `museum/contracts.d.ts::{MockExhibit,MockEvidence}` | `isMock: true`, `url: null`, `verification: "fictional"`; evidence kinds article/report/photo/satellite; fixed placements |
| `museum/catalog.mjs::{BOARD,exhibits}` | BOARD 1600×1000; two fictional exhibits |
| `museum/validate.mjs::validateCatalog` | Rejects live flags/URLs, checks IDs, coordinates and placements |
| `museum/index.mjs::{mountMuseum,select,dispatch,INTRO_MS}` | Builds markers once from the catalog; 5,000 ms intro |
| `museum/state.mjs::reduce` | globe → approach → intro/entering → board/travel/evidence → returning, with stale-callback tokens |
| `museum/board-view.mjs`, `board-camera.mjs`, `globe-adapter.mjs` | Physical board, camera poses, camera capture and exact restore |
| `museum/dom.mjs::element` | Text-only rendering through `textContent` |

## Gaps the MVP must close

| # | Gap | Impact | Fix (see [06](06_IMPLEMENTATION_RUNBOOK.md)) |
|---|---|---|---|
| 1 | Calendar starts in 2023-01 | Core requirement "from the early 2000s" unmet | Ingest full archive (A1–A4) |
| 2 | V3 k calibrated with NOAA-20 only, while 2026 has three VIIRS satellites: harmonized ≈ 2× MODIS in Sep–Oct 2026 | Harmonization is visibly wrong in the most recent months | SP files for every satellite + satellite-completeness guard (A2, A3) |
| 3 | SP and NRT can overlap in recent months | Inflated raw counts; month wrongly excluded from calibration | One SP cutoff, NRT only after it (A1) |
| 4 | `sp_months` counts months without data (V3 reports 42) | Misleading method box | Count only months with rows (A3) |
| 5 | No date-range controls, no current-month-vs-median | Core selection and recommended comparison missing | B1, B2 |
| 6 | `export.csv` is cell×month analytics, not hotspots of a search | Recommended output missing | B4 (`hotspots.csv`, cuttable) |
| 7 | Globe is raw, landing page links to it as a peer | Weakens "the sensor no longer matters" story | History is the landing; globe labeled "raw detections explorer" (B3) |
| 8 | `monthly.bin` = n_cells × n_months × 6 bytes; ≈ 15,000 cells × 313 months ≈ 28 MB [inference] | Slow first load | Measure after A4; fallback in [02 ADR 3](02_ARCHITECTURE_AND_ADRS.md#adr-3-full-archive-ingest) |
| 9 | Archive file names for S-NPP and NOAA-21 not verified against a real download (`contratos.md`) | `ingest` raises on unknown keys | Check names on arrival (A1) |

Not gaps for the MVP: global coverage, drawing an AOI, forecasting, accounts or databases (out of scope in [finalidad](../finalidad.md)).
