# Museum of Fires prototype handoff

Launch instructions are in the [project README](../README.md).
The museum opens inside the existing Firespire globe at `/globe/index.html`.

## What changed

- The globe has two separate fictional documentary waypoints. **The Riverside
  Files** has an article, field report, image attachment and simulated satellite
  observation. **The Hillside Press Archive** has two clippings and an image
  attachment. Each exhibit has its own fixed board layout and source links.
- Selecting a waypoint captures the current globe pose and state, flies toward
  the waypoint and frames it beside the introduction. Portrait screens frame
  the waypoint above the introduction. A five-second progress bar and Start
  use the same guarded transition into the board.
- The cork board is a single 1,600 × 1,000 DOM plane. SVG strings connect
  explicit fictional citations or attachments. The board camera translates,
  scales and rolls that plane around a selected paper. Longer moves pull
  back before settling. The evidence selector also supports direct access
  on small screens. Left/right arrows move between neighboring items in
  the fixture order, and horizontal swipes use the same traversal.
- **Back to globe** can interrupt the approach, scene transition or document
  travel. The globe adopts the captured position, orientation, distance,
  projection and control target, then resumes its saved rotation behavior.
  The original date and display settings stay in their mounted Firespire
  controls during the visit.
- **Developer View** stays in the lower-left corner. Open a question mark by
  hover, keyboard focus or touch. Click or tap to pin the explanation.
  Arrow Down moves focus into a visible explanation for scrolling.
  Escape closes help first and exits an exhibit when help is closed.
  Explanations identify the current fixtures, existing FIRMS-derived data
  and candidate integrations, including how to verify provenance.
- The contents, placements, fictional credits and relationships are in
  `web/public/globe/museum/catalog.mjs`. Explanations are structured in
  `annotations.mjs`. The illustrations, synthetic satellite map and board
  textures are locally authored WebP assets.

## Implementation choices

The standalone globe uses the existing Globe.gl 2.27.2 application lifecycle.
Its adapter owns cancellable globe motion. It takes the camera snapshot before
draining OrbitControls inertia. For a clean close-up the board straightens the
selected paper while its neighbors and connections remain on the same plane.
Read longer copy by scrolling within the paper.

The main museum module coordinates the intro, markers, transitions and session.
The reducer, globe adapter, board camera math, board rendering, fixtures and
Developer View remain separate modules. The TypeScript check covers browser
module contracts and inferred JavaScript types. The pinned third-party globe
objects are passed through the adapter boundary.

Exhibit entry is enabled when the original basemap finishes loading. Compact
portrait styles leave the Firespire controls and calendar scrollable and reserve
space for the museum footer. There were no data-format, framework, dependency
or ingestion changes.

## Verification

| Check | Result |
|---|---|
| `npm ci` | Installed the existing lockfile |
| `npm run check:museum` | Passed |
| `npm run lint` | Passed |
| `npm test` | 40 tests passed, including five museum tests for lifecycle races, fixture ownership and camera positioning |
| `npm run build` | Passed |
| `uv run --locked pytest` in `pipeline/` | 41 tests passed |
| Desktop Chromium at 1440 × 900 | Both exhibits traversed. Verified map marker entry, two entry zooms, timeout, immediate/repeated Start, four evidence types, intermediate cross-board camera transform, Whole board, and exits during approach, entry and document travel |
| Capture and restoration in Chromium | Browser instrumentation compared the actual entry snapshot with the restored camera and filters. Position, orientation, up vector and target matched within (10^{-7}); projection and active filters matched. Also exercised entry during a province flight and after an orbit drag |
| Touch-emulated Chromium | Tested 390 × 844, 844 × 390 and 768 × 1024, including responsive framing, help tap, document readability, real touch swipe, viewport resize and reduced motion |
| Developer View | Verified state persists across exhibits and toggle works in multiple scenes. Tested hover, keyboard focus, tap, Escape, and explanations for globe, calendar, introduction, relationship and satellite sample |
| Repeat visits | Ten alternating exhibit loops left one switch, cleared the previous board and did not reload the globe year file |
| Legacy regressions | Changed year, confidence, day/night, heat display and selected day. Verified analysis/planning navigation and Firespire History loaded its existing artifacts. Compared all original archive files by SHA-256: 86 unchanged, five intended edits, zero deletions |

## Known limits

- The museum records and illustrations are fictional and labeled in the UI.
  A display waypoint denotes an approximate region. The simulated satellite
  card has no confirmed link to a real FIRMS detection. Potential APIs in
  Developer View are documentation only.
- Initial installation and the existing globe libraries and basemap require
  internet access. The original planning map also uses hosted tiles. A
  network interruption may affect those Firespire features.
- Mobile results come from Chromium touch emulation. Physical-device
  performance, Safari and Firefox were not verified.
- The stacked portrait overview uses the same wide board geometry as desktop.
  Individual papers are zoomable and directly accessible from **Choose
  evidence**. Browser zoom and text scaling may change how much of a long
  document is visible before scrolling.
- Museum text is English. The existing analysis and planning interface keeps
  its Spanish labels.
