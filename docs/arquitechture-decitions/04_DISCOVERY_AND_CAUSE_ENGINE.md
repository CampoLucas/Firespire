# 04. Discovery and cause engine

[Index](00_START_HERE.md) · [Providers](03_PROVIDER_API_IMPLEMENTATION.md) · [Contracts](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md)

## Contents

[FIRMS grounding](#firms-grounding) · [Query plan](#query-plan) · [Source parsing](#source-parsing) · [Eligibility and identity](#eligibility-and-identity) · [Cause rules](#cause-rules) · [Pseudocode](#pseudocode) · [Filters and states](#filters-and-states) · [Synthetic cases](#synthetic-cases)

## FIRMS grounding

The engine discovers documentation for a selected place/time with observed thermal activity. It never determines which detection belongs to a particular fire. All relationships to FIRMS are `regional_context` in this first release. Do not implement automatic promotion to `explicit_link` until a separate source-backed record can actually justify that assertion.

### Geography

Resolve `area.kind` server-side:

- `country`: only `AR` is backed by the initial data; use the union-as-MultiPolygon collection of supplied provincial geometries, not an enclosing South America box.
- `province`: stable `AR:` + normalized official province name, resolved from `pipeline/resources/provincias.geojson::features[].properties.name`; browser `PROVINCIAS` indices translate by exact normalized name, not assumed identical ordering.
- `polygon`: one uploaded GeoJSON Polygon/MultiPolygon with WGS84 `[longitude,latitude]`, maximum 500 vertices/20 rings. Validate finite bounds, closed rings, outer/hole structure, nonzero area and simple rings. Reject self-intersections, unclosed/degenerate rings, unsupported CRS and antimeridian crossings. Country is `AR` and clip to the known country footprint. Warn if input extends outside it; do not claim coverage there.

Bounding-box prefilter first, then boundary-inclusive point-in-polygon with holes: a point on outer or hole boundary is retained and marked boundary-touching; a point strictly inside a hole is excluded. Overlapping province borders do not duplicate raw detections in a country union. Do not invoke the existing nearest-province fallback for discovery. That fallback exists in `pipeline/src/firespire/globe.py::assign_provinces`, not as documentary location evidence.

Human search terms come from verified selected administrative names. For a custom polygon, intersect it with known province boundaries and use up to two names represented by retained FIRMS points. Do not invent a municipality or resolve the location from IP/browser locale. No new geocoder is required.

### Time, sensor and missing coverage

Dates are inclusive UTC civil days, with 1–366 days per request. Cross-year intervals are allowed if every day lies in certified index coverage. Confidence and day/night apply before window generation, matching `index.html::pass` classes. Preserve `type` and sensor provenance; no new wildfire-only filter is secretly applied. A thermal record is contextual evidence, not proof of a wildfire.

Coverage is source-file availability, not whether every place/day has detections. The initial index certifies 2023–2024 CSV availability; no observation on a covered day is distinct from unavailable data. Outside those slices return `historical_data_unavailable` before paid search, unless the optional keyed adapter has separately verified and fetched the missing slice. Do not substitute 2024 for 2025 or use monthly History zeroes as daily observations.

### Bounded activity windows

1. Group filtered raw observations by trusted administrative region, ISO UTC day and **product**. For ranking use NOAA-20 VIIRS counts if present; otherwise MODIS. Record which product selected the windows. Never add product counts to create a harmonized severity score.
2. Compute seven-day rolling sums within the selected interval, clipped at its edges. For country/custom queries use the intersecting province names represented by activity. Pick the highest-count window, suppress overlapping windows for that same region, then select a second window, favoring a different represented province when available. Tie-break by earlier start then region ID.
3. Carry exact selected area, dates, product counts and dataset version/hash into each window. These are search optimizations, not fire perimeters, incident clusters or ignition coordinates. A single documented item can concern multiple windows.
4. EONET gets the full selection bbox/date range once. Brave gets selected region/window terms and later report queries. Responses expose which windows were searched, count of remaining windows, and `coverage:'bounded'`. A long selection can produce incomplete results even with healthy APIs; show that fact.

At least one independently documented occurrence date/period must overlap a selected **active** window, not merely fall somewhere in a full-year query. A broad source occurrence interval is eligible only if it is no coarser than month precision and overlaps the selected interval and active window. Year-only summaries remain contextual leads unless they contain a separately extractable dated passage. This choice trades recall for defensible filtering.

## Query plan

Six Brave requests maximum, including retries and any second page. Base searches run even if EONET returns zero. EONET titles improve terms only after removing catalog boilerplate; keep original title and ID as provenance. Do not create incident names from search phrases.

| Slot | Endpoint | Construction / purpose |
|---|---|---|
| 1 | News | `"{place}" "Argentina" incendio {Spanish month} {year}`, page-date window from incident start through end+14 days |
| 2 | Web | Same geography/occurrence terms without freshness, catching historical pages outside the news index |
| 3 | Web | `"{place or explicit discovered event name}" incendio causa investigación {year}` without freshness |
| 4 | Web | `"{place or explicit discovered event name}" incendio informe peritaje {year} site:{verified agency host}`; Córdoba defaults to MPF, otherwise verified local authority or `site:argentina.gob.ar` for leads only |
| 5 | News or Web | Second activity window/place, or first-page gap fallback if only one useful window |
| 6 | Web | `"{real place/name}" wildfire investigation cause {year}` in English/worldwide, or Spanish PDF report query when Spanish leads already exist |

All query terms are built from actual selections/source text and capped at the stricter News limits. Local Spanish is first for Argentina; accent-insensitive matching is allowed internally but display preserves original spelling. Do not force English on Spanish documents. Future countries need explicit language/authority configuration and data coverage, not an untested universal guess.

The official-report queries intentionally have **no publication freshness ceiling tied to the incident**. Restrict accepted occurrences after extraction instead. A 2025 report about a September 2024 incident may qualify for a September 2024 query. A September 2024 article about a 2010 incident does not.

When time remains, Tavily Search may replace an unused fallback slot for one missing report lead. It does not add an unbounded second search tree. No recursion across arbitrary page links; permit at most one explicitly cited same-agency report attachment per selected source and count it among eight extraction URLs.

### Ranking leads, not truth

Use a transparent retrieval score: +4 explicit selected province/country mention; +4 explicit occurrence-date overlap in available text; +3 verified issuing-agency domain; +2 meaningful fire-topic passage; +2 explicit EONET linked URL or incident ID; -4 ambiguous place; -4 only year-level time; -6 irrelevant/no fire content. Domain points only prioritize extraction. They never affect cause status.

Deduplicate URL candidates, then choose at most eight, reserving up to three positions for plausible primary reports and at least two for independently useful documentary sources. Fill unused reserved slots from the remaining ranked candidates. Exclude search pages, login forms, advertisements, unrelated legislation, and homepages with no incident material. Every rejected lead has a machine-readable reason; absence from output is not evidence that a fire did not happen.

## Source parsing

### Normalization

Preserve original URL/title/provider retrieval time and separate canonical key. Normalize scheme/host case and default port, strip fragment and recognized tracking keys (`utm_*`, `fbclid`, `gclid`); retain all unknown query parameters, path case and meaningful trailing slashes. Never assume two different article URLs are the same because titles match. Use a provider/canonical-page alias only when verified to represent the same resource, retaining both URLs.

Prefer Tavily's accessible text for content; search snippets remain separately labeled. Split content into paragraphs and sentences with original character offsets. Normalize whitespace only in a separate matching representation, so a locator can still point to the original capture hash and paragraph index. Preserve language, unknown values and extraction truncation. An extraction success means text was retrieved, not that its statements were verified.

### Minimal implementable date and location parser

No free-form AI summarizer is needed. Implement explicit patterns for ISO `YYYY-MM-DD`, Spanish `D de MES de YYYY`, English `Month D, YYYY`, and month/year occurrences tied to fire-event verbs. Spanish month aliases include `septiembre`/`setiembre`. For `D de MES` without year, resolve the year only from a verified publication date or a year explicitly governing the same incident paragraph; label `contextual_year`. If there are competing possible years, leave unresolved. Parse `hoy/ayer` only with verified publication date and explicit present-incident context. Do not infer occurrence from URL date, `page_age`, image filename or retrieval time.

Match province names plus Argentina context using exact normalized tokens and aliases from the boundary index. A title containing Córdoba alone may mean Spain; require explicit Argentina/province context or a relevant issuing-agency jurisdiction. Source-supported coordinates must be explicitly labeled event locations, not unrelated contact addresses. EONET geometry can locate a document only when that document is explicitly linked to that catalog event; geographic/date proximity is insufficient.

For an explicit current-status statement such as `a la fecha ... continúa activo`, `actualmente ... incendios` or `currently burning`, a verified page publication date may support **reported active on that day**, never an invented ignition/start date. Require the status sentence to refer to the same place/fire and the dateline to belong to that document. Mere present-tense prose or a search page date is insufficient. Store `semantics:'reported_active_on'` and show “Reported active on …” in the board. This permits genuinely dated response updates without pretending their publication date is an ignition date.

Source date/location assertions carry paragraph locator and short explanation of derivation. Multiple incidents in a source stay separate assertions. For day one, create a **document collection exhibit** at the broad verified region when a source clearly covers several fires; do not assign one sentence's cause to all incidents. If location/time cannot be scoped, keep the lead but exclude it from eligible waypoints.

### Rights and presentation

Do not treat public access as republication permission. Default board: original title, publisher/agency, separate date fields, a concise attributed factual summary generated by deterministic templates, access status and outbound URL. Include an exact brief quote only if the source's reuse basis allows it; configure a conservative 25-word maximum per source in the public response, with no claim that a word count grants rights. Internal finding locators can retain hashes/offsets and a cause paraphrase without returning the original full text. Photos remain link-only unless provenance and license expressly permit display.

If text is inaccessible, useful public snippets may support an unknown/unofficial metadata exhibit only when they independently meet occurrence/place/content gates. A headline alone never qualifies. A missing report can remain a linked attachment on an otherwise eligible board; it cannot supply unread findings.

## Eligibility and identity

| Stage | Required checks | Output |
|---|---|---|
| Candidate | Real returned URL/event lead | Internal candidate with retrieval provenance |
| Eligible waypoint | ≥1 meaningful documentary source; URL/title; explicit fire subject; supported place; occurrence interval ≤month precision overlapping selection and active window; safe complete board payload | Retained regardless of cause category |
| Visible waypoint | Eligible, current query key, ready, selected cause flag on | Marker or region locator + dock entry |

Meaningful content is at least one substantive statement beyond the title about an occurrence, response, observed effect or investigation. Length alone is not a guarantee; reject boilerplate even if long. FIRMS and EONET cards can supplement, but cannot satisfy the documentary-source minimum.

For province-level place evidence, show a dashed regional locator explicitly labeled “Approximate: province-level documentation.” Its `displayAnchor` is a camera/label convenience computed from the boundary, not a reported fire point. Store source geometry and display anchor separately. For a custom polygon smaller than the source's province, province overlap alone is **not sufficient**: require a supported point inside, an explicitly relevant documented area contained in the AOI, or keep the broad source only in the excluded/contextual count. Do not make a precise marker out of a province center.

IDs: source `src_` + first 24 hex SHA-256 canonical URL; claim `clm_` + hash(source ID, normalized statement, explicit incident key); document waypoint `wp_` + hash(anchor source ID, source-scoped occurrence assertion). Do not include fetch timestamp, filter category or current result order in identity. Revisions separately hash public contents/classifier version. Collision checks compare full identity inputs, not merely truncated hashes.

Grouping requires an explicit same-incident ID/citation plus compatible location/time. Same name alone is not enough. With insufficient identity, retain separate exhibits; a country-wide article and an EONET point are not silently merged. A document collection uses its own source ID as anchor and does not claim a uniquely identified fire. New supporting sources do not change that anchor ID. Every evidence ID includes waypoint ID to prevent cross-board leakage.

## Cause rules

### Extract candidates, then apply authority checks

Scan sentences plus adjacent paragraph context for ES/EN expressions such as `causa`, `origen`, `se determinó`, `concluyó`, `causado por`, `cause`, `determined`, `investigation concluded`. Extract only the explicitly stated cause phrase, with source ID, scope and locator. A sentence about conditions favoring spread (wind/drought) is not necessarily an ignition cause. Reject general statistics (“most fires are human-caused”), recommendations, hypothetical explanations and generic background from incident-cause classification.

Negation/hedging guards include `no se pudo determinar`, `se desconoce`, `bajo investigación`, `preliminar`, `podría`, `presunto`, `hipótesis`, `not determined`, `under investigation`, `suspected`, `may have`. Apply to the whole relevant paragraph, not only a matched keyword. “No se descarta” is uncertainty, never confirmation. “Detenido/imputado/charged” is not a final finding of ignition or guilt.

`official_final` requires **every** gate below:

1. Primary issuing document accessible beyond search snippet, with original URL, content hash, retrieval date and exact paragraph locator.
2. Exact recognized authority host/path and issuer identity agree; institution has relevant investigative/finding role for this jurisdiction. Agency role verified in registry, not inferred from `.gov` alone.
3. Document directly states the agency's own finding, not quoting another publisher or describing an allegation. Explicit final/conclusive language or a recognized structured final finding field is present.
4. Statement applies to the identified incident/occurrence assertion. Multiple incidents, unclear pronouns, mismatched dates or a region-wide generalization fail this gate.
5. Concrete ignition cause is affirmatively determined; no negation, unresolved hedge, provisional status, extraction truncation affecting context or explicit retraction/supersession.

Store each gate's pass/fail basis. A rule pass means **documented agency attribution**, not independently proven physical truth. An unrecognized wording fails conservatively; do not add a permissive regex just to populate the green filter. No mandatory human approval step is inserted into normal discovery, and no AI output serves as verification.

### Precedence and conflicts

| Available current evidence | Primary category | Internal note |
|---|---|---|
| Qualifying active official final cause claim | `official_documented` | Retain all conflicting reports; `disputed:true` when appropriate |
| Two incompatible official final claims without explicit supersession | `official_documented` | `disputed:true`, no single consolidated cause; show both agencies' positions |
| Only nonofficial attributed cause claim, including a newspaper quoting officials without the primary finding | `unofficial_reported` | Attributed report, not independently established |
| Only official preliminary suspected cause | `cause_unknown` | `still_under_investigation`; preserve preliminary claim |
| Official explicitly undetermined, no other cause report | `cause_unknown` | `officially_undetermined` |
| No cause statement in accessible sources | `cause_unknown` | `no_cause_found_in_accessible_sources` |
| Official undetermined plus nonofficial cause report | `unofficial_reported` | Disagreement banner and official-undetermined reason retained |
| Retracted final finding, no remaining valid cause claim | Recompute from remaining claims | Never let old official status persist automatically |

Supersession requires explicit correction/retraction or an identified later final report for the **same authority and incident**, not simply a later timestamp. Preserve historical claims with `retracted/superseded` status. For unknown reason precedence use current explicit undetermined, then current under-investigation, then no accessible cause; also retain all underlying statuses. Pending/unverified official candidates with a concrete cause remain unknown unless a separate nonofficial report exists. This is intentionally stricter than treating all published guesses as equivalent.

## Pseudocode

```text
discover(input, requestContext):
  q = validateAndResolveArea(input)       # trusted geometry; no client FIRMS claims
  context = loadFirmsContext(q)
  if context.coverage != certified: return historical_data_unavailable
  if context.filteredObservationCount == 0: return no_activity
  windows = chooseAtMostTwoActivityWindows(context, q)
  start EONET(q) and initial Brave searches(windows), under shared deadline
  leads = union(successful initial sources)
  run remaining budgeted Brave queries using leads + verified places
  if no EONET result: continue the same Brave path
  selected = rankAndDedupe(leads).takeAtMost(8)
  extraction = TavilyExtract(selected.safeURLs)
  sources = normalize(selected, extraction.successes, extraction.failures)
  assertions = parseDocumentScopedPlacesAndOccurrenceDates(sources)
  claims = extractCandidateCauseClaims(sources, assertions)
  assessed = applyAuthorityFinalityScopeAndNegationGates(claims)
  waypoints = buildURLAnchoredEligibleWaypoints(assertions, assessed, context)
  for waypoint: classify; construct only sourced evidence and supported edges
  exhibits = validateEvery(toLiveExhibit(waypoints))
  return all categories + coverage + failures + ready exhibits
```

The global deadline aborts further providers and returns only finalized exhibits. Never serialize a half-classified candidate as ready. Failure does not create a fictional fallback. Full interface definitions are in [05](05_DATA_CONTRACTS_AND_UI_INTEGRATION.md).

## Filters and states

Initial flags are `{official_documented:true,unofficial_reported:false,cause_unknown:false}`. Reset restores those flags. Each checkbox is independent, and counts refer to the same retained result set. No cause toggle changes `index.html::st.layers` or removes thermal activity.

Official marker: teal `#239B87`, square/check. Unofficial: amber `#E6A23C`, diamond/exclamation. Unknown: gray `#9298A6`, circle/question. Label and accessible name include category and approximation; color is redundant. An approximate marker additionally uses a dashed halo and “region” label. Region locators for the same place may fan out in screen space with leader lines to the same region anchor, or use the existing dock list; no geographic coordinates are offset to suggest distinct ignition points.

| Condition | Exact main message / behavior |
|---|---|
| No official visible, other eligible categories exist | “No officially documented causes found for this selection. You can include unofficial reports or unknown causes.” Show category counts |
| Healthy bounded search, no eligible documentation | “No documented case found in this bounded search. Satellite activity remains available.” |
| Coverage missing | “Documentary discovery cannot run for this selection because verified FIRMS coverage is unavailable.” List supported range |
| No filtered activity | “No satellite detections in the available data for these filters.” Do not say no fires occurred |
| Provider failures with results | “Search incomplete. Some sources could not be retrieved.” Show successful ready records and retry action |
| All filters off | “All documentary categories are hidden.” Do not repeat provider calls |
| Selection changed | “Selection changed. Search again for this area and period.” Hide stale markers |
| Extraction failed for one source | “Source text unavailable; public metadata and original link only.” No unread finding |

## Synthetic cases

**Every example in this table is synthetic test data, not a real incident or source.** Use reserved `.example` URLs in unit fixtures only; the live URL validator rejects them.

| Fixture | Input | Expected |
|---|---|---|
| S1 | Recognized synthetic authority, explicit same-incident final lightning finding, complete text/locator | Official, visible initially |
| S2 | Newspaper says “officials confirmed equipment failure”; no primary report retrieved | Unofficial, hidden initially |
| S3 | Government page says investigation continues | Unknown / still under investigation |
| S4 | Government page says cause could not be determined | Unknown / officially undetermined |
| S5 | Fire response document has place/date and no cause wording | Unknown / no cause found |
| S6 | 2025 report explicitly finds a cause for September 2024 incident | Eligible for September 2024; report date remains 2025 |
| S7 | Cause sentence concerns a different fire in the same article | No cause transfer to selected occurrence |
| S8 | Article only names the province; visitor selects a tiny polygon inside it | Broad source excluded from AOI waypoints; no invented precise pin |
| S9 | EONET empty, Brave supplies a dated/place-supported document | Eligible independent of EONET |
| S10 | Final official equipment finding conflicts with newspaper arson allegation | Official category plus both attributed claims and disagreement |
| S11 | “No evidence established lightning as the cause” | Not an official lightning claim |
| S12 | FIRMS observations and EONET entry, no useful linked document | No waypoint |
| S13 | Later explicit withdrawal of S1 | Reclassify without deleting source history |
| S14 | Source URL reused after changed contents | Same source identity, new revision/hash; rerun classification |
