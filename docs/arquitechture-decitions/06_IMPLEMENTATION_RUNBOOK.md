# 06. File-by-file implementation runbook

[Index](00_START_HERE.md) · [Contracts](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md) · [Operator guide](07_SETUP_RUN_AND_DEPLOY.md)

## Contents

[Rules and starting point](#rules-and-starting-point) · [Step 1: baseline and contracts](#step-1-baseline-and-contracts) · [Step 2: trusted FIRMS index](#step-2-trusted-firms-index) · [Step 3: provider adapters and probes](#step-3-provider-adapters-and-probes) · [Step 4: smallest live backend](#step-4-smallest-live-backend) · [Step 5: first real board](#step-5-first-real-board) · [Step 6: cause engine and eligibility](#step-6-cause-engine-and-eligibility) · [Step 7: complete selection and filters](#step-7-complete-selection-and-filters) · [Step 8: harden readiness and provenance](#step-8-harden-readiness-and-provenance) · [Step 9: release checks](#step-9-release-checks)

## Rules and starting point

This document instructs a **later coding stage**. None of the proposed files or endpoints exists in the supplied app. No implementation was performed for this package. Paths are relative to the application root. Use the existing npm lockfile and supported Node version; no framework upgrade, new backend service, team allocation or redesign.

Before coding, read `web/AGENTS.md` and its matching installed Next docs. The archive's exact version uses default Node with Cache Components and forbids an explicit runtime export. Preserve `web/next.config.ts::{cacheComponents,partialPrefetching}`; do not disable them to make old boilerplate work.

Use one isolated integration branch/checkpoint where available. Do not edit `fuentes/`, existing `public/globe/data/`, existing `public/artifacts/`, or pipeline calibration as part of this task. All observed code constraints are documented in [01](01_CURRENT_APPLICATION_AUDIT.md).

## Step 1: baseline and contracts

**Existing files:** `web/package.json`, `web/package-lock.json`, `web/tsconfig.museum.json`, `web/lib/__tests__/museum.test.ts` (read first). **Proposed:** `web/lib/museum/contracts.ts`, `validate.ts`, browser `live-contracts.d.ts`, `live-validate.mjs`.

From `web/`, run existing commands:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run check:museum
npm.cmd run lint
npm.cmd run build
```

Record any baseline failures before changing code. Build may require access to the Google font imported by `web/app/layout.tsx::RootLayout`; an external network failure is not evidence the new routes fail. Do not opportunistically upgrade dependencies.

Implement the contracts in [05](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md). Use explicit runtime guards rather than adding a validation framework for this small schema:

```ts
validateDiscoveryRequest(value:unknown): DiscoveryRequest;
validateDiscoveryResult(value:unknown): DiscoveryResult;
validateLiveExhibits(exhibits:unknown): LiveExhibit[];
```

Reject malformed ISO dates, reversed ranges, nonfinite/out-of-range coordinates, unsupported area types and all URLs unsafe for their role. Limit bytes before JSON parse. Implement type-only browser imports; keep `.server.ts` out of public runtime dependencies. Browser `.mjs` still participates in `check:museum`.

**Check:** synthetic corrupted-source/foreign-board/URL cases fail; existing mock validator tests remain valid. **Fallback:** a corrupt exhibit is excluded with a partial warning; never relax validation to force entry. Dependency: none beyond baseline.

## Step 2: trusted FIRMS index

**Existing files:** read four `fuentes/*_202[34]_Argentina.csv`, `pipeline/resources/provincias.geojson`, `web/public/globe/data/provincias.js`; touch `web/.gitignore` and `web/package.json` only to add named scripts/ignore diagnostics. **Proposed:** `web/scripts/build-discovery-data.mjs`, `web/data/museum/*`, `web/lib/museum/firms-context.server.ts`.

Add **proposed** script `"data:museum":"node scripts/build-discovery-data.mjs"`. Do not automatically regenerate unrelated datasets. The script runs from `web/`, reads `../fuentes` and `../pipeline/resources/provincias.geojson`, and writes only `web/data/museum/`.

Implement with Node filesystem/crypto/streams. Parse CSV headers by name. A small quote-aware CSV state machine is sufficient; support CRLF and quoted fields, reject malformed records instead of silently splitting commas. Preserve raw coordinate precision, satellite, instrument, confidence, type, version and UTC date/time. Do not apply pipeline persistent-source masking or harmonization.

Index contract (all **proposed**):

```text
coverage.json:
  schemaVersion=1, datasetVersion="firms-local-2023-2024-v1"
  datasetHash=hash(source hashes + boundary hash + generator version)
  generatedAt, generatorVersion
  files[] = {id, filename, sha256, rowCount, minDate, maxDate,
             productId, satelliteValues, versionValues}
  intervals[] = {startDate, endDate, fileIds, completeness:"available_records"}
  shards[] = {month, filename, sha256, rows}
boundaries.json:
  schemaVersion=1, sourcePath, sourceHash
  regions[] = {id, name, aliases, countryCode, bbox, geometry, displayAnchor}
YYYY-MM.json:
  schemaVersion=1, month
  cols = {lat[], lon[], day[], acqTime[], sourceFileId[], satellite[],
          instrument[], confidenceRaw[], confidenceClass[], dayNight[],
          frp[], type[], version[], rowId[]}
```

`rowId` hashes source file hash and CSV row number. All columns have identical length and stable acquisition-time/row-ID ordering. `productId` describes the actual local file product (for example `local:viirs-jpss1-country-archive`), not an assumed API source name. Unknown metadata remains null. Dataset coverage means files supplied for those intervals, **not complete observation of all fires**.

Boundary IDs are `AR:` plus lowercased accent-folded official name with nonalphanumeric runs replaced by hyphens (`AR:cordoba`, `AR:corrientes`). Resolve browser indices by names. Keep the actual boundary source/hash and precision disclaimer. Calculate a point-on-surface display anchor: choose largest non-Antarctic polygon by planar area, choose a scanline through its bbox midlatitude, subtract hole intervals and take midpoint of the longest remaining interior interval; if degenerate, try quarter/three-quarter scanlines. Validate anchor in polygon. It is a region label/camera target only.

Implement:

```ts
loadCoverage(): Promise<CoverageManifest>;
resolveArea(request:DiscoveryRequest): Promise<ResolvedArea>;
loadFirmsContext(request:DiscoveryRequest, signal:AbortSignal): Promise<FirmsContext>;
chooseActivityWindows(context:FirmsContext, limit:2): ActivityWindow[];
```

Use bbox prefilter and exact raw point-in-polygon, holes/boundary rules from [04](04_DISCOVERY_AND_CAUSE_ENGINE.md#firms-grounding). Filter day/night/confidence. For large country spans iterate month by month; do not retain every year's points in memory. Certify only included input years. Hash checks detect stale/missing index files; error before paid search.

**Commands after adding the script:**

```powershell
npm.cmd run data:museum
Get-Content .\data\museum\coverage.json
```

**Checks:** source row totals in [01](01_CURRENT_APPLICATION_AUDIT.md#firms-coverage); counts with no geography filtering reconcile to raw CSV totals; a hole excludes interior points; a very small custom polygon uses raw positions; 2025 and 2026 unsupported requests do not become zero-activity. **Fallback:** missing index yields 503/coverage unavailable and leaves globe working. Do not accept client-supplied FIRMS observations as substitute.

## Step 3: provider adapters and probes

**Existing:** extend `web/.env.example`; no existing API changed. **Proposed:** `providers/http.server.ts`, `eonet.server.ts`, `brave.server.ts`, `tavily.server.ts`, `firms.server.ts`, `web/scripts/probe-providers.mjs`, `web/lib/museum/cache.server.ts`.

Implement plain fetch signatures:

```ts
getEonetLeads(query:ResolvedQuery, ctx:CallContext): Promise<ProviderOutcome<EonetLead[]>>;
searchBrave(kind:'news'|'web', query:SearchQuery, ctx:CallContext): Promise<ProviderOutcome<DocumentLead[]>>;
extractSources(urls:string[], ctx:CallContext): Promise<ProviderOutcome<ExtractBatch>>;
getFirmsAvailability(ctx:CallContext): Promise<ProviderOutcome<FirmsAvailability>>;
fetchFirmsSlice(slice:FirmsSlice, ctx:CallContext): Promise<ProviderOutcome<Observation[]>>;
```

`CallContext` contains deadline, abort signal, counter/queue references and server configuration. Require server-only import boundaries in the route dependency graph. If adding `server-only` guards requires an explicit dependency, add that single guard dependency and lockfile update deliberately; it is not a reason for broad updates. Tests can import pure mapping helpers separately.

Proposed probe CLI: `node --env-file=.env.local scripts/probe-providers.mjs --provider eonet|brave|tavily|firms [--url <HTTPS>]`. It runs direct operator requests with the formats in [03](03_PROVIDER_API_IMPLEMENTATION.md). Brave probes News and Web independently; Tavily requires one **URL returned by the actual Brave probe**. FIRMS probes availability before an optional one-day slice. It prints HTTP status, counts, elapsed time, safe source URLs/request IDs and warning codes only, exits nonzero for auth/protocol failure, and never prints headers, keys, full raw text or MAP_KEY URLs. Optional redacted diagnostics go to ignored `web/.museum-probes/` only with `--save`.

**Check:** run live probes before any official-cause or UI work. **Fallback:** EONET empty/down still allows Brave; missing Brave blocks full discovery acceptance; Tavily failure permits honest snippet-only unknown exhibits but does not pass extraction integration. Do not invent mock provider successes. Full NASA live fallback is optional for the primary local-data slice; leave it disabled unless availability fields are actually verified.

## Step 4: smallest live backend

**Proposed:** `normalize.ts`, `waypoints.ts`, `discover.server.ts`, `adapter.ts`, `/api/museum/discover/route.ts`, `/api/museum/status/route.ts`. **Existing:** extend `web/next.config.ts::outputFileTracingIncludes` for `"/api/museum/*":["./data/museum/**/*"]`, preserving existing route entries.

Implement the initial vertical path first: validated Córdoba September 2024 selection → real local FIRMS activity → EONET + Brave News/Web → Tavily text for one returned source → explicit supported place/date → unknown-cause waypoint → one-card LiveExhibit. Use source title and attributed content; no incident catalog. In this intermediate checkpoint every cause remains unknown until Step 6, and release status must say classification incomplete.

Route structure:

```text
POST(request):
  reject if disabled / bad origin / wrong content type / body over 32 KiB
  validate input and start 50-second combined abort deadline
  apply rate limit and cache policy
  await discover(input, context)
  validate DTO and serialized bytes <= 1 MiB
  return no-store JSON with requestId and appropriate semantic status
  always clear timers, remove cancelled in-flight entries and release limiter
```

Export `maxDuration=60`. Omit runtime/dynamic/revalidate exports for this installed Next version. Do not use `after()` to run discovery after a response. Use `await connection()` in status GET to avoid build-time environment snapshots. Keep paid requests out of status. Limit route response to public allowlisted fields.

**Check:** POST from PowerShell with proper Origin returns real URLs, all `isMock:false`, positive FIRMS context and a ready unknown exhibit. Same request must not silently use `catalog.mjs`. **Fallback:** source cannot be placed/dated → reject it, try remaining actual leads, then truthful empty/partial result. A failed geography parser is not permission to use query terms as if a document stated them.

## Step 5: first real board

**Existing touched:** museum `index.mjs::{mountMuseum,fillIntro,refresh,select}`, `board-view.mjs::{createBoard,renderEvidence}`, `board-camera.mjs::overviewPose`, `annotations.mjs`, `contracts.d.ts`. **Proposed:** `discovery-client.mjs`, `board-layout.mjs`.

Implement minimal replaceable result store and `setExhibits`. Inject one valid ready live payload into the existing flow through the real endpoint; no development hardcoded incident. Add the separate live validator. Move neutral board dimensions out of `catalog.mjs` for live imports and implement per-exhibit dimensions. Preserve mock fixture imports only inside their tests/explicit fixture mode.

Replace live fictional labels, add real original-source anchor, add `event` evidence card type, and build layout solely from available records. Keep countdown and reducer tokens unchanged. Add a temporary explicit unknown filter control immediately so the first live board can actually be opened; official-only stays the initial default even during development.

**Check:** click discovered unknown waypoint after enabling Unknown; camera approaches, Start or five seconds enters the existing physical board, one real source opens, Whole board/exit restore camera. No fictional evidence, labels or image assets appear as documentation.

**Safe stopping point if external access blocks further progress:** leave this as a clearly incomplete **live integration checkpoint**, with default filters and honest limitations. It is not final acceptance until all next steps pass. If the endpoint never produces a real eligible waypoint, stop claiming success and report the exact provider/data/parser blocker.

## Step 6: cause engine and eligibility

**Proposed:** `causes.ts`, `authorities.ts`; extend `normalize.ts`, `waypoints.ts`, `adapter.ts`. **Existing touched:** annotation helpers and live renderer labels only as needed.

Implement:

```ts
parseAssertions(source:SourceCapture, area:ResolvedArea): SourceAssertions;
extractCandidateClaims(source:SourceCapture, assertions:SourceAssertions): Claim[];
assessClaim(claim:Claim, source:SourceCapture, registry:AuthorityRegistry): Claim;
classifyCause(claims:Claim[]): {status:CauseStatus;unknownReason:UnknownReason|null;disputed:boolean};
createEligibleWaypoints(records:NormalizedRecords, context:FirmsContext): Waypoint[];
```

Follow [04](04_DISCOVERY_AND_CAUSE_ENGINE.md#cause-rules) literally: scope, finality, negation, accessibility, institutional role, explicit retractions and disagreements. Parse original sentences with locators; do not rely on a summary. Implement URL-first identities, cross-board ID validation, exact source membership and supported edge rules. Do not merge EONET leads into documents without explicit linkage.

Seed only agency **identity/role rules**, with primary institutional URLs and checked date; no fixed incident IDs, cause statements or source URL list as runtime output. Treat CONAE/IDECOR as mapping roles, MPF as a candidate investigative role in Córdoba. Unknown authorities produce unknown causes pending registry verification, not automatic official status.

**Check:** all synthetic decision cases in [04](04_DISCOVERY_AND_CAUSE_ENGINE.md#synthetic-cases); real retrieved no-cause/official-preliminary pages stay gray. Search later reports without a narrow publication limit. If no positive final finding is accessible, document the limitation; do not weaken classification. **Fallback:** ambiguous statement stays unknown/unverified with basis, while legitimate documentary exhibit remains available.

## Step 7: complete selection and filters

**Existing touched:** `index.html::{museumLegacy,render,setPaths}`, museum `index.mjs`, `museum.css`. **Proposed:** `discovery-controls.mjs` and completed `discovery-client.mjs`.

Implement bridge methods and canonical selection notifications from [05](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md#selection-and-lifecycle). Add explicit Search, Cancel, Refresh, Use current globe selection; optional date overrides; GeoJSON upload/clear and AOI outline. Only Argentina is supported initially; display coverage honestly. Keep old province/date controls functioning and leave the planning view intact.

Three independent filters use one retained all-category result store. Initial/reset official on, others off. Apply cause/precision shape/color/legend and human empty states from [04](04_DISCOVERY_AND_CAUSE_ENGINE.md#filters-and-states). Keep FIRMS layer toggles independent. Counts and status remain visible before someone opts into unknown material.

**Check:** two different selections issue distinct live searches; filter toggles issue zero provider calls; calendar change aborts/marks stale; polygon mismatch does not generate precise pins; 2025 unavailable is distinguishable from no sources. **Fallback:** unsupported polygon or dates show validation/coverage message, not broader silent search.

## Step 8: harden readiness and provenance

**Existing touched:** museum `index.mjs::{select,dispatch,dispose}`, `board-view.mjs::mark`, `annotations.mjs` helpers, existing test suite. **Proposed tests:** `web/lib/__tests__/museum-discovery.test.ts`, `museum-providers.test.ts`, `museum-live-layout.test.ts`.

Add immutable discovery/filter snapshot on entry and freeze discovery controls. Cancel/reject stale network generations. Do not apply refreshed results mid-board. In-source links must bypass card hits/swipe/arrow navigation and remain keyboard accessible. Developer View reports real per-source/provider status, including local FIRMS versus live documentary services. No full-source HTML, iframe or automatic photography.

Test variable layouts, safe links, response byte caps, retry budgets, cancellation, denied origins, malformed JSON, cache invalidation and no cross-waypoint references. Tests target failure modes, not private implementation details. Existing reducer/camera checks continue to pass. Use synthetic fixtures only in unit tests; real probes remain a separate acceptance record.

**Fallback:** disable a bad exhibit, not the entire globe; label a partial response. A stale response never reopens an exited board. Do not silently restore mocks on error.

## Step 9: release checks

Run the existing test/type/lint/build commands once changes stabilize, then the two live query checks and browser journey matrix in [08](08_TESTING_FAILURES_AND_RELEASE.md). Inspect Vercel tracing for private data inclusion and inspect static browser artifacts for secret absence without printing secrets. Deploy to a protected Preview using [07](07_SETUP_RUN_AND_DEPLOY.md#deployment). Re-run real requests on deployment; local success does not prove serverless tracing/timeouts work.

Full release requires: two dynamically discovered source-backed boards, both Brave endpoints and Tavily extraction successful in recorded probes, EONET-empty fallback, three working categories with honest default visibility, exact return behavior and no secret leak. Real official-positive classification may be marked unverified if no qualifying source is found; disclose that explicitly, while synthetic tests verify the category logic. Do not claim a positive real official finding passed when only fixtures were available.

Follow-up hardening only after the working slice: durable cross-instance quotas/cache, wider language/authority adapters, more geography/year datasets, licensed media retrieval and report-specific extraction. None replaces required live dynamic discovery today.
