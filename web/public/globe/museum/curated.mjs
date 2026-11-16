import { exhibits as mockExhibits } from "./catalog.mjs";
import { validateCuratedExhibits } from "./curated-validate.mjs";

export const NOT_ATTRIBUTION =
  "Overlap is not attribution: detections inside this area and period are not proven to belong to this fire.";
export const CURATED_TAGLINE = "Real sources · satellite overlap, not attribution";

const VERDICT = { overlap: "Overlap", weak: "Weak overlap", none: "No qualifying overlap" };
const CAUSE = { official: "Official", reported: "Reported", unknown: "Unknown" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NOT_MOCK = /** @type {false} */ (false);
const CURATED = /** @type {"curated"} */ ("curated");
const MAX_SOURCES = 3;
const HEIGHT = 420;
const TOP_Y = 265;
const BOTTOM_Y = 755;

/** Plantillas fijas dentro del BOARD 1600x1000: [x, ancho] por tarjeta de la fila superior. */
const TOP_ROW = {
  1: [[800, 700]],
  2: [[420, 680], [1180, 680]],
  3: [[290, 470], [800, 470], [1310, 470]],
  4: [[215, 350], [605, 350], [995, 350], [1385, 350]],
};
const BOTTOM_ROW = TOP_ROW[4];
const TILT = [-1.1, .8, -.6, 1];

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "n/a";
  return value.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(value) ? 0 : digits });
}

function placements(row, y, offset = 0) {
  return row.map(([x, width], i) => ({ x, y, width, height: HEIGHT, rotation: TILT[(i + offset) % TILT.length] }));
}

export function regimeLabel(match) {
  return match.k == null || !match.regime
    ? "MODIS only, before VIIRS"
    : `${match.regime}, k = ${match.k.toFixed(3)}`;
}

function monthName(month) {
  const index = Number(String(month).slice(5, 7)) - 1;
  return `${MONTHS[index] ?? month}`;
}

function locationSentence(event) {
  if (event.location_basis === "satellite_centroid") return "Location: satellite centroid; the sources name only the region";
  if (event.location_basis === "named_place") return "Location: placed from the named place in the sources";
  return "Location: coordinates stated in the sources";
}

function verdictText(match, params) {
  const cd = match.celldays.harmonized ?? 0;
  const base = `${VERDICT[match.verdict] ?? match.verdict}: ${formatNumber(cd)} harmonized cell-days`;
  return `${base} (overlap needs at least ${params.min_celldays})`;
}

function causeText(event) {
  const { cause, sources } = event;
  if (!cause.text) return `${CAUSE[cause.category] ?? "Unknown"}: no cause is recorded for this event.`;
  const source = sources.find(({ id }) => id === cause.source_id);
  const by = source ? `according to ${source.title} (${source.publisher})` : "source not identified";
  return `${CAUSE[cause.category] ?? "Unknown"}: ${cause.text} (${by})`;
}

function artifactSource(event, version, generatedAt) {
  return {
    id: `${event.id}--artifact`, name: `Museum of Fire artifact ${version}`,
    date: `Generated ${String(generatedAt ?? "").slice(0, 10) || "date not stated"}`,
    url: `/artifacts/${version}/museum.json`, verification: CURATED,
  };
}

const COMPUTED_LIMITS = "Detections in the area and window are satellite observations; they do not establish that a detection belongs to the event, its cause or its perimeter.";

function computedHelp(version, role, relation) {
  return {
    status: `Computed · artifact ${version}`,
    role,
    retrieval: `Computed by the Museum of Fire pipeline and read from /artifacts/${version}/museum.json.`,
    relation,
    limits: COMPUTED_LIMITS,
  };
}

