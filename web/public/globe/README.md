# Globe and Museum of Fire

Open `/` (a rewrite of `/globe/index.html`, which still works). This static frontend remains separate from the React history dashboard at `/history`, which the Summary panel links to. All assets are referenced with root-absolute `/globe/...` paths so both URLs load them. Layout is mobile-first: base CSS targets phones and `min-width: 700px` adds the desktop layout (the same breakpoint as `matchMedia` in `hud.mjs` and `board-view.mjs`).

## Presentation

- The hero shows **Loading Experience** until the Earth, rendered real activity, documentary museum and fonts are ready. **Ready to go** enables entry but never auto-starts. Loading failures provide **Retry loading**. A settling introduction and a user-triggered two-turn entrance use the existing camera adapter.
- Summary, Calendar and Filters open responsive drawers. Existing confidence, province, year, day/night, activity-layer and visualization controls retain their data bindings.
- Display settings include illustrated, NASA Blue Marble, dark and night basemaps. The illustrated map interprets its alpha channel as a separate cloud layer and blends a downsampled existing NASA texture at the poles to repair malformed reference pixels. Activity defaults to a transparent yellow/orange/red heat map derived from real FIRMS observations; hexagon and area modes remain available. Geographic meshes share the native globe layer hierarchy.
- Museum previews start a fifteen-second countdown only after the preview is visible and its approach completes; manual start and exit cancel it. Boards render actual evidence, charts, citations and source links. Pointer drag, wheel zoom and touch pinch share the existing museum camera state with click-to-focus and previous/next navigation. **Whole board** restores framing. Mobile provides a scrollable compact board and a complete Evidence list.
- Returning restores the original camera and analysis state. The globe never rotates on its own (no auto-rotation); manual rotation and zoom keep their controls and damping. Reduced-motion preferences bypass camera travel, disable tooltip panning and shorten CSS transitions.
- Planning mode and Developer View were intentionally removed. The activity alerts (banner, pulsing rings and Alerts tab) were removed; the Summary panel shows only the KPIs and a **Download CSV** button that exports the hexagons currently shown (one row per hexagon, honouring year, province, confidence, day/night, period or selected day, visible layers and grid resolution). Optional `?debug=1` renderer diagnostics remain.
- The default grid is H3 resolution 5 (the finest the data supports); `?res=2..5` still overrides it.
- Clicking a province filters by it; clicking it again, or clicking outside any province, clears the filter.

## Assets and data integrity

`design/fonts.css`, `design/icons.css`, `design/flame.png` and `design/earth-texture.js` are copied from the supplied Firespire prototype. Source Serif Pro and Lucide license notices are included in `design/`. The illustrated geography derives from World Atlas/Natural Earth; Natural Earth source data is public domain. Brand artwork comes from the supplied storyboard. NASA Blue Marble is credited to NASA Earth Observatory / Reto Stöckli.

The prototype's fictional cases, synthetic heatmap, generated chart, photographs and JavaScript controllers are not used. Curated records continue to load through `museum/curated.mjs`; startup reports failure rather than claiming readiness if only the loader's fictional fallback is available. Red strings connect only verified documentary source identities/references (including recorded area/cause citations); a common location or generated artifact is not a documentary relationship or evidence of causation.

## Verification

From `web/`: `npm test`, `npm run check:museum`, and `npm run lint`. Browser checks must additionally cover desktop/mobile layout, all visualization modes, loading/error/empty states, preview cancellation, evidence navigation, source links, resizing, reduced motion and camera restoration. Unit tests alone do not establish visual fidelity.
