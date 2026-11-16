# Globe and museum UI integration
Scope: public/globe only; mockup is read-only. Branch: feature/front-end.
Route: inline (workspace prohibits subagents). Runner: npm test; npm run check:museum; npm run lint.

## Specs
- S1: "Hero page: Opening presentation, composition, typography, globe animation, and transition into exploration."
- S2: "World HUD: Globe presentation, navigation, floating controls, filters, calendar, summaries, and responsive layout."
- S3: "Fire preview: Selected-fire presentation, introductory sequence, countdown presentation, and transition into the investigation."
- S4: "Whiteboard: Investigation board, documentary cards, spatial presentation, evidence interactions, navigation, and associated visual effects."
- S5: "Planning mode, including its dedicated interface, navigation controls, and planning-only interactions."
- S6: "Developer View, including its toggle, annotations, explanatory overlays, and associated UI."
- S7: "Do not redesign or work on the separate React history dashboard."
- S8: "Do not replace working functionality with simulated mockup functionality."
- S9: "Respect reduced-motion preferences."

## Tasks
- T1 [S1,S2,S5,S7-S9] inline — implemented: hero/HUD, shared visual assets, real controls in drawers, planning removal; uncommitted.
- T2 [S3,S4,S6,S8,S9] inline — implemented: preview, dynamic paper board, compact mobile placements, evidence list, developer UI removal; uncommitted.
- T3 [S1-S9] inline — corrections implemented and checked: 81 tests pass; museum type-check and scoped lint pass; desktop/mobile browser checks below; uncommitted.

## Log
- L1: User authorized implementation directly using `.workspace/mockups/Firespire_Prototype/audit/audit.md`, with mockup visuals and existing Firespire data/functionality as respective sources of truth. Explicit removals: Planning and Developer View. No backend, schema, dependency or React dashboard changes.
- Browser tools are unavailable. No claim of rendered fidelity or runtime interaction verification will be made without browser evidence. No publishing authorized.
- Temporary isolated headless Edge was subsequently available and launched with explicit native approval. Static previews run on loopback only; screenshots and profile stay outside the repository.
- RED: presentation integration tests failed before changes (3 failures, real-data contract already passed). Compact layout suite failed before its module existed. GREEN: 73 tests across 5 files; museum type-check passed.
- Browser desktop (1440x1000) and mobile (390x844): actual yearly data, eight curated waypoints, confidence filters, day selection, month calendar, summary, real documentary previews, manual entry, original-source link accessibility, three-series charts, evidence next/selection, Escape return, reduced-motion entry/exit, year loading and all three activity display modes passed without runtime exceptions.
- Initial mobile screenshots exposed tiny overview cards/title overlap; fixed using presentation-only compact placements without changing records. Verified real six-card and seven-card events, scrollable compact board and evidence list.
- A screenshot-hash camera probe differed (not a reliable pose assertion while controls settle). Replaced it with read-only DevTools inspection at the restoration boundary: position, orientation, up vector, target, projection, view offset, viewport and control snapshots all matched exactly.
- Reference and implementation screenshots were inspected for desktop hero/world/preview/board and mobile hero/preview/board/evidence. Real source cards and absent relationship strings intentionally differ from fictional storyboard content.
- Full lint passed once; final lint rerun pending. Native review mode is on; assessment requested explicit untracked inventory. No commit or publish performed.
- 2026-11-15 correction/resume: inspected the working diff and continued existing implementation without reverting, changing branches or committing. The earlier integration review candidate no longer represents this corrected diff.
- Corrected actual resource readiness/failure/retry, finite hero introduction and two-turn entrance, native-layer activity synchronization, separate cloud-mask rendering, NASA-derived polar geography, real transparent yellow/orange/red heat and slightly enlarged hex footprints. Removed exploration autorotation and the central alert button, retaining its data calculations.
- Corrected bounded waypoint hover with measured overflow panning, a cancellable fifteen-second countdown starting only after visible preview readiness, spatial board framing, visible evidence titles, verified shared-documentary-source strings, and coordinated drag/wheel/pinch navigation. Source content and API contracts were not changed.
- Root causes: reference alpha is a cloud mask, not surface transparency; the RGB reference contains malformed Antarctic pixels; scene-level activity did not share native globe initialization transforms. The originally reported extreme negative board coordinates were not reproduced; shared world coordinates, finite pose bounds and zero-size viewport handling now prevent invalid framing.
- Final checks: 81 tests in six files passed; `npm run check:museum` and scoped ESLint passed; `git diff --check` passed. No full production build was run.
- Actual headless Edge desktop/mobile verification covered delayed and failed loading, blocked premature entry, settled intro, two-turn entrance, activity transform synchronization, stationary exploration/manual rotation, tooltip overflow, preview cancellation/manual entry/fifteen-second auto-entry, real six/seven-card boards, source links, drag/wheel/pinch/reset/focus/next/return, resize and reduced motion. Accepted screenshots were compared with the reference. No runtime/shader errors occurred in final flows.
- Differential checks preserved documentary output across all eight events except explicit presentation-only source references, and left nine real data/filter function bodies identical. Remaining visual differences reflect variable real documentary content and styled polar imagery rather than fictional reference evidence. Cross-browser/hardware coverage remains unverified.
- Final native assessment included all six new files: medium risk, 21 changed paths, 725 changed lines, `review_due: false` (`under_budget`). No native reviewer or old candidate consent was invoked. Independent subagents were not used, in accordance with workspace policy. Timer/camera lifecycle ordering was exercised through the browser checks above.
