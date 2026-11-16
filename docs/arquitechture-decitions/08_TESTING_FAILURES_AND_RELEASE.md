---
type: Playbook
title: "Firespire — MVP testing, release gates and demo"
description: "Gates per challenge requirement, harmonization numbers to publish, museum checks, failure handling, demo script and submission checklist."
tags: ["firespire", "nasa-space-apps-2026", "testing", "release", "demo"]
sources:
  - "https://www.spaceappschallenge.org/resources/judging-awards-guide/"
  - "https://www.spaceappschallenge.org/resources/project-submission-guide/"
  - "../finalidad.md"
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-15T15:40:00-03:00"
---
# 08. Testing, release gates and demo

[Index](00_START_HERE.md) · [Runbook](06_IMPLEMENTATION_RUNBOOK.md) · [Setup](07_SETUP_RUN_AND_DEPLOY.md)

## What has been verified so far

| Check | Result |
|---|---|
| This package | Documentation only; no code changed, nothing built or tested on 2026-11-15 |
| Earlier package (same day) | Read-only Node assertions on the mock museum (catalog validation, duplicate Start, stale callback, camera centering) passed; EONET probes for Córdoba 2024-09 (4 events) and Corrientes 2023-02 (0 events) |
| `fetch.py` runs (2026-11-14) | Area API works with the Argentina box; country endpoint answers "Invalid API call"; NRT CSVs have no `type` |

Record every new result as PASS / FAIL / BLOCKED / NOT RUN with date and artifact version.

## MVP gates

Ship only when every **core** gate passes.

| ID | Requirement | Level | Check | Pass when |
|---|---|---|---|---|
| G1 | Harmonized series | Core | Open `calibration.json` of the new version | k present for every regime with SP data; `sp_months_incomplete` empty or explained in `meta.warnings` |
| G2 | Sensor no longer matters | Core | History, all Argentina, overlap years 2012–2024: compare Harmonized and MODIS raw | Annual harmonized / MODIS cell-days within ±15 % for most years [threshold is a team choice]; no jump at 2018-04 or 2023-03 regime starts |
| G3 | Calendar from the early 2000s | Core | History calendar | Rows from 2000 (Nov first) to the current month; months without data shown as "no data" |
| G4 | Region and date range | Core | Pick Córdoba, 2024-08 to 2024-10 | Calendar, KPIs and CSV limited to that province and range |
| G5 | Download analytics and visuals | Core | CSV and "Download chart" | CSV opens with the documented columns; SVG opens |
| G6 | Current month vs median | Recommended | KPI for the latest month | Shows value, median, years used and anomaly; "not enough history" below 5 years |
| G7 | Accessible color ramps | Recommended | Check the sequential and diverging ramps with a color-blindness simulator | Classes distinguishable; values also shown as text on hover/focus |
| G8 | Hotspots CSV of a search | Recommended | 10-day request for one province | CSV in < 15 s; > 10 days returns 400; no key in response or logs |
| G9 | Museum cross-match | Creativity | Each `museum.json` event | Verdict and numbers match a manual DuckDB query for one event; every source URL opens; cause attributed to its source |
| G10 | Museum journey | Creativity | Open each board, travel between cards, open a source, exit | Camera and globe state restored; links do not swipe cards |
| G11 | No secrets in the browser | All | Search `.next/static` and `public/` for the key values without printing them | Not found |

## Numbers to publish

Fill these after A5; they go in the method box, the slides and the submission page (Validity criterion).

| Number | Source | Value |
|---|---|---|
| k per regime (pooled) | `calibration.json` | V1 0.474 (74 months), V2 0.316 (59), V3 0.257 (41), all `direct` on complete-constellation months; V4 0.300 (`drop_snpp`) |
| k per regime and calendar month (D-06, taken 2026-11-15) | `calibration.json::k_by_month` | V1 0.344 (Apr) to 0.612 (Jan); V2 0.246 (Jun) to 0.365 (Aug); V3 0.184 (May) to 0.318 (Sep); 3 to 7 years per value |
| Yearly harmonized / MODIS, 2012–2025 | computed from `monthly.bin` | 0.898 to 1.088 with the monthly k (0.915 to 1.062 with a single k) |
| In-sample monthly MAPE per regime | computed from `monthly.bin` | Monthly k: V1 8.8 %, V2 12.4 %, V3 10.0 %. Single k: 19.0 %, 21.4 %, 24.0 % |
| Holdout, k per regime and calendar month (train 2023-03..2025-07, test 2025-08..2026-07) | `validation.json::holdout` | monthly MAPE 19.3 %, total bias +9.6 %. Same test with a single k per regime: MAPE 35.8 %, bias +6.9 % |
| S-NPP drop test (test 2025-01..2026-11) | `validation.json::snpp_drop` | MAPE 26.2 % with k without S-NPP (0.300) vs 26.9 % with the V3 k; bias +7.7 % vs +6.9 % |
| Months covered | `meta.json` | 2000-11 to 2026-11 (313 months, 12,144 cells); provisional from 2026-08 |
| Museum events and verdicts | `museum.json` | [pending C4] |

