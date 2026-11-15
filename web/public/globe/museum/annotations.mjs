export const legacyAnnotations = {
  activity: {
    status: "Existing · local NASA FIRMS-derived data",
    role: "The globe and legend group active-fire detections from the bundled MODIS and VIIRS records for Argentina.",
    retrieval: "NASA FIRMS: product/sensor, acquisition time in UTC, coordinates, confidence and FRP (MW). The globe uses local year files.",
    relation: "Compare detections by area and time or examine coverage by sensor. The History page separately provides harmonized monthly series.",
    limits: "A detection is a satellite observation. Counts can include repeated passes, and neither counts nor FRP establish an incident, cause or perimeter.",
  },
  count: {
    status: "Existing · local FIRMS-derived data", role: "Total detections in the active period and filters.",
    retrieval: "Use the bundled FIRMS-derived year files, filtered by day/night, confidence, province, range and active display classes as applicable.",
    relation: "These are detections from sensor passes, not a count of named fires.",
    limits: "Unequal sensor sensitivity, sampling and coverage complicate raw comparisons.",
  },
  frp: {
    status: "Existing · local FIRMS-derived data", role: "Aggregated fire radiative power for the selected view.",
    retrieval: "Use FIRMS acquisition records with FRP in megawatts and their sensor metadata.",
    relation: "FRP describes detected radiant power. Compare only with the acquisition and aggregation context available.",
    limits: "Summed FRP does not measure total energy released, cause or physical fire size.",
  },
  area: {
    status: "Existing · local FIRMS-derived data", role: "Area of grid cells with detected activity.",
    retrieval: "Group FIRMS positions in the chosen H3 resolution and use the corresponding cell area.",
    relation: "This is spatial context for satellite observations.",
    limits: "A cell with activity does not establish a burned perimeter. Grid resolution affects the result.",
  },
  calendar: {
    status: "Existing · local FIRMS-derived data",
    role: "The calendar aggregates detections for the selected territory and filters. It controls the globe’s selected day or period.",
    retrieval: "The bundled local year files provide acquisition dates, province, sensor and observation metadata.",
    relation: "The date can narrow a separate documentary search; matching dates and places alone do not establish incident identity.",
    limits: "These are raw globe counts, separate from the harmonized monthly History view. Missing coverage can resemble a quiet day.",
  },
  alerts: {
    status: "Existing · local FIRMS-derived data", role: "Highlights groups of observed burning activity over seven days.",
    retrieval: "Firespire groups the bundled FIRMS-derived records spatially and applies its existing activity thresholds.",
    relation: "The planning map and analysis alerts summarize observations and can provide context for separate documentary research.",
    limits: "An observed cluster is neither a forecast nor validated incident severity, origin or perimeter.",
  },
};

export function waypointHelp(exhibit, intro = false) {
  return {
    status: `Fictional · ${exhibit.origin}`,
    role: intro ? "This panel reads the title, region, documentation dates and summary from the selected waypoint. Its five-second bar is a UI timer."
      : `A documentary display anchor in the broad ${exhibit.region} region. It remains available independently of the active calendar period.`,
    retrieval: "Candidate sources: NASA EONET, official incident archives and curated research. Retain title, origin, source ID, location precision, date range and links.",
    relation: "Compare the documentary window with FIRMS only as geographic and temporal context. Verify any incident-level relationship from independent sources.",
    limits: "Approximate fictional anchor. Search results and EONET entries vary in completeness and geographic precision.",
  };
}

export const boardHelp = {
  status: "Fictional · locally authored exhibit",
  role: "The board arranges the selected exhibit’s evidence and its explicitly documented links.",
  retrieval: "Normalize vetted clippings, investigation reports, licensed images and any satellite observations. Keep record IDs, dated provenance, placement and relationship basis.",
  relation: "FIRMS can supply an observation record. Read other source types independently, and require source linkage or a verified incident ID before connecting them.",
  limits: "The available evidence determines what can be shown. An exhibit may have no imagery, investigation finding or satellite record.",
};

const types = {
  article: {
    retrieval: "Candidate discovery: Brave News Search, GDELT, Tavily or the publisher. Search by place and date, then retain canonical URL, title, publisher, publication date, summary and rights.",
    relation: "Check the original article for named incident IDs or explicit citations. Place/time overlaps with FIRMS are leads only.",
    limits: "Index coverage, source dates, accessible full text and reuse rights vary. An article nearby does not establish the cause of a detection.",
  },
  report: {
    retrieval: "Search official fire-agency repositories or public records by jurisdiction, incident name or ID. Keep authority, report ID, completion date, finding locator and attachments.",
    relation: "Verify the cited investigation or incident ID. FIRMS can provide separate place/time context; the attributed report supplies any official finding.",
    limits: "Reports may be unpublished or unavailable through APIs. This fictional memo leaves the ignition cause unresolved.",
  },
  photo: {
    retrieval: "Look in the original report or publisher attachment, agency galleries or licensed image archives. Keep caption, credit, capture/publication dates and permission.",
    relation: "Verify the original attachment and viewpoint before cross-referencing reports. FIRMS does not supply documentary photographs.",
    limits: "This asset is a fictional illustration. Geolocation, provenance and image reuse rights need independent checks.",
  },
  satellite: {
    retrieval: "A future record could use NASA FIRMS by area, date and product. Keep coordinates, sensor, acquisition UTC time, FRP and the product’s confidence field.",
    relation: "The displayed fields imitate a VIIRS observation schema. This synthetic record is independent of the actual Firespire detections.",
    limits: "A detection cannot determine ignition cause, ownership, burn perimeter or whether an arbitrary article describes the observed pixel.",
  },
};

export function itemHelp(item, attribution = false) {
  return {
    status: "Fictional · local mock record",
    role: attribution ? `Prototype credit: ${item.source.name}. Date field: ${item.source.date}. This source has no original URL.`
      : `${item.title} · ${item.source.name}. ${item.source.date}.`,
    ...types[item.kind],
  };
}

export function edgeHelp(edge) {
  return {
    status: "Fictional · authored relationship", role: edge.basis,
    retrieval: "Resolve both original source versions and check the attachment identifier or explicit citation.",
    relation: "The string represents a documented link in this fixture; it asserts no satellite match.",
    limits: "Date/region proximity alone cannot prove identity or causation.",
  };
}
