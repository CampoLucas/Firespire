---
type: Reference
title: "Firespire — MVP data contracts and UI integration"
description: "Schemas for events.json, museum.json and hotspots.csv, the median/anomaly function, calibration guard fields, and the UI changes in HistoryView and the museum."
tags: ["firespire", "nasa-space-apps-2026", "contract", "ui"]
sources:
  - "../contratos.md"
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-15T15:10:00-03:00"
---
# 05. Data contracts and UI integration

[Index](00_START_HERE.md) · [Museum curation](04_DISCOVERY_AND_CAUSE_ENGINE.md) · [Runbook](06_IMPLEMENTATION_RUNBOOK.md)

Every contract here must also land in `docs/contratos.md`, `web/lib/artifact-types.ts` and, for thresholds, `pipeline/src/firespire/config.py` (the three places that change together). Existing contracts (`meta.json`, `cells.json`, `monthly.bin`, `calibration.json`, `validation.json`, `/api/v1/*`) are unchanged unless listed below.

## Calibration guard (extends `calibration.json`)

Per regime, add:

| Field | Type | Meaning |
|---|---|---|
| `sp_months` | int | **Changed:** SP months **with rows** used for k (was: all months in range) |
| `sp_months_incomplete` | string[] | SP months skipped because an expected satellite had no rows |
| `satellites_observed_sp` | string[] | VIIRS satellites seen in the calibration months |
| `k_by_month` | (number \| null)[12] | k per calendar month (index 0 = January); null means use the regime `k`. Needs at least `CALIBRATION_MIN_MONTHS_PER_CALENDAR_MONTH` (2) calibration months |
| `k_by_month_n` | int[12] | Calibration months behind each value |

As implemented: k uses only *paired* SP months (MODIS and VIIRS both with cell-days) where every satellite the regime expects was observed. If a regime has no such month but has incomplete ones, k comes from those and `method` is `"direct_incomplete"` (provisional), so the app keeps working on partial archives. `meta.warnings` gets one English sentence per regime with skipped or incomplete months. `config.py` has `CALIBRATION_REQUIRE_ALL_SATELLITES = True`. The holdout validates the same thing the app uses: k per regime, estimated without the 12 test months (`k_train_by_regime`, `train_months_by_regime`).

## Median and anomaly (web)

New pure function in `web/lib/harmonize.ts`:

```ts
export interface MonthBaseline {
  month: Month;                 // the month being compared, "YYYY-MM"
  value: number | null;         // harmonized cell-days of that month
  median: number | null;        // median of the same calendar month in other years with data
  years: number;                // how many years entered the median
  anomaly: number | null;       // (value - median) / median; null if median is 0 or null
  provisional: boolean;
}
export function monthBaseline(points: SeriesPoint[], month: Month, opts?: { minYears?: number }): MonthBaseline;
```

- Uses only points with `no_data === false` and `value !== null`, excluding the compared year.
- `minYears` default 5; below it, `median: null` and the UI says "not enough history".
- The calendar can switch to an anomaly view: each cell = anomaly vs the median of its calendar month, on a diverging ramp.

## UI changes in `HistoryView.tsx`

| Control or view | Change |
|---|---|
| Date range | Two month selects (`from`, `to`) bounded by `meta.first_month` and the last month; passed to `monthlySeries` and to the CSV link as `from`/`to` (already supported by `csv.ts::parseSeriesParams`) |
| Comparison KPI | "{Month} vs median {first year}–{last year}: +X %" for the last month in range (default: latest month with data) |
| View toggle | "Counts" (sequential ramp `RAMP`) / "Anomaly" (diverging, color-blind-safe, centered at 0) |
| Downloads | Existing CSV; add "Download chart" (SVG of the calendar) |
| Raw hotspots | Link "Hotspots CSV (≤ 10 days)" to `/api/v1/hotspots.csv` when a province and a day range are chosen |
| Landing | `/` stays the History page; the globe link reads "Explore raw detections on the globe" |

## `hotspots.csv`

`GET /api/v1/hotspots.csv?province=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD[&sources=MODIS_NRT,VIIRS_NOAA20_NRT,...]`

| Case | Response |
|---|---|
| OK | `text/csv`, columns `latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,version,source` |
| Range > 10 days, bad date or unknown province | 400 `{error}` |
| Missing `FIRMS_MAP_KEY` | 503 `{error: "Hotspot download is not configured"}` |
| FIRMS error or timeout | 502 `{error}`, upstream URL never included |
| Body > 4 MB | 413 asking to narrow the range |

