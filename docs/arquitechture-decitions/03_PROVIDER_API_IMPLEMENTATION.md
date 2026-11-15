# 03. Provider API implementation reference

[Index](00_START_HERE.md) · [Discovery rules](04_DISCOVERY_AND_CAUSE_ENGINE.md) · [PowerShell probes](07_SETUP_RUN_AND_DEPLOY.md#provider-probes)

## Contents

[Verification status](#verification-status) · [Shared adapter behavior](#shared-adapter-behavior) · [FIRMS](#firms) · [EONET](#eonet) · [Brave News and Web](#brave-news-and-web) · [Tavily](#tavily) · [Official agencies](#official-agencies) · [Account and cost gates](#account-and-cost-gates)

## Verification status

Official documentation was read on **15 November 2026**. Provider docs establish request capabilities, not the team's entitlement or retrieval success. Direct unauthenticated EONET requests were executed; no Brave, Tavily or keyed FIRMS call was made. Example credentials below are placeholders. Example response shapes are schematic, not captured incidents. Endpoint formats derive from the attached functional spec and the linked official references; implementation policy is this package's recommendation.

## Shared adapter behavior

All paths in this section are **proposed** under `web/lib/museum/providers/`. Implement plain server `fetch`; no SDK is needed. Each adapter accepts `signal`, absolute deadline, and a shared request budget. Use `cache:'no-store'` for provider fetches and explicit application caching from [02](02_ARCHITECTURE_AND_ADRS.md#budgets-and-caching).

```ts
type ProviderOutcome<T> =
  | { ok: true; value: T; fetchedAt: string; requestId?: string; truncated: boolean }
  | { ok: false; provider: string; code: 'disabled'|'auth'|'quota'|'timeout'|
      'network'|'invalid_response'|'unavailable'; retryable: boolean;
      retryAfterSeconds?: number };
```

`http.server.ts::fetchBounded` must cap bytes while streaming, reject unexpected content types/invalid shapes, and redact provider messages before returning. Limits: 2 MiB EONET/search responses, 4 MiB extraction response, 8 MiB optional FIRMS CSV; abort immediately on overflow. Do not read an arbitrarily large body before applying limits. A 200 HTML error page is not a successful JSON/CSV response.

At most one retry on a transient network/502/503/504 error, and only if budget/deadline allow. A 429 follows `Retry-After`/provider reset metadata only if the wait fits; otherwise return a retriable warning. Retries count toward six Brave calls. Never retry 400/401/403/422 blindly. Preserve per-provider status and safe request IDs, not full URLs with keys. No source content is logged by default.

## FIRMS

### Use local files first

For verified Argentina 2023–2024, `firms-context.server.ts::loadFirmsContext` reads the proposed private index from the actual `fuentes/{modis,viirs-jpss1}_YYYY_Argentina.csv` inputs. Keep `web/public/globe/index.html::{loadYear,aggregate,calcDaily}` and `web/lib/harmonize.ts::monthlySeries` unchanged. This satisfies real FIRMS grounding without an unnecessary online re-download. Documentary discovery remains live.

### Optional missing-slice adapter

Official reference: [Area API](https://firms.modaps.eosdis.nasa.gov/api/area). The documented path is:

```http
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_MAP_KEY}/{SOURCE}/{WEST},{SOUTH},{EAST},{NORTH}/{DAY_RANGE}/{START_DATE}
Accept: text/csv
```

Coordinates are longitude/latitude: west,south,east,north. `DAY_RANGE` is 1–5; the supplied date starts the inclusive interval. No pagination: split dates into at most five-day chunks. Example product names include `MODIS_SP`, `MODIS_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA21_SP`, `VIIRS_NOAA21_NRT`. A key is free; documented limit is 5,000 transactions per 10 minutes, with requests potentially costing multiple transactions. This is not permission to query global decades.

Check [data availability](https://firms.modaps.eosdis.nasa.gov/api/data_availability/) first:

```http
GET https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{FIRMS_MAP_KEY}/ALL
```

Parse the returned header, require source and minimum/maximum dates; their exact CSV column names have **not been live-verified with a key**. Until verified, disable automatic missing-slice requests and return `historical_data_unavailable`. Never guess an NRT archive range. Prefer standard-processing products for history where available. Acquisition products are not interchangeable. For each missing interval choose one product with full advertised coverage; reject unsupported intervals or cap to five days per request and at most two chunks per user search. Longer backfill is an explicit offline preparation step, not hidden in a 50-second discovery call.

If live fallback is enabled later in this implementation, preserve `coverageMode:'api_verified'`, selected product and fetched date; do not insert observations into the existing globe silently. Present an explicit “discovery context from live FIRMS; globe shows bundled data” notice unless a separately validated globe data refresh has occurred. First-release acceptance uses local matched coverage instead.

| NASA CSV field | Normalized field / rule |
|---|---|
| `latitude`, `longitude` | `lat`, `lon`; finite and legal; then exact polygon clipping |
| `acq_date`, `acq_time` | UTC date/time; pad HHMM to four digits; reject invalid time, never assume local time |
| `satellite`, `instrument`, chosen source | Separate provenance fields; do not invent satellite ID from family alone |
| `confidence` | Preserve raw value; map MODIS <30/30–79/≥80 to 0/1/2 and VIIRS l/n/h to 0/1/2 for globe-compatible filtering |
| `frp`, `daynight`, `type`, `version` | Preserve if present; null when absent; never infer missing type/cause |

FIRMS may return text errors despite a parseable HTTP response; require latitude/longitude/acquisition headers before accepting rows. Header-only CSV means zero observations for that successful request, not an outage. Exact keyed error bodies remain unverified. Do not print request paths containing MAP_KEY. For unavailable history use the [Archive Download workflow](https://firms.modaps.eosdis.nasa.gov/download/), which can require asynchronous preparation; it is not an interactive fallback promise.

## EONET

[Official v3 reference](https://eonet.gsfc.nasa.gov/docs/v3). No API key is used by the successful probes. Date filters are inclusive. **Its bbox differs from FIRMS: west,north,east,south.**

```http
GET https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=all&start=2024-09-01&end=2024-09-30&bbox=-65.771,-29.499,-61.788,-35.015&limit=50
Accept: application/json
```

Map `events[].{id,title,description,closed,categories,sources,geometry}` to leads. A geometry's coordinates are GeoJSON longitude,latitude; keep all dated geometries, clip them to the requested polygon, and retain only relevant geometry dates. `closed` is catalog closure, not a proven extinguishment date. `sources[].url` supplies retrieval leads; the EONET record alone cannot qualify a documentary board.

No offset/cursor is documented for this endpoint. If 50 results are returned, mark possible truncation and request a narrower selection; do not invent pagination or silently declare completeness. No provider request rate guarantee was verified; application cap is one call/search, six seconds. Malformed response, HTML, 429 or downtime produces a warning and Brave continues.

Direct probes performed here:

| Selection | HTTP | Actual result |
|---|---|---|
| Córdoba, 2024-09-01 to 2024-09-30, bbox above | 200 | Four IDs: `EONET_11217`, `EONET_11274`, `EONET_11198`, `EONET_10773` |
| Corrientes, 2023-02-01 to 2023-02-28, bbox `-59.712,-27.271,-55.62,-30.73` | 200 | `events: []` |

These are catalog responses, not verified documentary matches. No source linked from those events was used to assign a cause. A web retrieval tool initially failed to open the Córdoba API URL, but the subsequent direct HTTPS request succeeded. The probe outcomes are not application integration tests.

## Brave News and Web

[News reference](https://api-dashboard.search.brave.com/api-reference/news/news_search/get) · [Web reference](https://api-dashboard.search.brave.com/api-reference/web/search/get) · [rate handling](https://api-dashboard.search.brave.com/documentation/guides/rate-limiting).

```http
GET https://api.search.brave.com/res/v1/news/search?q={ENCODED_QUERY}&country=AR&search_lang=es&count=10&offset=0&freshness=2024-09-01to2024-10-14&extra_snippets=true
X-Subscription-Token: {BRAVE_API_KEY}
Accept: application/json

GET https://api.search.brave.com/res/v1/web/search?q={ENCODED_QUERY}&country=AR&search_lang=es&count=10&offset=0&result_filter=web&text_decorations=false&extra_snippets=true
X-Subscription-Token: {BRAVE_API_KEY}
Accept: application/json
```

Use `URL`/`URLSearchParams`, not manual concatenation. Queries are generated by [04](04_DISCOVERY_AND_CAUSE_ENGINE.md#query-plan); a real initial query is `"Córdoba" "Argentina" incendio septiembre 2024`. `country` biases search origin, not event geography. News supports `ALL` for international fallback; for Web omit the country parameter if the account's schema does not support the intended worldwide value. Always retain place names in query terms and post-filter results.

| Field/constraint | News | Web |
|---|---|---|
| Results | `results[]` | `web.results[]` |
| Core mapping | `url,title,description,extra_snippets` → candidate metadata | Same |
| Page date | `page_age` is page age/publication-or-modification signal | Preserve `page_age` when supplied; otherwise null |
| Publisher | `meta_url.hostname` fallback; `profile.name` only if provided | `meta_url.hostname` fallback |
| Pagination | `offset` counts pages, 0–9; max count 50 | `offset` counts pages, 0–9; max count 20 |
| Query ceiling | 400 characters / 50 words | 600 characters / 75 words |

Application uses count 10, initial page only; one second page may replace an unused query slot. Deduplicate across pages. `query.more_results_available` when present can guide continuation; do not require it for News. Return a bounded-search warning rather than representing six queries as exhaustive coverage.

`freshness=YYYY-MM-DDtoYYYY-MM-DD` filters indexed page dates, **not occurrence dates**. Initial News uses incident start through end+14 days, capped at today's date. Official-finding Web searches omit freshness and include event year/name; this permits later reports. Page age strings like “2 days ago” are not parsed as event dates. Relative “today/yesterday” occurrence language is resolved only against a verified publication date, not the search retrieval timestamp.

Handle `ErrorResponse` defensively: optional `error.{id,status,code,detail}`; use HTTP status as primary. Log provider code/request ID, never token or full raw error. Rate headers include `X-RateLimit-Limit`, `Policy`, `Remaining`, `Reset`; values may represent multiple windows. Parse all windows, stop when any is exhausted, and obey the actual account. This design's 1.1-second spacing is conservative, not a statement about the account quota.

Discovery results are leads. A snippet can support a clearly labeled, conservative metadata exhibit if it explicitly supplies useful fire/place/occurrence information; it never supports `official_documented`. Missing publication/occurrence metadata cannot be invented to satisfy filtering. Keep original URL separately from canonical dedup key. Do not embed thumbnails or preserve raw search responses indefinitely.

## Tavily

### Extract

[Official Extract reference](https://docs.tavily.com/documentation/api-reference/endpoint/extract).

```http
POST https://api.tavily.com/extract
Authorization: Bearer {TAVILY_API_KEY}
Content-Type: application/json

{
  "urls": ["{ACTUAL_URL_RETURNED_BY_DISCOVERY}"],
  "extract_depth": "basic",
  "format": "text",
  "include_images": false,
  "timeout": 10,
  "include_usage": true
}
```

The placeholder must be replaced with a validated server-discovered public URL. Provider maximum is 20 URLs; application maximum is eight. Map successes by URL, **not array position**: `results[].url`, `raw_content`; record `failed_results[].url,error` even on HTTP 200. Optional title/publication fields are hints requiring provenance. `request_id`, `response_time`, `usage` are diagnostic metadata. A request can succeed with no successful URLs.

Omit `query` and chunk-ranking options for cause evaluation, because selectively ranked fragments can omit negation or scope. Basic failures may receive a single advanced retry only if it fits the reserved deadline/budget; otherwise keep link/snippet status. PDFs and image-only reports are not guaranteed to extract. No OCR dependency or arbitrary direct-fetch PDF crawler today. An unread primary report cannot yield an official cause.

Do not return `raw_content` wholesale to the browser. Extract internal candidate sentences and metadata, then serialize only permitted brief excerpts or conservative paraphrased fields plus the source URL. Unknown reuse rights means no article photography/full text. Discard raw text after classification unless explicit storage rights allow a short-lived server cache.

### Optional Search

[Official Search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search). Disabled by default; allow one narrowly targeted fallback when Brave lacks a useful official-report lead, within the same overall deadline.

```http
POST https://api.tavily.com/search
Authorization: Bearer {TAVILY_API_KEY}
Content-Type: application/json

{
  "query": "{DISCOVERED_NAME_OR_VERIFIED_PLACE} informe investigacion incendio {YEAR}",
  "search_depth": "basic",
  "max_results": 5,
  "include_answer": false,
  "include_raw_content": false,
  "include_images": false,
  "auto_parameters": false
}
```

Map `results[].{url,title,content}` to the same candidate type; do not interpret `score` as truth or cause confidence. Subject each returned URL to identical extraction/eligibility checks. No Tavily-generated answer is used. This fallback does not justify declaring the required Brave integration tested if Brave never succeeded.

### Errors and billing

Tavily may return a string/object `detail` on errors; exact auth-error body is not verified. Branch on HTTP status, not English wording. Follow `Retry-After` for 429 when possible. [Rate documentation](https://docs.tavily.com/documentation/rate-limits) currently lists 100 RPM on Researcher, shared by keys in the account/organization. Application limits are much lower.

[Credits documentation](https://docs.tavily.com/documentation/api-credits) lists basic search 1 credit, advanced 2; basic Extract 1 credit per five successful URL extractions, advanced 2 per five. Failed extractions are not charged under that documentation. Track actual returned usage; do not assume batch rounding or per-run costs from successful URL count alone.

## Official agencies

There is no verified worldwide cause API. Use Brave Web with jurisdiction and document terms, then extract original issuing pages. Start the **proposed registry** with exact hosts/path scopes and roles:

| Agency/source | Discovery domain | Permitted inference |
|---|---|---|
| Córdoba Ministerio Público Fiscal | `mpfcordoba.gob.ar`, `www.mpfcordoba.gob.ar` | Candidate investigative authority for Córdoba; each final finding still needs all checks |
| CONAE issuing pages | `www.argentina.gob.ar`, agency-attributed CONAE pages | Primary satellite/environment documentation, not automatically cause-investigation authority |
| Córdoba IDECOR | `www.idecor.gob.ar` | Mapping/report source; burned-area metrics do not establish ignition cause |

Registry entries require a human-readable authority basis URL, jurisdiction and role, plus checked date. A government domain is not a universal trust grant. For other provinces, general official-report searches may run, but unfamiliar authorities remain unverified until the registry is extended using primary institutional evidence. This limits false positives without blocking unknown-cause discovery.

Reviewed sources demonstrate the distinction:

- [CONAE, 10 September 2024](https://www.argentina.gob.ar/noticias/los-incendios-forestales-en-cordoba-vistos-desde-el-espacio) documents dated Córdoba fire observations. It is useful documentary material, not a final cause finding.
- [MPF Córdoba preliminary statement](https://www.mpfcordoba.gob.ar/comunicado-oficial-del-mpf-respecto-a-los-incendios-en-cordoba/) explicitly concerns preliminary investigations and rebuts claims about detainees/political affiliation. It is not a confirmed ignition-cause finding. Some material is an image; readable text access is limited.
- [IDECOR annual mapping published February 2025](https://www.idecor.gob.ar/incendios-forestales-en-2024-datos-del-mapeo-provincial/) discusses 2024 activity. It illustrates why publication-year filters cannot substitute for occurrence-year filtering.

These URLs are research references and optional negative-classification checks, **not a hardcoded runtime exhibit catalog**. The implementation must rediscover appropriate documents through the selected-area query. This task did not verify an accessible positive final-cause report for the chosen demo slices.

## Account and cost gates

| Provider | Required account / verified public information | Still to check |
|---|---|---|
| FIRMS | [MAP_KEY request](https://firms.modaps.eosdis.nasa.gov/api/map_key); free | Needed only for missing-slice probe, not supplied CSVs |
| EONET | Public v3 API, tested without key | Operational SLA/rate allowance not verified |
| Brave | [Dashboard](https://api-dashboard.search.brave.com/); [pricing](https://brave.com/search/api/) lists Search $5/1,000 requests and $5 monthly credits | Account has News + Web access, storage rights and spend limit; never promise legacy free quotas |
| Tavily | [Dashboard](https://app.tavily.com/); [pricing](https://www.tavily.com/pricing) lists 1,000 free credits/month, no card; PAYGO $0.008/credit | Actual key, remaining credits, storage/redistribution permissions |
| Vercel | Existing project access; protected Preview | Team plan, function duration, output tracing and protection behavior |

Six Brave requests at the listed Search rate are approximately $0.03 before credits. This is only a planning calculation; actual entitlement/billing controls win. GDELT is deferred and no GDELT key is required. Source access and content rights remain separate from API fees.