Artifact version `v2-full`, built 2026-11-15 from the full archive (7,093,918 detections). Known weaknesses behind these numbers, to state openly rather than hide:

- **k is seasonal, now modeled.** Within each regime the implied k varies by a factor of 1.5–1.8 across calendar months (lowest May–June, highest August–September). The app uses k per regime and calendar month; a calendar month with fewer than 2 calibration months falls back to the regime k. V3 values rest on only 3–4 years each.
- **2026 still runs above MODIS.** January–July 2026 harmonized is 1.18× MODIS with the monthly k (1.41× with a single k); in the holdout May, June and July 2026 are 1.35×, 2.01× and 1.34×. Cause not established.
- **Provisional months are worse.** August, September and October 2026 (NRT VIIRS, without the `type` filter) are 1.67×, 1.30× and 1.28× MODIS. They are flagged provisional in the app.
- **November 2026** is partial and provisional, and is assigned to V3 although S-NPP stopped on 2026-11-02: 0.67× MODIS.
- **k is national.** Per province the ratio ranges from 0.84 (Salta, Santiago del Estero) to 1.37 (Misiones).
- **Terra-only period.** 2000-11 to 2002-06 has one MODIS satellite: 2001 has about 40 % of the cell-days of 2003–2004 (D-09, declared, not corrected).

## Unit tests to add

| Area | Test |
|---|---|
| `calibrate.py` | A regime month missing an expected satellite is skipped and listed; `sp_months` counts only months with rows |
| `fetch.py` | `--product sp` maps to SP products and `fuentes/sp/`; no source/day keeps both SP and NRT |
| `museum.py` | Distance filter on raw lat/lon (point at 24.9 km in, 25.1 km out); window padding; verdict thresholds; harmonized uses the regime k of each month |
| `events.json` validation | Non-HTTPS URL, quote > 25 words, unknown province and bad dates fail the build |
| `harmonize.ts::monthBaseline` | Median excludes the compared year, `no_data` and null values; `minYears` |
| `curated-validate.mjs` | Rejects `javascript:`/`data:` URLs, foreign IDs, non-finite coordinates |

## Failure handling

| Failure | Behavior |
|---|---|
| Archive incomplete for some years | Build anyway; those months appear in `months_without_data` and show "no data" |
| A VIIRS satellite missing in SP for a regime | Month skipped from calibration with a warning; k from the remaining complete months |
| NRT fetch fails | Ship with the SP cutoff as the last month; say so in the UI |
| Tavily finds nothing for a candidate | Drop the candidate; take the next from `candidates.json` |
| Event with verdict `none` | Keep it if the sources are solid; the board explains the absence |
| D-14 not approved | Keep the fictional museum labeled as fictional; show curated events as a list on History |
| `hotspots.csv` upstream error | 502 with a short message; the rest of the app is unaffected |

## Demo script

Video ≤ 30 s or ≤ 7 slides (D-11 open). Told from a real fire:

1. **Problem (one line):** MODIS and VIIRS count fires differently; VIIRS went from one to three satellites.
2. **Hook:** one museum event: "MODIS saw X cell-days, VIIRS 2X; harmonized, Y".
3. **Calendar:** Argentina 2000–2026 on one scale; pick the event's province and month; anomaly vs median.
4. **Method and validity:** k per regime, holdout error, S-NPP drop test (numbers from the table above).
5. **Download:** CSV of the selection.
6. **Close:** who uses it (emergency managers, brigades, land managers, scientists).

## Submission checklist

- [ ] App, submission page and linked materials in English.
- [ ] Data and resources declared: NASA FIRMS (MODIS C6.1, VIIRS 375 m: S-NPP, NOAA-20, NOAA-21), NASA Blue Marble: Next Generation (January 2004, topography and bathymetry; NASA Earth Observatory, Reto Stöckli) as the globe texture, NASA EONET if used, provincial boundaries source, Tavily (curation), every source URL used in the museum.
- [ ] Tools and AI use declared: Claude Code, Tavily MCP/API, any other assistant used by the team.
- [ ] No NASA logos or branding in generated content; AI-generated images or video carry a visible watermark.
- [ ] Deployed URL works logged out; no key in the browser.
- [ ] Submitted before 2026-11-15 23:59 local time.
