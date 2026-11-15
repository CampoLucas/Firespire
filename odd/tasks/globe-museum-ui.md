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
- T3 [S1-S9] inline — checking: 73 tests pass; museum type-check passes; browser checks below; final review pending.

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