Source selection, per source: its SP product for dates up to that source's SP cutoff, its NRT product after (cutoffs from `/api/data_availability`, cached in the route).

## `events.json` (curated input)

Path `pipeline/resources/museum/events.json`. Written by a person after Tavily curation; versioned.

```ts
interface CuratedEventsFile {
  schema: 1;
  events: CuratedEvent[];
}
interface CuratedEvent {
  id: string;                         // "ev-" + slug, stable
  title: string;                      // short English title, e.g. "Sierras de Córdoba fires"
  province: string;                   // canonical name in cells.json::provinces
  place: string;                      // as written by the source
  lat: number; lon: number;
  location_basis: "stated_coordinates" | "named_place" | "satellite_centroid";
  radius_km: number;                  // 5–60
  start: string; end: string;         // "YYYY-MM-DD" occurrence, as stated
  date_precision: "day" | "month";
  area_burned_ha?: { value: number; source_id: string };
  cause: { text: string | null; category: "official" | "reported" | "unknown"; source_id: string | null };
  summary: string;                    // 1–2 sentences, English, written by the curator
  sources: CuratedSource[];           // ≥ 1
  curated: { by: string; at: string; tool: "tavily-mcp" | "tavily-api" | "manual" };
}
interface CuratedSource {
  id: string;                         // "src-" + slug
  kind: "article" | "report" | "photo";
  title: string; publisher: string;
  published: string | null;           // "YYYY-MM-DD"
  url: string;                        // https only
  quote?: string;                     // ≤ 25 words
  language: "es" | "en";
}
```

Pipeline validation fails the build on: non-HTTPS URL, unknown province, `end < start`, radius out of range, quote over 25 words, cause `source_id` not in `sources`, duplicate IDs.

## `museum.json` (artifact)

Path `web/public/artifacts/<version>/museum.json`. Regenerated by `firespire build` (or `firespire museum build`); never edited by hand.

```ts
interface MuseumArtifact {
  schema: 1;
  version: string;
  generated_at: string;
  params: { window_pad_days: number; min_celldays: number; max_points: number };
  events: MuseumEvent[];
}
interface MuseumEvent extends Omit<CuratedEvent, "curated"> {
  curated: CuratedEvent["curated"];
  match: {
    verdict: "overlap" | "weak" | "none";
    window: { start: string; end: string };
    regime: string | null;            // regime id for the window's main month
    k: number | null;
    provisional: boolean;
    detections: { MODIS: number; VIIRS: number; by_satellite: Record<string, number> };
    celldays: { MODIS: number; VIIRS: number; harmonized: number | null };
    max_frp: number | null;
    first_detection: string | null; last_detection: string | null;
    daily: { date: string; modis: number; viirs: number; harmonized: number | null }[];
    context: { month: string; median: number | null; years: number; anomaly: number | null };
    footprint_h3: string[];           // res 5
    sample: { lat: number; lon: number; date: string; family: "MODIS" | "VIIRS"; frp: number | null }[];
  };
}
```

## Museum adapter (browser)

- New `web/public/globe/museum/curated.mjs`: `loadCuratedExhibits(): Promise<CuratedExhibit[]>` fetches `/artifacts/latest.json` then `museum.json` and maps each event to the existing board model.
- New types in `contracts.d.ts`: `CuratedEvidence` (`isMock: false`, `source.url: string`, `source.verification: "curated"`, `kind` adds `"chart"` and `"context"`) and `CuratedExhibit` (`isMock: false`, `match` summary for the intro). Keep `MockExhibit` for tests.
- `index.mjs::mountMuseum(exhibits)` receives exhibits instead of importing `catalog.mjs`; the globe page passes curated exhibits, tests pass the mock catalog.
- New `curated-validate.mjs::validateCuratedExhibits`: allows HTTPS URLs, rejects `javascript:`/`data:`, checks IDs, finite coordinates and placements. `validateCatalog` stays as is for the mock fixture.
- `board-view.mjs::renderEvidence`: footer shows publisher, publication date and an "Open original source" link (`target="_blank"`, `rel="noopener noreferrer"`), rendered through `dom.mjs::element`. Clicks on the link must not select or swipe the card.
- Layout: fixed templates for 3, 4, 5 and 6 cards inside the existing `BOARD` 1600×1000, so `board-camera.mjs` needs no change. The intro text says "Curated event · real sources · satellite overlap, not attribution".
- Markers: lat/lon of the event; dashed halo when `location_basis` is `satellite_centroid`. Footprint cells drawn with the existing H3 path layer.
- Keep unchanged: `state.mjs::reduce`, `globe-adapter.mjs`, `INTRO_MS`, camera poses, Developer View.