function sourceCard(event, source, index, place, version) {
  const date = source.published ?? "date not stated";
  const quote = source.quote ? [{ t: "quote", text: `“${source.quote}”` }] : [{ t: "p", text: "No quote recorded." }];
  return {
    id: `${event.id}--source-${index + 1}`, kind: source.kind, title: source.title, isMock: NOT_MOCK,
    typeLabel: `${source.kind === "report" ? "Published report" : "Press clipping"} / real source`,
    source: {
      id: source.id, name: source.publisher, date: `Published: ${date}`, url: source.url, verification: CURATED,
    },
    link: true, placement: place,
    blocks: [...quote, { t: "p", text: `Original language: ${source.language}` }],
    help: {
      status: `Real source · ${source.publisher} · ${date}`,
      role: `${source.title}. The quote is copied from the original; open the original source to read it in context.`,
      retrieval: `Added to the event record by ${event.curated.by} (${event.curated.tool}) on ${event.curated.at.slice(0, 10)}; stored in artifact ${version}.`,
      relation: "The source is linked to the event through the event record, not by a satellite match. FIRMS appears only on the satellite, curve and context cards.",
      limits: "The quote shows what this source states; Museum of Fire has not verified it independently.",
    },
    sourceHelp: {
      status: `Real source · ${source.publisher}`,
      role: `Publisher: ${source.publisher}. Publication date: ${date}. Link: ${source.url}`,
      retrieval: "Open the original source in a new tab; the link is stored in museum.json.",
      relation: "Compare the source with the satellite overlap only through the shared place and period.",
      limits: "Publication date and URL are as recorded in the event record.",
    },
  };
}

