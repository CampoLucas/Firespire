---
type: Reference
title: "Firespire — providers: FIRMS, Tavily, EONET"
description: "How the MVP uses the FIRMS archive and area API, Tavily search/extract (API and MCP) for museum curation, and EONET as an optional lead source. Brave is removed."
tags: ["firespire", "nasa-space-apps-2026", "firms", "tavily", "eonet"]
sources:
  - "https://firms.modaps.eosdis.nasa.gov/api/area"
  - "https://firms.modaps.eosdis.nasa.gov/api/data_availability/"
  - "https://firms.modaps.eosdis.nasa.gov/download/"
  - "https://docs.tavily.com/documentation/api-reference/endpoint/search"
  - "https://docs.tavily.com/documentation/api-reference/endpoint/extract"
  - "https://docs.tavily.com/documentation/api-credits"
  - "https://eonet.gsfc.nasa.gov/docs/v3"
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-15T14:50:00-03:00"
---
# 03. Providers

[Index](00_START_HERE.md) · [Museum curation](04_DISCOVERY_AND_CAUSE_ENGINE.md) · [Setup](07_SETUP_RUN_AND_DEPLOY.md)

## Summary

| Provider | Role in the MVP | When it runs | Key |
|---|---|---|---|
| NASA FIRMS archive (SP files) | History 2000-11 → SP cutoff | Offline, before `build` | Not needed for file downloads made through the FIRMS site [unverified for every product] |
| NASA FIRMS area API | NRT after the SP cutoff; SP gaps; `hotspots.csv` | `firespire fetch` offline; proxy at runtime | `FIRMS_MAP_KEY` |
| Tavily search and extract | Find and read sources for museum candidates | Curation only | `TAVILY_API_KEY` or Tavily MCP |
| NASA EONET | Optional extra leads for candidates | Curation only | None |
| ~~Brave~~ | Removed: paid, not needed for offline curation | — | — |

Provider facts below were read in the previous package on 2026-11-15 from official docs, and the FIRMS behavior marked *verified* comes from this repo's own `fetch.py` runs on 2026-11-14.

## FIRMS

### Archive files (history)

