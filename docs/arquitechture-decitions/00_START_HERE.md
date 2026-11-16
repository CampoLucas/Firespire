---
type: Decision
title: "Firespire MVP architecture package — start here"
description: "Core-first MVP for the NASA Space Apps 2026 MODIS/VIIRS challenge: harmonized calendar 2000–today, region and date selection, downloads, and a curated museum cross-matched with FIRMS."
tags: ["firespire", "nasa-space-apps-2026", "architecture", "mvp"]
sources:
  - "https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details"
  - "../finalidad.md"
  - "../decisiones.md"
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-15T14:25:00-03:00"
---
# Firespire MVP: start here

**15 November 2026, submission closes 23:59 local time.** This package replaces the earlier "live museum discovery" design (Brave + Tavily + cause engine, kept in git at commit `f6ab34f`). The new goal is a **functional MVP that covers every core requirement of the challenge**, with the Museum of Fires as a data-backed creativity feature.

## Decision

1. **The harmonized burning-activity calendar is the product spine.** Everything else (globe, museum) supports it.
2. **Ingest the full FIRMS archive (MODIS from 2000-11, VIIRS from 2012-01) plus NRT up to today**, and harmonize with the existing Python method (k per VIIRS constellation regime, MODIS scale).
3. **Museum = curated static dataset**: 3–5 real fire events chosen from the data, documented offline with **Tavily** (API or MCP), reviewed by a person, and **cross-matched against FIRMS detections (lat/lon) and the harmonized series** by the pipeline.
4. **No Brave, no runtime search, no cause-classification engine.** The only runtime key is `FIRMS_MAP_KEY` (server-side).

## Core requirements checklist

From the challenge text (`references/nasa-space-apps-2026/modis-viirs-hotspots.md` in the vault) and [finalidad](../finalidad.md).

| Requirement | Level | Today | MVP plan | Where |
|---|---|---|---|---|
| Harmonize MODIS and VIIRS so the sensor no longer matters | Core | Partial: method exists, k biased (calibrated on NOAA-20 only) | Full SP archive for all satellites + completeness guard | [06 Track A](06_IMPLEMENTATION_RUNBOOK.md#track-a-data-and-harmonization) |
| Burning-activity calendar from the early 2000s | Core | No: starts 2023-01 | Rebuild artifacts on 2000–today | Track A |
| Web app: select region and date range | Core | Province yes, date range no | Add from/to controls (API already supports them) | [06 Track B](06_IMPLEMENTATION_RUNBOOK.md#track-b-web-core) |
| Download analytics and visualizations | Core | CSV of harmonized cell-months | Keep; add chart PNG/SVG download | Track B |
| Current month vs historical median | Recommended | No | Median of same month across years, per selection | Track B |
| Accessible color ramps | Recommended | Partial | Sequential ramp for counts, diverging for anomaly, CVD-safe | Track B |
| CSV of hotspots detected during a search | Recommended | No | `/api/v1/hotspots.csv` proxy to FIRMS, ≤10 days | Track B (cuttable) |
| Draw area or enter lat/lon | Optional | No | Out of MVP; museum uses lat/lon internally | — |
| Anomalies vs multi-year averages | Optional | No | Same function as the median comparison | Track B |

## Reading order

| Order | File | Use |
|---|---|---|
| 1 | [01 Current application audit](01_CURRENT_APPLICATION_AUDIT.md) | What exists, what is missing, known data and method gaps |
| 2 | [02 Architecture and ADRs](02_ARCHITECTURE_AND_ADRS.md) | Data flow, decisions, what is deferred |
| 3 | [03 Providers](03_PROVIDER_API_IMPLEMENTATION.md) | FIRMS archive and API, Tavily (API and MCP), EONET |
| 4 | [04 Museum curation and FIRMS cross-match](04_DISCOVERY_AND_CAUSE_ENGINE.md) | How events are chosen, documented and matched to detections |
| 5 | [05 Data contracts and UI](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md) | `events.json`, `museum.json`, `hotspots.csv`, median function, UI changes |
| 6 | [06 Implementation runbook](06_IMPLEMENTATION_RUNBOOK.md) | Three parallel tracks with steps, estimates and checks |
| 7 | [07 Setup, run and deploy](07_SETUP_RUN_AND_DEPLOY.md) | Windows commands, keys, Tavily MCP, Vercel |
| 8 | [08 Testing and release](08_TESTING_FAILURES_AND_RELEASE.md) | MVP gates, numbers to publish, demo and submission checklist |

## Today-ready definition

- History page shows the **harmonized calendar from 2000-11 to the latest NRT day**, per province and date range, with months without data shown as "no data", not zero.
- `calibration.json` has a k for every VIIRS regime with SP data, computed only from months where all expected satellites are present; `validation.json` holdout is not `skipped`.
- The selected month is compared with the median of the same calendar month in previous years, with the anomaly in percent.
- CSV download works for the selection.
- The museum shows 3–5 curated events, each with real source links and a FIRMS cross-match: MODIS raw, VIIRS raw and harmonized numbers for the event's area and dates.
- Deployed on Vercel; no key reaches the browser.

## Time plan (about 9.5 hours left at 14:20)

| Track | Work | Estimate |
|---|---|---|
| A — Data and harmonization | place archive, SP/NRT cutoff, `fetch` SP option, satellite-completeness guard, `build`, check k and holdout | 2–3 h |
| B — Web core | date range, median comparison and anomaly ramp, History as landing page, `hotspots.csv` proxy | 3–4 h |
| C — Museum | candidate ranking, Tavily curation of 3–5 events, cross-match to `museum.json`, museum adapter | 4–5 h |
| All | deploy, demo video or slides, English submission page | 2 h |

Tracks run in parallel. Track C needs Track A's `build` for the final cross-match, but candidate ranking and Tavily curation can start on the 2023–2024 data already in the repo.

**Cut line if late:** drop `hotspots.csv`, globe data for 2000–2022, and reduce the museum to 3 events. **Never cut:** archive ingest, harmonized calendar, median comparison, published validation numbers.

## Open team decisions this package proposes

- **D-01** (product spine): close as option (a), with the harmonized calendar as the core.
- **D-10** (museum events): close as "curated list chosen from the data, documented with Tavily, reviewed by a person".
- **D-14 (new)**: the museum shows **real** curated events with an **explicit, computed spatiotemporal link** to FIRMS detections. This changes the current rule in `CLAUDE.md` ("fictional exhibits, no inferred links with real detections"). Needs team approval before Track C step C5.
