# Globe and Museum of Fires

Open `/globe/index.html` through the existing web application. This static frontend remains separate from the React history dashboard.

## Presentation

- The desktop hero enters exploration after 4.8 seconds; its entry button skips the pause. Mobile waits for **Tap to continue**.
- Summary, Calendar and Filters open responsive drawers. Existing confidence, province, year, day/night, activity-layer and visualization controls retain their data bindings.
- Display settings include illustrated, NASA Blue Marble, dark and night basemaps. The illustrated map is decorative geography; all activity overlays still come from the existing FIRMS data.
- Museum previews retain the five-second/manual entry sequence. Boards render the selected event's actual evidence, charts, citations and source links. Mobile provides a scrollable compact board and a complete Evidence list using the same selection actions.
- Returning restores the original camera and analysis state. Reduced-motion preferences bypass camera travel and shorten CSS transitions.
- Planning mode and Developer View were intentionally removed. The observed-activity alert summary and optional `?debug=1` renderer diagnostics remain.

## Assets and data integrity

`design/fonts.css`, `design/icons.css`, `design/flame.png` and `design/earth-texture.js` are copied from the supplied Firespire prototype. Source Serif Pro and Lucide license notices are included in `design/`. The illustrated geography derives from World Atlas/Natural Earth; Natural Earth source data is public domain. Brand artwork comes from the supplied storyboard. NASA Blue Marble is credited to NASA Earth Observatory / Reto Stöckli.

The prototype's fictional cases, synthetic heatmap, generated chart, photographs and JavaScript controllers are not used. Curated records continue to load through `museum/curated.mjs`; the existing explicitly labeled fictional fallback remains available when the curated artifact cannot load. No documentary relationships are generated.

## Verification

From `web/`: `npm test`, `npm run check:museum`, and `npm run lint`. Browser checks must additionally cover desktop/mobile layout, all visualization modes, loading/error/empty states, preview cancellation, evidence navigation, source links, resizing, reduced motion and camera restoration. Unit tests alone do not establish visual fidelity.