function buildItems(event, params, version, generatedAt) {
  const { match } = event;
  const sources = event.sources.filter(({ kind }) => kind === "article" || kind === "report").slice(0, MAX_SOURCES);
  const artifact = artifactSource(event, version, generatedAt);
  const top = placements(TOP_ROW[sources.length + 1], TOP_Y);
  const bottom = placements(BOTTOM_ROW, BOTTOM_Y, 1);
  const makeId = (name) => `${event.id}--${name}`;
  const base = (name, kind, title, typeLabel, place, blocks, help) => ({
    id: makeId(name), kind, title, isMock: NOT_MOCK, typeLabel, source: artifact, placement: place, blocks,
    help, sourceHelp: {
      status: `Computed · artifact ${version}`, role: `${artifact.name}. ${artifact.date}.`,
      retrieval: `Read from ${artifact.url}.`, relation: help.relation, limits: help.limits,
    },
  });

  const area = event.area_burned_ha;
  const areaSource = area && event.sources.find(({ id }) => id === area.source_id);
  const overviewRows = [
    ["Place", event.place.includes(event.province) ? event.place : `${event.place}, ${event.province}`],
    ["Period", `${event.start} to ${event.end}${event.date_precision === "month" ? " (stated to the month)" : ""}`],
  ];
  if (area) overviewRows.push(["Area burned", `${formatNumber(area.value)} ha, ${areaSource ? `according to ${areaSource.title}` : "source not identified"}`]);
  overviewRows.push(["Cause", causeText(event)]);
  const items = [
    base("overview", "event", event.title, "Event record", top[0], [
      { t: "fields", rows: overviewRows }, { t: "p", text: event.summary },
    ], computedHelp(version, "Event summary written from the cited sources.",
      "The cause is shown only with its category and the source that states it.")),
  ];
  sources.forEach((source, i) => items.push(sourceCard(event, source, i, top[i + 1], version)));

  /** @type {[string, string][]} */
  const satelliteRows = [
    ["Window", `${match.window.start} to ${match.window.end}`],
    ["MODIS raw", `${formatNumber(match.celldays.MODIS)} cell-days (${formatNumber(match.detections.MODIS)} detections)`],
    ["VIIRS raw", `${formatNumber(match.celldays.VIIRS)} cell-days (${formatNumber(match.detections.VIIRS)} detections)`],
    ["By satellite", Object.entries(match.detections.by_satellite).map(([name, n]) => `${name} ${formatNumber(n)}`).join(" · ") || "none"],
    ["Harmonized", `${formatNumber(match.celldays.harmonized)} cell-days · ${regimeLabel(match)}`],
    ["Verdict", verdictText(match, params)],
  ];
  if (match.first_detection) satelliteRows.push(["Detections", `${match.first_detection} to ${match.last_detection}`]);
  if (match.max_frp != null) satelliteRows.push(["Peak FRP", `${formatNumber(match.max_frp)} MW`]);
  /** @type {import("./contracts").Block[]} */
  const satelliteBlocks = [{ t: "fields", rows: satelliteRows }];
  if (match.provisional) satelliteBlocks.push({ t: "p", text: "Includes provisional (NRT) months." });
  if (match.no_data_months.length) satelliteBlocks.push({ t: "p", text: `No data (not zero): ${match.no_data_months.join(", ")}.` });
  items.push(base("satellite", "satellite", "Satellite overlap", "Satellite overlap / computed", bottom[0], satelliteBlocks,
    computedHelp(version, `Cell-days of FIRMS detections inside ${event.radius_km} km of the marker and the padded window, by family and harmonized.`,
      `Verdict ${match.verdict}; regime ${regimeLabel(match)}. The k comes from the calibration artifact.`)));

  items.push(base("curve", "chart", "Daily detection curve", "Daily curve / computed", bottom[1], [{
    t: "chart", label: "Daily detection curve", dates: match.daily.map(({ date }) => date),
    series: [
      { key: "modis", label: "MODIS", values: match.daily.map(({ modis }) => modis) },
      { key: "viirs", label: "VIIRS", values: match.daily.map(({ viirs }) => viirs) },
      { key: "harmonized", label: "Harmonized", values: match.daily.map(({ harmonized }) => harmonized) },
    ],
  }], computedHelp(version, "Daily cell-days in the area for the padded window: MODIS, VIIRS and harmonized.",
    "A peak shows when satellites saw activity in the area, not which fire it belongs to.")));

  const ctx = match.context;
  const comparable = Number.isFinite(ctx.median) && ctx.median > 0;
  const contextRows = [["Event month", `${monthName(ctx.month)} ${String(ctx.month).slice(0, 4)}: ${ctx.value == null ? "no data" : `${formatNumber(ctx.value)} harmonized cell-days`}`]];
  contextRows.push(["Other years", comparable
    ? `${monthName(ctx.month)} median ${formatNumber(ctx.median)} cell-days over ${ctx.years} years`
    : "no comparable history"]);
  if (comparable && ctx.value != null) contextRows.push(["Versus median", `${formatNumber(ctx.value / ctx.median)}× the median`]);
  items.push(base("context", "context", "Same month, other years", "Context / computed", bottom[2], [
    { t: "fields", rows: contextRows },
    { t: "p", text: "Same calendar month in the other years of the harmonized series, same area." },
  ], computedHelp(version, "Compares the event month with the same calendar month in other years.",
    "A high ratio says the month was busy in the area; it does not say why.")));

  items.push(base("method", "method", "Method and limits", "Method", bottom[3], [
    { t: "fields", rows: [
      ["Area", `${event.radius_km} km around the marker`],
      ["Window", `${match.window.start} to ${match.window.end} (event dates padded by ${params.window_pad_days} days)`],
      ["Verdict", `overlap: at least ${params.min_celldays} harmonized cell-days; weak: 1 to ${params.min_celldays - 1}; none: 0`],
      ["Recorded by", `${event.curated.by} with ${event.curated.tool}, ${event.curated.at.slice(0, 10)}`],
    ] },
    { t: "p", text: locationSentence(event) },
    { t: "p", text: NOT_ATTRIBUTION },
  ], computedHelp(version, "States the area, window, location basis and thresholds used for the overlap.",
    "Overlap is a spatiotemporal match only.")));
  return items;
}

/**
 * Mapea un evento del artefacto museum.json a un exhibit compatible con el tablero.
 * @returns {import("./contracts").CuratedExhibit}
 */
