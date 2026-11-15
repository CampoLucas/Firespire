# Museum of Fires: live discovery implementation package

**15 November 2026. Architecture only.** The supplied application was inspected read-only; no application or dependency file changed.

## Contents

[Decision](#decision) · [Reading and implementation order](#reading-and-implementation-order) · [Today-ready definition](#today-ready-definition) · [Feasibility gates](#feasibility-gates)

## Decision

Extend the existing **Next.js/Vercel app** with bounded `POST /api/museum/discover`, server-only EONET, Brave News/Web and Tavily Extract. Ground searches in the supplied Argentina 2023–2024 FIRMS CSVs. **Find documented fires** prepares complete exhibits before publishing markers, preserving the five-second intro and physical board.

Present: globe/calendar, province selection, camera restoration, fictional boards, Developer View and monthly APIs. Missing: live discovery, custom selection inputs, classification/filters, source links and dynamic layout. Code evidence: [audit](01_CURRENT_APPLICATION_AUDIT.md), `web/public/globe/index.html::museumLegacy`, `web/public/globe/museum/index.mjs::mountMuseum`, `web/app/api/v1/series/route.ts::GET`.

Fixed: FIRMS first, no inferred hotspot causation, documented waypoints only, official-only default, independent unofficial/unknown filters, complete evidence on entry, exact return state. Chosen: explicit search, 50-second deadline, six Brave calls/eight extraction URLs, conservative deterministic parsing; no database, queue or LLM dependency.

## Reading and implementation order

| Order | Document | Use |
|---|---|---|
| 1 | [01_CURRENT_APPLICATION_AUDIT.md](01_CURRENT_APPLICATION_AUDIT.md) | Confirm actual code, coverage and preservation boundaries |
| 2 | [02_ARCHITECTURE_AND_ADRS.md](02_ARCHITECTURE_AND_ADRS.md) | Runtime, lifecycle, budgets, decisions and ownership |
| 3 | [03_PROVIDER_API_IMPLEMENTATION.md](03_PROVIDER_API_IMPLEMENTATION.md) | Exact provider requests, mappings and documented limits |
| 4 | [04_DISCOVERY_AND_CAUSE_ENGINE.md](04_DISCOVERY_AND_CAUSE_ENGINE.md) | Geographic/time eligibility and conservative cause rules |
| 5 | [05_DATA_CONTRACTS_AND_UI_INTEGRATION.md](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md) | Wire contracts and precise existing-renderer changes |
| 6 | [06_IMPLEMENTATION_RUNBOOK.md](06_IMPLEMENTATION_RUNBOOK.md) | Execute file-by-file, beginning with one live source-to-board loop |
| 7 | [07_SETUP_RUN_AND_DEPLOY.md](07_SETUP_RUN_AND_DEPLOY.md) | Windows setup, provider probes, local run and Vercel deployment |
| 8 | [08_TESTING_FAILURES_AND_RELEASE.md](08_TESTING_FAILURES_AND_RELEASE.md) | Release gates, real-response tests and demo checklist |

Implement: baseline/contracts/index → live provider probes → first real source-to-board loop → classification/filters → complete selection/restoration → two-query acceptance → protected deployment. The first loop is a checkpoint, not final acceptance.

## Today-ready definition

Two distinct selected area/time queries each dynamically produce a real source-backed board. EONET-empty discovery works. Dates, locations, causes and original URLs are defensible. All categories are retained; default official-only may legitimately show zero markers. Filters spend no additional quota. Museum transitions, navigation, restoration and Developer View pass file 08. Keys stay server-side.

Initial coverage: Argentina country/provinces/custom GeoJSON areas, 2023–2024. Unsupported slices return explicit coverage states without searching ungrounded data.

## Feasibility gates

Estimate: **3–5 engineering hours** for a first live loop, **8–16 total** for the complete checked integration, conditional on API/source access. Same-day completion is not guaranteed.

**Unverified:** Brave/Tavily credentials and extraction, a positive real official-cause finding, Vercel settings. EONET probes returned four Córdoba leads and zero Corrientes leads. Existing-module assertions passed; no application build/browser test was performed. See file 08 for evidence and blockers.
