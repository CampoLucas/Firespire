export const BOARD = { width: 1600, height: 1000 };

/**
 * @param {string} id
 * @param {import("./contracts").EvidenceKind} kind
 * @param {string} title
 * @param {string} source
 * @param {string} date
 * @param {[number, number, number, number, number]} placement
 * @param {Pick<import("./contracts").MockEvidence, "body"|"image"|"alt"|"caption"|"fields">} content
 * @returns {import("./contracts").MockEvidence}
 */
function item(id, kind, title, source, date, placement, content) {
  const [x, y, width, height, rotation] = placement;
  return {
    id, kind, title, isMock: true,
    source: { id: `source-${id}`, name: source, date, url: null, isMock: true, verification: "fictional" },
    placement: { x, y, width, height, rotation },
    ...content,
  };
}

/** @type {import("./contracts").MockExhibit[]} */
export const exhibits = [
  {
    id: "river", isMock: true, marker: "square", origin: "Curated sample",
    short: "Riverside files", title: "The Riverside Files", region: "Corrientes, Argentina",
    lat: -28.5, lng: -58.5, altitude: .76, period: "10–16 September 2024",
    summary: "A riverside closure, a field memo and a simulated satellite pass. Explore what each record can tell you about the same stretch of wetland.",
    boardNote: "Cause unresolved in the fictional field memo. The satellite sample has no verified incident match.",
    items: [
      item("river-article", "article", "Landing access closes after smoke reports", "The Delta Ledger", "16 September 2024 · published", [330, 290, 430, 330, -3], {
        body: [
          "Local ferry crews reported smoke beyond the reeds on Thursday morning. The municipal landing was closed while a field crew checked the approach track and visibility from the water.",
          "A follow-up field memo described where crews found darkened vegetation. Officials gave no estimate of the affected area and left the origin of the burning unresolved.",
        ],
      }),
      item("river-report", "report", "Lower bank field inspection", "Illustrative Wetlands Field Unit · memo WL-024", "15 September 2024 · completed", [1100, 330, 450, 440, 2], {
        body: [
          "Scope. Walk the accessible embankment and record conditions at the southern landing. Water limited access to the inner reed beds.",
          "Observations. Darkened reed edges were visible on the outer bank. The team found no reliable origin indicator within the accessible survey area.",
          "Finding. Ignition cause undetermined. Attachment 01 illustrates the viewpoint from the landing. The inspection did not establish a mapped perimeter.",
        ],
      }),
      item("river-photo", "photo", "View from the southern landing", "Illustrative Wetlands Field Unit · attachment 01", "Capture date unspecified", [430, 760, 460, 300, -2], {
        image: "riverbank.webp", alt: "Illustration of a low reed bed, a winding river and distant smoke.",
        caption: "Fictional prototype illustration · Attachment 01 of field memo WL-024.",
      }),
      item("river-satellite", "satellite", "Simulated thermal observation", "Museum fixture · VIIRS-style record", "13 September 2024, 17:42 UTC · simulated acquisition", [1160, 800, 430, 270, 1], {
        image: "satellite.webp", alt: "Schematic overhead view of a river with three synthetic thermal pixels.",
        fields: [["Product", "VIIRS 375 m style"], ["Anchor", "28.50° S, 58.50° W"], ["FRP", "8.4 MW · synthetic"], ["Confidence", "Nominal · synthetic"]],
      }),
    ],
    edges: [
      { from: "river-article", to: "river-report", label: "Cites field memo", basis: "The Delta Ledger quotes the findings from fictional memo WL-024.", via: [706, 145], guides: [[575, 131], [910, 89]], isMock: true },
      { from: "river-photo", to: "river-report", label: "Attachment 01", basis: "The fictional memo lists the riverbank illustration as its first attachment.", via: [748, 612], guides: [[567, 630], [772, -26]], isMock: true },
    ],
  },
  {
    id: "hills", isMock: true, marker: "diamond", origin: "Simulated discovery",
    short: "Hillside press", title: "The Hillside Press Archive", region: "Córdoba, Argentina",
    lat: -31, lng: -64.5, altitude: .72, period: "2–8 October 2023",
    summary: "Two press clippings about smoke in the hills, with one illustrated image attachment. The archive leaves their relationship open.",
    boardNote: "Press material only. The set includes no agency investigation or satellite observation.",
    items: [
      item("hills-article1", "article", "Smoke delays traffic on the ridge road", "The Ridge Dispatch", "4 October 2023 · published", [370, 330, 440, 390, -2], {
        body: [
          "The bus operator suspended its morning service after drivers reported poor visibility near the lookout. Traffic resumed that afternoon after a road crew reopened the gate.",
          "A photograph caption identified the overlook as the photographer’s approximate position. The article gave no source for the ignition time and did not describe an official investigation.",
        ],
      }),
      item("hills-photo", "photo", "Western ridge from the overlook", "The Ridge Dispatch · illustration for this prototype", "Capture date unspecified", [1150, 290, 500, 320, 3], {
        image: "ridge.webp", alt: "Illustration of a dry roadside overlooking layered hills and gray haze.",
        caption: "Fictional prototype illustration · Image attachment to The Ridge Dispatch clipping.",
      }),
      item("hills-article2", "article", "Crews check a second road after haze", "The Valley Bulletin", "8 October 2023 · published", [950, 760, 520, 340, -1], {
        body: [
          "Residents described haze above a service road late Saturday. A road crew reportedly checked access near the eastern hills, but the outlet published no named location or incident number.",
          "The clipping is filed here because it covers the region and period. The available documentation leaves its relationship to the ridge-road closure unverified.",
        ],
      }),
    ],
    edges: [
      { from: "hills-photo", to: "hills-article1", label: "Published with clipping", basis: "The fictional Dispatch clipping carries this image as its captioned attachment.", via: [790, 120], guides: [[975, 114], [610, 89]], isMock: true },
    ],
  },
];