export function mapEvent(event, params, version, generatedAt) {
  const { match } = event;
  const approximate = event.location_basis === "satellite_centroid";
  const year = event.start.slice(0, 4);
  const items = buildItems(event, params, version, generatedAt);
  const location = locationSentence(event);
  return {
    id: event.id, isMock: NOT_MOCK, marker: "square", approximate, origin: "Real sources",
    short: `${event.province} ${year}`, title: event.title,
    region: event.place.includes(event.province) ? event.place : `${event.place}, ${event.province}`,
    lat: event.lat, lng: event.lon, altitude: approximate ? .62 : .5,
    period: event.start === event.end ? event.start : `${event.start} to ${event.end}`,
    summary: event.summary,
    boardNote: `${VERDICT[match.verdict] ?? match.verdict} with FIRMS detections. ${NOT_ATTRIBUTION}`,
    artifactVersion: version,
    match: { verdict: match.verdict, regime: match.regime, k: match.k },
    items, edges: [],
    help: {
      waypoint: {
        status: `Event record · artifact ${version}`,
        role: `Marker at ${event.lat.toFixed(3)}, ${event.lon.toFixed(3)}. ${location}.${approximate ? " Drawn approximate (dashed halo)." : ""}`,
        retrieval: `Event record from /artifacts/${version}/museum.json${generatedAt ? `, generated ${generatedAt}` : ""}; ${event.sources.length} source(s) by ${[...new Set(event.sources.map(({ publisher }) => publisher))].join("; ")}.`,
        relation: `Satellite verdict: ${match.verdict}. Regime: ${regimeLabel(match)}. FIRMS is matched by distance (${event.radius_km} km) and padded dates only.`,
        limits: NOT_ATTRIBUTION,
      },
      intro: {
        status: `Event record · artifact ${version}`,
        role: "This panel reads the title, place, period and summary from the event record. Its five-second bar is a UI timer.",
        retrieval: `Event ${event.id}, recorded by ${event.curated.by} on ${event.curated.at.slice(0, 10)}.`,
        relation: `Satellite verdict: ${match.verdict}; regime: ${regimeLabel(match)}.`,
        limits: NOT_ATTRIBUTION,
      },
      board: {
        status: `Event record · artifact ${version}`,
        role: "The board lays out the event record, its cited sources and the computed satellite overlap, without linking them to each other.",
        retrieval: "Source cards come from the event record; satellite, curve, context and method cards are computed by the pipeline.",
        relation: `Verdict ${match.verdict}, ${regimeLabel(match)}. Only the satellite, curve and context cards use FIRMS.`,
        limits: NOT_ATTRIBUTION,
      },
    },
  };
}

/** Convierte el contenido de museum.json en exhibits; los eventos inválidos se descartan con un aviso. */
export function mapArtifact(museum) {
  if (!museum || museum.schema !== 1 || !Array.isArray(museum.events)) throw new Error("Unexpected museum.json schema");
  const params = museum.params ?? { window_pad_days: 3, min_celldays: 5 };
  const accepted = [];
  for (const event of museum.events) {
    try {
      const exhibit = mapEvent(event, params, museum.version, museum.generated_at);
      validateCuratedExhibits([...accepted, exhibit]);
      accepted.push(exhibit);
    } catch (error) {
      console.warn(`Museum event skipped: ${event?.id}`, error);
    }
  }
  if (!accepted.length) throw new Error("museum.json has no usable events");
  return accepted;
}

/**
 * Carga los eventos curados; si falla, vuelve al catálogo ficticio (que sigue rotulado como ficticio).
 * @param {{ fetchImpl?: typeof fetch, base?: string }} [options]
 */
export async function loadCuratedExhibits({ fetchImpl = globalThis.fetch, base = "" } = {}) {
  try {
    const get = async (path) => {
      const response = await fetchImpl(`${base}${path}`);
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response.json();
    };
    const latest = await get("/artifacts/latest.json");
    if (typeof latest?.version !== "string" || !/^[\w.-]+$/.test(latest.version)) throw new Error("Invalid latest.json");
    const museum = await get(`/artifacts/${latest.version}/museum.json`);
    return mapArtifact({ ...museum, version: museum.version ?? latest.version });
  } catch (error) {
    console.warn("Curated museum events unavailable; showing the fictional exhibits instead.", error);
    return mockExhibits;
  }
}