- Use standard-processing (SP) products for history: `MODIS_SP`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP`.
- The team is downloading 2000 → today in parallel. Whatever the channel (yearly country files or the [Archive Download](https://firms.modaps.eosdis.nasa.gov/download/) workflow), files must land with names `ingest.py` understands:

| Product | File name `ingest.py` expects | Satellite mapping |
|---|---|---|
| MODIS (Terra + Aqua) | `modis_YYYY_Argentina.csv` | from the `satellite` column (`Terra`/`T`, `Aqua`/`A`) |
| VIIRS S-NPP | `viirs-snpp_YYYY_Argentina.csv` | `config.VIIRS_FILE_SATELLITE["snpp"] = "SNPP"` |
| VIIRS NOAA-20 | `viirs-jpss1_YYYY_Argentina.csv` | `"jpss1" → "N20"` (verified with the files in `fuentes/`) |
| VIIRS NOAA-21 | `viirs-jpss2_YYYY_Argentina.csv` | `"jpss2" → "N21"` |

S-NPP and NOAA-21 names are not verified against a real FIRMS download (`contratos.md`). If the delivered names differ, rename the files, do not change the mapping. An unknown key makes `ingest` fail on purpose.

- Folder layout: SP in `fuentes/sp/` (or `fuentes/`), NRT in `fuentes/nrt/`. `firespire build` takes several folders.
- Archive downloads made for a bounding box contain points outside Argentina; clip with `fetch.py::clip` and `country_shape()` before ingest, as `fetch` already does.

### Area API (NRT, gaps, proxy)

```http
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_MAP_KEY}/{SOURCE}/{WEST},{SOUTH},{EAST},{NORTH}/{DAY_RANGE}/{START_DATE}
```

- Coordinates are west,south,east,north. `DAY_RANGE` 1–5, no pagination: split into 5-day chunks (`fetch.py::chunks`, `CHUNK_DAYS = 5`).
- `/api/country` answers "Invalid API call": use the Argentina box `-74,-56,-53,-21` and clip (verified 2026-11-14, `fetch.py`).
- NRT CSVs from this endpoint carry no `type` column (verified 2026-11-14); filters accept empty `type`.
- Availability per product: `GET /api/data_availability/csv/{FIRMS_MAP_KEY}/all` (`fetch.py::availability`, columns `data_id,min_date,max_date` as parsed there).
- Limit: 5,000 transactions per 10 minutes; `fetch.py::key_status` prints usage without the key.
- Errors can come as a text body with HTTP 200; `fetch.py::_get` already treats a body starting with "invalid" or containing "error" as a failure and masks the key in messages.

**Needed change** (Track A, [06](06_IMPLEMENTATION_RUNBOOK.md#track-a-data-and-harmonization)): `fetch.SOURCES` lists only NRT products. Add a `--product sp|nrt` option that switches to the four SP products and writes to `fuentes/sp/`. File names stay the same, so `ingest` tells SP from NRT by the `version` column, as today.

### SP/NRT cutoff

1. Read `availability()` for the four SP products. `sp_cutoff = min(max_date)` over the products that exist for the period.
2. Use SP up to `sp_cutoff` for every source. Drop SP rows after it.
3. Fetch NRT from `sp_cutoff + 1` to today for every source with one common window (`fetch --start`).
4. Never keep both SP and NRT rows for the same source and day.

### `hotspots.csv` proxy (runtime)

- Server route only; `FIRMS_MAP_KEY` from the environment.
- Input: province (canonical name in `cells.json::provinces`), `from`, `to` (≤ 10 days, inclusive), optional `sources` (default the products available for those dates).
- Province bbox and polygon from `pipeline/resources/provincias.geojson` (bundled into the route with `outputFileTracingIncludes`).
- Output columns: `latitude, longitude, acq_date, acq_time, satellite, instrument, confidence, frp, daynight, version, source`.

## Tavily (curation only)

Two equivalent ways; use whichever the curator has open.

**A. Tavily MCP in a Claude Code session.** The curator asks Claude to run the search and extract tools on each candidate from `candidates.json`, reads the results and fills `events.json`. Setup in [07](07_SETUP_RUN_AND_DEPLOY.md#tavily-mcp). Tool names depend on the MCP server version [unverified]; the request fields below still apply.

**B. Tavily REST API** from a small script (`pipeline/scripts/curate_sources.py`, optional).

```http
POST https://api.tavily.com/search
Authorization: Bearer {TAVILY_API_KEY}
Content-Type: application/json

{
  "query": "incendio {province} {month_es} {year}",
  "search_depth": "basic",
  "max_results": 8,
  "include_answer": false,
  "include_raw_content": false,
  "include_images": false,
  "include_domains": []
}
```

Run each candidate twice: once with `include_domains` set to official hosts (for example `argentina.gob.ar`, the province's `gob.ar` host, `conae.gov.ar`, `inta.gob.ar`, `smn.gob.ar`; check each host before relying on it [unverified list]), once without, to catch news. Spanish query first; English (`wildfire {province} Argentina {month} {year}`) only as fallback.

```http
POST https://api.tavily.com/extract
Authorization: Bearer {TAVILY_API_KEY}
Content-Type: application/json

{ "urls": ["{URL returned by the search}"], "extract_depth": "basic", "format": "text", "include_images": false }
```

Rules:
- Map results by `results[].url`, not by position; read `failed_results` even on HTTP 200.
- Never use a Tavily-generated `answer` or `score` as a fact. The curator reads the extracted text.
- Do not store `raw_content` in the repo. `events.json` keeps the URL, title, publisher, dates and a quote of at most 25 words.
- Cost (published pricing, read 2026-11-15): basic search 1 credit; basic extract 1 credit per 5 successful URLs; free plan 1,000 credits per month. Keep pay-as-you-go off.

## EONET (optional, curation only)

```http
GET https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=all&start=YYYY-MM-DD&end=YYYY-MM-DD&bbox={WEST},{NORTH},{EAST},{SOUTH}&limit=50
```

Note the bbox order differs from FIRMS (west,north,east,south). No key. Probes in the previous package: Córdoba 2024-09 returned four events, Corrientes 2023-02 returned none, so coverage for Argentina is thin. Use `sources[].url` as extra leads for Tavily extract; an EONET entry alone never makes a museum event.
