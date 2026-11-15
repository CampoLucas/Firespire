# 05. Data contracts and UI integration

[Index](00_START_HERE.md) · [Engine](04_DISCOVERY_AND_CAUSE_ENGINE.md) · [Coding sequence](06_IMPLEMENTATION_RUNBOOK.md)

## Contents

[Contract conventions](#contract-conventions) · [Request and normalized records](#request-and-normalized-records) · [Result and renderer contracts](#result-and-renderer-contracts) · [Existing UI adapter](#existing-ui-adapter) · [Variable board layout](#variable-board-layout) · [Selection and lifecycle](#selection-and-lifecycle) · [Developer View and source interaction](#developer-view-and-source-interaction)

## Contract conventions

Everything declared below is **proposed**, not an existing interface. Authoritative public declarations belong in `web/lib/museum/contracts.ts`. Standalone browser `.d.ts` can use type-only imports from that file; no server runtime import may reach `public/globe/`. Runtime validators are still required on both sides; TypeScript does not validate fetched JSON.

Dates use ISO civil UTC dates or ISO timestamps as named. Missing dates are null, never “today.” Geometry uses longitude,latitude. Source content and API responses are untrusted. All IDs are opaque; derived identity rules are in [04](04_DISCOVERY_AND_CAUSE_ENGINE.md#eligibility-and-identity). Version public JSON as `schemaVersion:1`. Unknown future schema versions produce a retry/update notice, not unsafe rendering.

## Request and normalized records

```ts
type ID = string;
type ISODate = string; // runtime: YYYY-MM-DD, real date, UTC calendar
type ISOTime = string; // runtime: valid ISO timestamp with timezone
type Position = [number, number]; // longitude, latitude
type Polygon = { type: 'Polygon'; coordinates: Position[][] };
type MultiPolygon = { type: 'MultiPolygon'; coordinates: Position[][][] };
type AreaGeometry = Polygon | MultiPolygon;
type Geometry = AreaGeometry | { type: 'Point'; coordinates: Position };
type CauseStatus = 'official_documented'|'unofficial_reported'|'cause_unknown';
type UnknownReason = 'officially_undetermined'|'still_under_investigation'|
  'no_cause_found_in_accessible_sources';
type CauseFilters = Record<CauseStatus, boolean>;

interface DiscoveryRequest {
  schemaVersion: 1;
  area:
    | { kind:'country'; countryCode:'AR' }
    | { kind:'province'; countryCode:'AR'; provinceId:string }
    | { kind:'polygon'; countryCode:'AR'; geometry:AreaGeometry; label?:string };
  startDate: ISODate;
  endDate: ISODate;
  activityFilters: { confidenceMin:0|1|2; dayNight:'all'|'D'|'N' };
  language: 'es'|'en';
  refresh?: boolean; // bypass permitted result cache, not rate limits
}

interface Locator {
  contentHash: string;
  paragraph: number; // zero-based in retained extraction representation
  startOffset: number;
  endOffset: number;
  basis: 'extracted_text'|'public_snippet'|'structured_record';
}
interface DateAssertion {
  start: ISODate;
  end: ISODate;
  semantics: 'reported_occurrence'|'reported_active_on';
  precision: 'day'|'range'|'month';
  method: 'explicit'|'contextual_year'|'relative_to_verified_publication'|
    'explicit_active_status_at_verified_publication';
  sourceId: ID;
  locator: Locator;
}
interface PlaceAssertion {
  label: string;
  countryCode: string;
  regionId: string|null;
  precision: 'reported_point'|'reported_area'|'province'|'country';
  geometry: Geometry|null; // source-supported, never arbitrary cluster center
  geometryBasis: 'source_coordinates'|'eonet_explicit_source_link'|
    'named_administrative_boundary'|'none';
  sourceId: ID;
  locator: Locator;
  boundaryVersion: string|null;
}
interface Source {
  id: ID;
  originalUrl: string;
  canonicalUrl: string;
  title: string;
  publisher: string; // host if verified name absent
  kind: 'publisher_article'|'agency_document'|'investigation_report'|
    'event_catalog'|'satellite_dataset';
  language: 'es'|'en'|'other'|'unknown';
  discoveredVia: Array<'brave_news'|'brave_web'|'eonet'|'tavily_search'|'local_firms'>;
  discoveredAt: ISOTime;
  retrievedAt: ISOTime|null;
  publishedAt: ISOTime|ISODate|null;
  reportDate: ISODate|null;
  pageDateHint: string|null; // never automatically an occurrence/publication date
  contentStatus: 'extracted'|'snippet_only'|'link_only'|'unavailable';
  contentHash: string|null;
  contentTruncated: boolean;
  publicExcerpt: string|null;
  publicSummary: string|null; // attributed deterministic factual rendering
  rights: { mode:'metadata_only'|'brief_excerpt_allowed'|'licensed';
    basisUrl:string|null; checkedAt:ISOTime|null };
  authority: { registryId:string|null; issuer:string|null;
    role:'investigative'|'mapping'|'response'|'unknown';
    jurisdiction:string|null; identityChecked:boolean };
  isPrimaryOfficialFinding: boolean; // set only after claim gates, not by URL
  occurrence: DateAssertion[];
  places: PlaceAssertion[];
  accessError: string|null; // safe enum-like code, not provider response body
}
interface Claim {
  id: ID;
  sourceId: ID;
  occurrenceKey: string; // explicit incident ID or source-scoped assertion key
  causeText: string|null; // no invented taxonomy; nullable for unknown claims
  publicAttribution: string;
  locator: Locator;
  status: 'official_final'|'official_preliminary'|'unofficial_reported'|
    'explicitly_undetermined'|'under_investigation'|'unverified_candidate'|
    'retracted'|'superseded';
  gates: { accessiblePrimary:boolean; authorityRole:boolean;
    ownFinalFinding:boolean; sameOccurrence:boolean; affirmativeCause:boolean };
  gateReasons: string[];
  supersedesClaimIds: ID[];
  disputed: boolean;
}
interface ActivityWindow {
  id: ID;
  startDate: ISODate;
  endDate: ISODate;
  regionId: string;
  bbox: [number,number,number,number]; // W,S,E,N
  rankingProduct: string;
  countsByProduct: Record<string,number>;
  datasetVersion: string;
  datasetHash: string;
  relationship: 'regional_context';
}
interface EvidenceItem {
  id: ID;
  waypointId: ID;
  sourceId: ID;
  claimIds: ID[];
  kind: 'article'|'investigation_report'|'photo'|'event_record'|'satellite_context';
  title: string;
  paragraphs: string[]; // public-safe attributed text, no HTML
  fields: Array<[string,string]>;
  contentStatus: Source['contentStatus'];
  image: null|{ url:string; alt:string; credit:string; license:string; basisUrl:string };
}
interface Relationship {
  id: ID;
  waypointId: ID;
  fromEvidenceId: ID;
  toEvidenceId: ID;
  kind: 'explicit_citation'|'attachment_of'|'same_explicit_incident_id';
  basisSourceId: ID;
  locator: Locator;
  label: string;
  basis: string;
}
interface Waypoint {
  id: ID;
  revision: string;
  kind: 'discovered';
  isMock: false;
  eligible: true;
  ready: true;
  title: string;
  summary: string;
  anchorSourceId: ID;
  sourceIds: ID[];
  claimIds: ID[];
  evidenceIds: ID[];
  relationshipIds: ID[];
  place: PlaceAssertion;
  occurrence: DateAssertion;
  displayAnchor: { lat:number; lng:number; approximate:boolean;
    basis:'source_location'|'region_locator'; boundaryVersion:string|null };
  causeStatus: CauseStatus;
  causeUnknownReason: UnknownReason|null;
  disputed: boolean;
  firmsContext: { relationship:'regional_context'; activityWindowIds:ID[] };
  warnings: string[];
}
```

Internal-only source capture adds raw text and candidate sentences to `Source`; those fields **must not** be included by object spread in the public DTO. Build the DTO by explicit field allowlist. `isPrimaryOfficialFinding` means at least one scoped claim passed all gates, not that all claims on the page are final. Source occurrence assertions and locator scope prevent applying one paragraph to unrelated events.

The following **proposed internal-only** shapes make the runbook signatures concrete. They are never trusted browser input:

```ts
interface ResolvedArea {
  id:string; label:string; countryCode:'AR'; geometry:AreaGeometry;
  bbox:[number,number,number,number]; regionIds:string[]; boundaryVersion:string;
}
type ResolvedQuery = DiscoveryRequest & { resolvedArea:ResolvedArea; queryKey:string };
interface Observation {
  rowId:string; lat:number; lon:number; acquiredAt:ISOTime;
  productId:string; satellite:string|null; instrument:string|null;
  confidenceRaw:string|null; confidenceClass:0|1|2;
  dayNight:'D'|'N'; frp:number|null; type:number|null; version:string|null;
  sourceFileId:string;
}
interface FirmsContext {
  coverage:'certified'|'unavailable'; datasetVersion:string; datasetHash:string;
  filteredObservationCount:number;
  countsByProduct:Record<string,number>;
  dailyByRegionProduct:Array<{date:ISODate;regionId:string;productId:string;count:number}>;
  windows:ActivityWindow[]; warnings:string[];
}
interface DocumentLead {
  url:string; title:string; snippet:string|null; extraSnippets:string[];
  pageDateHint:string|null; publisherHint:string|null;
  discoveredVia:Source['discoveredVia'][number]; discoveredAt:ISOTime;
  explicitEventId:string|null; queryWindowIds:string[];
}
interface EonetLead {
  id:string; title:string; description:string|null; closed:ISOTime|null;
  geometry:Array<{date:ISOTime;type:'Point'|'Polygon';coordinates:unknown}>;
  sources:Array<{id:string;url:string}>;
}
interface SourceCapture {
  source:Source; rawText:string|null; rawTextHash:string|null;
  paragraphs:Array<{index:number;startOffset:number;endOffset:number;text:string}>;
  discoveredLead:DocumentLead;
}
interface ExtractBatch {
  results:Array<{url:string;rawContent:string}>;
  failures:Array<{url:string;code:string}>;
  requestId:string|null; credits:number|null;
}
```

`CallContext` in provider implementations contains `{signal,deadlineMs,requestId,budget,config}`; `budget` exposes atomic `consume(provider)` and remaining counters, and `config` holds server-only key values. `SourceAssertions` contains `occurrence`, `places` and rejection reasons. `NormalizedRecords` contains captures, scoped assertions and assessed claims. `AuthorityRegistry` is a keyed list of exact hosts/path scopes, issuer, jurisdiction, permitted role, institutional basis URL and checked date. Validate `EonetLead.geometry.coordinates` before promoting it to `Geometry`; its raw type is intentionally unknown.

## Result and renderer contracts

```ts
interface Placement { x:number; y:number; width:number; height:number; rotation:number }
interface BoardLayout {
  width:number;
  height:number;
  placements: Record<ID,Placement>;
  algorithmVersion:'grid-v1';
}
interface LiveEvidence {
  id: ID;
  kind:'article'|'report'|'photo'|'satellite'|'event';
  title:string;
  isMock:false;
  source:{ id:ID; name:string; date:string; url:string; isMock:false;
    verification:'primary_finding'|'attributed_document'|'metadata_only'|'regional_context' };
  placement:Placement;
  body:string[];
  fields:Array<[string,string]>;
  contentStatus:Source['contentStatus'];
  image?:string; alt?:string; caption?:string; // licensed images only
  claimIds:ID[];
}
interface LiveExhibit {
  id:ID;
  revision:string;
  isMock:false;
  ready:true;
  marker:'square'|'diamond'|'circle';
  causeStatus:CauseStatus;
  approximate:boolean;
  origin:string;
  short:string;
  title:string;
  region:string;
  lat:number; lng:number; altitude:number; // display/camera anchor
  period:string;
  summary:string;
  boardNote:string;
  layout:BoardLayout;
  items:LiveEvidence[];
  edges:Array<{from:ID;to:ID;label:string;basis:string;via:[number,number];
    isMock:false; relationshipId:ID}>;
}
interface ProviderState {
  provider:'firms'|'eonet'|'brave_news'|'brave_web'|'tavily_extract'|'tavily_search';
  status:'local_data'|'ok'|'empty'|'disabled'|'failed'|'skipped'|'cached';
  calls:number;
  durationMs:number;
  errorCode:string|null;
  fetchedAt:ISOTime|null;
}
interface DiscoveryResult {
  schemaVersion:1;
  requestId:ID; // unique attempt, unlike queryKey
  queryKey:string;
  query:DiscoveryRequest;
  status:'complete'|'partial'|'no_activity'|'no_sources'|
    'historical_data_unavailable'|'provider_error';
  activityStatus:'available'|'no_activity'|'unavailable';
  discoveryStatus:'complete'|'partial'|'skipped'|'failed';
  coverage:{ mode:'bounded'; datasetVersion:string|null;
    certifiedIntervals:Array<{startDate:ISODate;endDate:ISODate}>;
    windows:ActivityWindow[]; skippedWindowCount:number; truncated:boolean };
  waypoints:Waypoint[];
  sources:Source[];
  claims:Claim[];
  evidence:EvidenceItem[];
  relationships:Relationship[];
  exhibits:LiveExhibit[];
  counts:{eligible:Record<CauseStatus,number>; candidates:number; rejected:number};
  rejectionCounts:Record<string,number>;
  providers:ProviderState[];
  warnings:Array<{code:string;message:string;provider?:string}>;
  fromCache:boolean;
  generatedAt:ISOTime;
  cacheExpiresAt:ISOTime|null;
  classifierVersion:string;
}
interface ApiError {
  schemaVersion:1;
  requestId:ID;
  error:{code:string;message:string;retryable:boolean;retryAfterSeconds?:number};
}
```

`complete` means the bounded plan completed, not comprehensive global discovery. `partial` can contain zero waypoints if work was interrupted; it must not be shown as a conclusive `no_sources`. A ready exhibit has exactly one matching waypoint, only referenced records, and at least one documentary card. All counts derive from final eligible waypoints before UI filtering.

Proposed `GET /api/museum/status` returns `{schemaVersion:1,enabled:boolean,providers:{eonet:boolean,brave:boolean,tavily:boolean,firmsKeyConfigured:boolean},coverage:{datasetVersion:string|null,intervals:Array<{startDate,endDate}>,countryCodes:string[]},limits:{maxDays:366,maxVertices:500},cacheEnabled:boolean}`. These booleans mean configured, not successfully tested. No lengths, prefixes or values of keys are exposed. The route calls `connection()` as in existing `web/app/api/v1/validation/route.ts::GET`, so configuration is read at request time.

Concrete request, using a **real supported selection but not asserting any resulting incident**:

```json
{
  "schemaVersion": 1,
  "area": {"kind":"province","countryCode":"AR","provinceId":"AR:cordoba"},
  "startDate":"2024-09-01",
  "endDate":"2024-09-30",
  "activityFilters":{"confidenceMin":0,"dayNight":"all"},
  "language":"es",
  "refresh":true
}
```

An empty eligible result is `waypoints:[]`, `exhibits:[]` and all eligible counts zero. Do not create a placeholder `LiveExhibit` to communicate errors.

## Existing UI adapter

Existing contract: `web/public/globe/museum/contracts.d.ts::{MockExhibit,MockEvidence}`; consumer: `board-view.mjs::createBoard`; lifecycle: `index.mjs::mountMuseum`. Adapt rather than replace these symbols.

| Normalized record | Existing renderer mapping / proposed change |
|---|---|
| `Waypoint.id/revision` | `LiveExhibit.id/revision`; immutable per open session |
| `Waypoint.place` | `region` includes precision; camera fields come only from separate `displayAnchor` |
| `Waypoint.occurrence` | `period` formats occurrence dates, never publication date |
| Source title/attribution | `title`, `summary`, `origin`; no generated dramatic incident name |
| article / investigation_report / photo / event_record / satellite_context | article / report / photo / **new event** / satellite |
| evidence paragraphs/fields | existing `body` and `fields`; preserve `element()` text rendering |
| source URL + dates | `source.url`; `source.date` labeled publication/report/unknown, not an unlabeled date |
| verified relationships | existing edges with generated `via`; only same-waypoint IDs allowed |
| classification | marker shape + cause CSS class; independent of thermal colors |

Make the renderer accept `MockExhibit | LiveExhibit` with a discriminant, preserving test fixtures. In live mode it must never import catalog records. `validateCatalog` remains a fictional-fixture validator; new `validateLiveExhibits` checks URLs, flags, all references and per-layout geometry. Source IDs may legitimately repeat across evidence; remove the assumption of globally unique source IDs **only from the new live validator**, not by weakening mock tests.

`index.mjs::mountMuseum` currently creates `const markerRecords = exhibits.map(...)` once. Replace that construction with `setExhibits(next, queryKey)` which disposes old marker/link listeners, builds records keyed by waypoint ID/revision, updates overlay targets and calls refresh. Stable live payloads can survive local cause toggles. Use a per-result AbortController for marker listeners and retain the existing lifetime AbortController.

`refresh` must check `ready`, current query key and cause filter before projecting. A selected exhibit remains visible during intro even if new filter changes are queued. `select` rejects stale/not-ready entries **before** camera capture/lease. `fillIntro` changes fictional disclosure to source/cause/precision text; the existing `INTRO_MS=5000`, countdown scheduling and Start dispatch remain intact. No awaited fetch belongs inside select/start/board transitions.

`board-view.mjs::renderEvidence` changes type/footer text based on discriminant. Add `event` styling as a document card. For live `image`, require validated rights-bearing data before passing URL; otherwise omit image entirely. Existing mock image lookup under `./assets/` remains for fixture mode only. Decorative cork/paper textures may remain; mock incident illustrations (`riverbank`, `ridge`, `satellite`) must not be reused as real evidence.

## Variable board layout

New `board-layout.mjs` exports `DEFAULT_BOARD={width:1600,height:1000}` and `layoutEvidence(items):BoardLayout`. Existing `board-camera.mjs::overviewPose(width,height)` becomes `overviewPose(width,height,board=DEFAULT_BOARD)`; `createBoard` passes `exhibit.layout` or the default. `focusPose`, `travelSpec`, `cameraMatrix` and camera interpolation are unchanged.

Algorithm `grid-v1`: stable sort by report/article/event/satellite/photo priority, then source occurrence/publication date if known, then ID. This is navigation order, not a required narrative sequence. All cards remain freely selectable.

```text
columns = min(3, max(1, ceil(sqrt(itemCount))))
rows = ceil(itemCount / columns)
card width = 380; card height = 430; gutter X = 120; gutter Y = 110
margin = 90
board.width = max(560, 180 + columns*380 + (columns-1)*120)
board.height = max(610, 180 + rows*430 + (rows-1)*110)
x = 90 + 190 + column*500
y = 90 + 215 + row*540
rotation = [-2,1,0,2,-1][stableHash(item.id) % 5]
```

Check rotated bounding boxes using the formula in existing `validate.mjs::validateCatalog`; increase margins if any fails. Up to ten items; reject an oversize board rather than silently omit material already marked as part of this waypoint. Limit ingestion before finalizing membership. A one-source board has one paper, unless genuine independently meaningful context adds another. No blank fabricated photographs/reports. Header/footer clearly state available item count.

For strings, calculate actual pin positions using `board-view.mjs::pinPosition`. Use midpoint `via=[(ax+bx)/2,(ay+by)/2-30]`; clamp label inside world bounds. Require relation ID, basis source/locator and local endpoints; do not connect papers merely to fill space. `edges:[]` is normal.

The world/SVG dimensions and whole-board pose must use layout width/height. Scale only camera transform, never move paper placements while traveling. Test one, two, six and ten cards at desktop/phone widths. Long source content is excerpted/linked and scrollable in `.museum-paper-body`; it cannot enlarge paper geometry mid-animation.

## Selection and lifecycle

### Bridge into the actual legacy module

Extend `index.html::museumLegacy()` with proposed methods:

```ts
getDiscoverySelection(): DiscoveryRequest;
subscribeDiscoverySelection(listener:(q:DiscoveryRequest)=>void):()=>void;
```

Use `range()` and `dateOf()` for default dates, `st.prov` and `PROVINCIAS[st.prov].name` for area, `st.conf`, and `st.dn` (`'all'`, `'1'`, `'0'` map to all/D/N). Do not send display H3 resolution or hidden thermal layers as evidence-exclusion criteria. Add a canonical-key comparison at the end of `render()` to notify only relevant changes. This covers calendar clicks, period shift, year change and confidence/province changes without registering a listener on every control. A restored state may emit the same key; it must not start a new query automatically.

The proposed discovery controls own optional explicit start/end and polygon overrides. “Use current globe selection” clears overrides and rereads the bridge. Province or calendar interaction clears the matching override with a visible notice, so no hidden custom dates silently persist. Upload is GeoJSON only, not arbitrary URL fetch. Show selected AOI outline by appending to the existing path data in `index.html::setPaths`, not by replacing polygons used by `drawMode`/`drawAreas`. Clear outline on reset. The country selector initially has Argentina and an explanatory coverage label; do not imply unsupported global coverage.

Discovery UI states: `idle`, `stale`, `searching`, `ready`, `partial`, `empty`, `coverage_unavailable`, `error`. All transitions live in `discovery-client.mjs`, separate from museum Stage. Keep a monotonically increasing generation; accept response only when generation and local normalized selection still match. Server queryKey is stored after acceptance; never trust a response for another request just because it arrived last.

### Preserve and restore

Current camera snapshot is `globe-adapter.mjs::capture`; current legacy snapshot is `index.html::museumLegacy.lock`. Add discovery snapshot `{selection,overrides,causeFilters,resultKey,selectedRevision}` at `index.mjs::select`. Freeze all discovery controls during non-globe stages and store queued results without applying them. On return, restore legacy and discovery snapshot, release camera, restore focus, then permit user-requested refresh. Developer View stays operable throughout.

Avoid changing `state.mjs::reduce` unless a demonstrable integration need arises; it already rejects stale session/motion callbacks. Discovery generation tokens solve a different race and must not reuse motion counters. `dispose` aborts fetch, clears listeners/timers and calls the existing session cleanup. An exit during extraction is simply cancel search; an exit during an exhibit uses the existing returning transition.

## Developer View and source interaction

Retain `developer-overlay.mjs::createDeveloperOverlay` positioning/switch behavior. Replace documentary annotations in `annotations.mjs::{waypointHelp,itemHelp,edgeHelp,boardHelp}` with data-derived facts: provider outcome, retrievedAt, local dataset version, location/date precision, cause-gate basis and relation basis. Status labels distinguish configured, queried successfully, cached, failed, snippet-only and unknown. Never label a failed provider “integrated and verified.” Legacy History/globe annotations retain the actual separate data semantics.

Source anchors must not trigger card selection or swipe: stop pointerdown/click propagation only on link/controls; exclude `a,button,input,select,textarea` from board navigation key handling. In overview hide or untab the outbound source link beneath the hit target; enable it when the card is settled/readable. Give it `Open original source: {publisher}` accessible text. Test keyboard, touch and browser Back; the source opens a separate tab so the board session remains intact.

Live validation must reject `javascript:`, `data:`, unsafe image URLs, NaN positions, missing sources, foreign-waypoint evidence, unsupported statuses, negative dimensions, duplicate evidence IDs and undocumented strings. Reject only the corrupt exhibit when a response contains other valid exhibits, show a partial-result warning, and never acquire the globe camera for rejected content.
