# 08. Testing, failures and release evidence

[Index](00_START_HERE.md) · [Run commands](07_SETUP_RUN_AND_DEPLOY.md) · [Cause test cases](04_DISCOVERY_AND_CAUSE_ENGINE.md#synthetic-cases)

## Contents

[What was actually verified](#what-was-actually-verified) · [Verification matrix](#verification-matrix) · [Real-response smoke protocol](#real-response-smoke-protocol) · [Interaction acceptance](#interaction-acceptance) · [Failure and security checks](#failure-and-security-checks) · [Release gates and blockers](#release-gates-and-blockers) · [Rollback](#rollback) · [Ten-minute live demo](#ten-minute-live-demo)

## What was actually verified

**This package contains architecture only. No application feature was implemented.** Do not carry this section forward as a claim that the later live app passed tests.

| Check executed in this task | Result / limit |
|---|---|
| Read all four supplied attachments, including nine handoff files | Complete; source/manifests and relevant matching bundled Next docs inspected |
| Parse actual globe payloads and four raw CSVs | Coverage/counts measured in [01](01_CURRENT_APPLICATION_AUDIT.md#firms-coverage); no claim of complete sensor coverage |
| Read monthly artifact manifests | Confirmed globe/History mismatch and missing months |
| Direct EONET Córdoba September 2024 request | HTTP 200, four event leads; no documentary/cause verification from IDs alone |
| Direct EONET Corrientes February 2023 request | HTTP 200, empty events; proves a concrete EONET-empty test selection |
| Existing mock catalog validation with Node assertions | Passed, two exhibits |
| Existing reducer: duplicate Start and stale completion after exit | Passed read-only assertions |
| Existing board-camera focus centering at 1440×650 and 390×590 | Passed numeric assertions |
| Official provider documentation and selected agency pages | Read; capability evidence, not team-account validation |
| Brave/Tavily credentials and requests | **Not tested**, credentials not provided |
| FIRMS keyed API/availability | **Not tested**; local CSV path inspected instead |
| npm install/build/lint/Vitest/typecheck | **Not run in this task** |
| Existing full browser journey / new live integration / Vercel | **Not tested in this task** |

`docs/museum-prototype.md` contains prior validation notes from the earlier prototype. Treat them as historical reports; fresh live-integration checks remain necessary. The read-only assertions exercised existing `museum/{validate,state,board-camera}.mjs` and did not require app modification.

## Verification matrix

Record result as PASS / FAIL / BLOCKED / NOT RUN, with date, commit/build ID, request ID, source URL and observed behavior where relevant. Unit fixtures are **clearly synthetic**; live evidence uses real responses. Never replace a failed live test with a passing mock result under the same label.

| ID | Reproducible action | Required result | Evidence type |
|---|---|---|---|
| L01 | Córdoba Sep 2024, cache disabled, run query from file 07 | Positive local FIRMS context; live Brave News/Web and extraction; ≥1 eligible real board | Live response + browser |
| L02 | Corrientes Feb 2023, same code and independent selection | Distinct query key/source set, real board; EONET empty does not prevent Brave | Live response + browser |
| L03 | New page/session or Reset filters | Official on, unofficial/unknown off; hidden category counts retained | Browser/network |
| L04 | Toggle each of three filters independently, then all off | Visibility matches category; no provider call; thermal layer unchanged | Browser/network |
| L05 | Retrieve actual accessible primary final cause finding if one exists | All five gates with exact source/locator; official visible; human source inspection agrees | Live source inspection; otherwise BLOCKED, not fabricated |
| L06 | Actual news cause attribution without primary finding | Unofficial only; citation visible; no official promotion | Live if discovered + synthetic S2 |
| L07 | Retrieved useful document with no cause statement | Unknown/no-cause-found; usable board and outbound URL | Live source + S5 |
| L08 | Under investigation / officially undetermined text | Both gray but distinct internal reasons | Real source when available + S3/S4 |
| L09 | Conflicting official/news causes | Keep both claims, official precedence with disagreement; no flattened single narrative | Real if available + S10 |
| L10 | Later report about earlier occurrence | Included by occurrence date; publication/report dates remain separate | Real dated report + S6 |
| L11 | Province-only source with province selection, then tiny custom polygon | Approximate region locator in province; not falsely precise in polygon | Real source metadata + geometry fixture |
| L12 | Tavily extraction fails for one real returned URL | Per-source failure, useful metadata retained; no unread finding | Live failure if encountered + deterministic error fixture |
| L13 | Set EONET flag false and restart; rerun same selection | Brave path still works; provider state disabled, partial warning | Live Brave + disabled branch |
| L14 | Disable Brave, then disable Tavily separately | Honest status/error/degraded result, no catalog substitution; full DoD not declared | Configuration + live remaining providers |
| L15 | Interrupt a search by changing province/date | Abort; stale response discarded; no old markers for new area | Browser/network |
| L16 | Force one timeout/429 with deterministic adapter fixture | Ready partial sources survive; retry respects budget; no false no-sources | Unit/integration fixture |
| L17 | Two boards opened sequentially | Every evidence/edge/source reference belongs to selected waypoint; no stale DOM | Live browser |
| L18 | Exit in approach, intro, entering, board, travel, evidence | Original camera, date/area/activity/cause filters restored | Live browser |
| L19 | Developer View across every stage | Toggle visible and data-specific; statuses accurate, no fake integration claims | Live browser |
| L20 | 2025 or uncovered 2026 request | Coverage unavailable before paid calls; globe remains usable | Backend/network |
| L21 | Valid covered slice with no observations after strict filters | No activity, no documentary calls; not “no fires occurred” | Backend fixture or actual selection |
| L22 | One/two/six/ten genuine-sized evidence records | All present on entry; fixed placements; camera travels; readable links | Layout fixture + live variable boards |
| L23 | Repeat query with permitted cache on, then Refresh | Cache timestamp/call counts correct; refresh reruns within rate limit | Live requests |
| L24 | Query on deployed Preview after cold start | Index traced, configured keys usable, within 60 seconds; no dependence on prior process state | Live deployment |

One synthetic official-positive test validates logic, **not real-world automatic classification accuracy**. A release can honestly show real unknown/unofficial exhibits with zero default official markers, as the functional specification allows. Its evidence report must still say whether L05 was blocked or passed. Never claim the full classification pipeline is empirically proven if it has only synthetic positive cases.

## Real-response smoke protocol

1. Use the future probe script from [07](07_SETUP_RUN_AND_DEPLOY.md#provider-probes); retain only redacted statuses, request IDs, count/elapsed metadata and public URLs. Validate both Brave endpoints, not Web alone. For Tavily use a URL returned in that actual probe.
2. Disable result cache, run L01 and L02 using their exact selected area/date inputs. Note dataset hash, active windows, provider calls, warning/rejection counts and all eligible cause categories. Do not require the original EONET count to remain identical indefinitely.
3. Manually open original URLs for the first two eligible exhibits. Verify publisher/title, occurrence period, stated place and cause attribution. A provider snippet/summary cannot stand in for a primary finding. If the public page is unreachable, record its capture/access limitation and remove unsupported classification.
4. Check no output URL comes from the prototype catalog. Confirm `isMock:false` across live records; original links nonnull; `regional_context` FIRMS relation; no source-only document date silently copied to occurrence date.
5. Open both boards in the browser and complete L17–L19. Record the observed restored state, not just “looks right.” Re-run the same smoke protocol on Preview after deployment.

For a positive official finding, manually inspect primary authority role, the exact scoped sentence, finality/negation and any later correction. A green icon by itself is not acceptance evidence. If a candidate fails, keep its document as unknown/unofficial where eligible and record why. If no candidate exists, report the coverage limitation without inventing one.

The real sources reviewed during planning support documentary feasibility, not guaranteed provider results: [CONAE September 2024](https://www.argentina.gob.ar/noticias/los-incendios-forestales-en-cordoba-vistos-desde-el-espacio), [Córdoba preliminary MPF statement](https://www.mpfcordoba.gob.ar/comunicado-oficial-del-mpf-respecto-a-los-incendios-en-cordoba/), [IDECOR later annual report](https://www.idecor.gob.ar/incendios-forestales-en-2024-datos-del-mapeo-provincial/), [Corrientes February 2023 response update](https://www.argentina.gob.ar/noticias/ambiente-mantiene-los-recursos-para-el-combate-de-los-incendios-en-corrientes-3). They are not hardcoded acceptance outputs.

## Interaction acceptance

Preserved code anchors: `web/public/globe/museum/index.mjs::{INTRO_MS,select,dispatch}`, `state.mjs::reduce`, `globe-adapter.mjs::{capture,apply,release}`, `board-view.mjs::createBoard`, `board-camera.mjs::{focusPose,travelSpec,cameraMatrix}`, and `index.html::museumLegacy`.

For each real board, select from a nondefault globe orientation/zoom, with a selected calendar day, province and nondefault thermal controls. Record camera position/quaternion/up/target, projection/view offset and `st`, plus new discovery overrides/cause filters. Freeze auto-rotation for the comparison. Exit must restore numeric state within floating-point tolerance (`1e-6` for camera arrays) before auto-rotation resumes. After viewport resize, compare the intended pose and scaled view-offset restoration semantics, not pixel-identical screenshots.

Start immediately during approach, double-click it, let countdown expire normally, and exit just before expiration. Exactly one transition occurs and no old timer reopens a board. With reduced motion, timers/state remain correct even if animation durations are zero. All waypoint evidence is already pinned at arrival; there is no asynchronous empty board. Selecting another item changes camera pose while paper placements remain fixed. Previous/next stops at ends; Whole board works; source links do not become swipe gestures. Test desktop, narrow portrait, keyboard and touch where available.

Developer View remains bottom-left even while legacy panels are inert. Tooltip data must match the selected source and be usable during transitions. An annotation about a local CSV must not call it a current live NASA request. A source title or query string cannot introduce HTML/script via annotations.

## Failure and security checks

| Failure/input | Required containment |
|---|---|
| EONET 0/timeout/500 | Continue direct Brave plan; note catalog coverage |
| Brave auth/quota failure | Do not retry endlessly; preserve any independently useful EONET-linked extracted documents as partial only; no full success claim |
| Tavily HTTP 200, all `failed_results` | No extraction success claim; metadata-only if eligible, otherwise no ready board |
| Malformed JSON/HTML error response | Provider invalid_response; no crash or arbitrary content execution |
| Deadline expires | Abort outstanding fetches; partial completed exhibits only; no fake completion |
| 50 EONET results / window/URL cap | Explicit truncation/bounded warning; ask visitor to narrow selection |
| Private/malicious URL from search | Reject before extraction/embedding; no arbitrary fetch proxy |
| User-supplied `site:`/operators in label | Strip query syntax; trusted server place names control query |
| HTML/script in title/paragraph | Display as text through `dom.mjs::element`, never innerHTML |
| Missing/private-data shard | 503 or coverage unavailable before paid requests |
| Old dataset/classifier version cache | Miss cache by version/hash; rerun classification |
| Stale query returns during board session | Ignore or queue; never mutate current exhibit |
| Attempt to include foreign evidence/source/edge | Validator rejects exhibit; zero camera lease |
| Off-origin POST / oversize request | Reject before provider calls; no wildcard CORS |
| Multiple Vercel instances | No assumption that local limiter/cache is globally shared |

Safe logs: requestId, normalized query hash, dataset/classifier version, provider name, HTTP class/code, elapsed milliseconds, candidate/eligible/rejection counts and cache status. Do not log source full text, API headers, environment values, user-entered arbitrary geometry text, or full FIRMS paths. Store only a redacted error code/message. Disabling logs is preferable to leaking credentials through a library error object.

Secret check after implementation: inspect browser Network and downloaded JS for provider tokens; inspect `.next/static` and `public` with a local scanner that compares actual key values without printing them. Confirm `.env.local` is excluded from source/package deployment output. Do not paste search patterns containing real keys into terminal history. Scan logs for `X-Subscription-Token`, `Authorization` and key-valued NASA paths without dumping matching secret lines.

## Release gates and blockers

### Declare the bounded live version working only when

- L01/L02 produce real eligible boards from different selected places/times using the same dynamic pipeline, with no hardcoded incident set.
- Real Brave News/Web and Tavily extraction probes pass; real EONET call and empty fallback behavior are recorded.
- FIRMS context is traceable to certified local rows or an explicitly verified API slice, with correct sensor/date/geography semantics.
- Default and independent cause filters, all category retention, explicit uncertainty and original links work; official-positive empirical test status is disclosed accurately.
- Spatial museum journey, readiness/cancellation and restoration pass; source/evidence membership does not leak between queries.
- Existing app checks pass or any baseline failure is isolated with evidence; no new regression is dismissed as “prototype.”
- Preview smoke passes if deployment is claimed; keys remain server-side and paid access is protected.

### Critical unverified dependencies

| Dependency | Exact blocker/check | Smallest credible path |
|---|---|---|
| Brave account | No team key/entitlement tested | Obtain existing account key; run both probe endpoints; no mock substitute |
| Tavily account/source access | No keyed extraction tested | Probe an actual returned public source; if blocked select another discovered source, not a prewritten exhibit |
| Final official causes | No positive final finding verified for demo slices | Default may be empty; demonstrate dynamic unknown/unofficial with explicit disclosure; keep strict rules |
| 2025/2026/raw/global coverage | Original corresponding CSVs absent | Use verified 2023/2024 Argentina; verify/download missing supported slices separately |
| Historical provider recall | Documentation cannot guarantee relevant search results | Local-language Web search, broader report publication window, narrower user selection; expose bounded coverage |
| Deterministic parser recall | Real prose varies; some dates/places unresolved | Retain rejection reasons; add evidence-based ES/EN patterns without assuming query terms are document facts |
| Vercel configuration | Account, root settings, protection and timeout not inspected | Protected Preview verification or local demo; no public paid endpoint without controls |
| Rights/cache entitlement | Extraction does not grant republication | Metadata/outbound links; cache off until allowed; no automatic photos/full-text exports |

A persistent database, broad crawler, LLM fact checker and GDELT are not blockers to this bounded version. Missing credentials or genuinely insufficient source evidence are blockers; document them plainly.

## Rollback

Set `MUSEUM_DISCOVERY_ENABLED=false` and redeploy/restart to stop paid discovery. UI must show “Live discovery unavailable” and keep globe/calendar available. Do **not** silently replace failed live results with fictional exhibits. If an explicitly labeled prototype mode is retained, it must require deliberate navigation and cannot claim live status.

On Vercel, roll back/promote the previously verified deployment using the existing project's dashboard. Confirm the restored deployment's disclosure: the earlier app is a fictional prototype, not a live fallback. Revoke/rotate any actually exposed key and clear logs/artifacts containing it if exposure is observed. Keep user data/source snapshots separate from code rollback; the day-one design has no durable source database to migrate.

## Ten-minute live demo

Prerequisite: credential probes and release checks already completed; remain within the rate cap. Have original-source tabs available for review, but do not preload a fabricated result set.

| Time | Action / observable evidence |
|---|---|
| 0:00–1:00 | Show working globe/calendar and supported dataset range. Explain detection versus documentary waypoint |
| 1:00–2:00 | Submit Córdoba September 2024 live query; show search status and bounded scope |
| 2:00–3:00 | Show default Official filter. If empty, show honest message and enable Unknown/Unofficial |
| 3:00–5:00 | Open a real waypoint; use countdown or Start, inspect source/date/cause attribution, travel between available papers |
| 5:00–6:00 | Enable Developer View; inspect actual provider/data status; return to saved globe pose/filters |
| 6:00–7:00 | Submit Corrientes February 2023; show EONET-empty status if still returned and continuing Brave discovery |
| 7:00–9:00 | Open second distinct board, inspect original URL, demonstrate independent filters without another query |
| 9:00–10:00 | Exit mid-transition or close-up and show exact return. State remaining coverage/classification limitations accurately |

If a live request fails during the demo, show the actual error/partial evidence and retry only within quota. An explicitly timestamped permitted cached result may illustrate prior retrieval, but it is not a fresh live success. End with the true observed state, not a claim that the source guarantees a cause.
