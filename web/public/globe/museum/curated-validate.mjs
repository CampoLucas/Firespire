import { BOARD } from "./catalog.mjs";

const KINDS = ["article", "report", "satellite", "chart", "context", "method", "event"];
const SOURCE_KINDS = ["article", "report"];

/** Solo https: rechaza javascript:, data:, http y rutas relativas. */
export function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Ruta same-origin hacia el artefacto (tarjetas calculadas, sin enlace). */
function isArtifactPath(value) {
  return typeof value === "string" && /^\/artifacts\/[\w.-]+\/[\w.-]+$/.test(value);
}

function insideBoard({ x, y, width, height, rotation }) {
  if (![x, y, width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  const r = rotation * Math.PI / 180;
  const dx = (width * Math.abs(Math.cos(r)) + height * Math.abs(Math.sin(r))) / 2;
  const dy = (width * Math.abs(Math.sin(r)) + height * Math.abs(Math.cos(r))) / 2;
  return x - dx >= 0 && x + dx <= BOARD.width && y - dy >= 0 && y + dy <= BOARD.height;
}

/** @param {import("./contracts").CuratedExhibit[]} exhibits */
export function validateCuratedExhibits(exhibits) {
  const used = new Set();
  function claim(id) {
    if (typeof id !== "string" || !id || used.has(id)) throw new Error(`Duplicate or empty museum ID: ${id}`);
    used.add(id);
  }
  for (const exhibit of exhibits) {
    claim(exhibit.id);
    if (exhibit.isMock !== false || !Number.isFinite(exhibit.lat) || Math.abs(exhibit.lat) > 90 ||
      !Number.isFinite(exhibit.lng) || Math.abs(exhibit.lng) > 180 ||
      !Number.isFinite(exhibit.altitude) || exhibit.altitude <= 0) throw new Error("Invalid curated waypoint");
    const local = new Set();
    const sources = new Set();
    for (const item of exhibit.items) {
      claim(item.id);
      // Todo ID de evidencia nace del evento que la contiene: un ID ajeno es un error.
      if (!item.id.startsWith(`${exhibit.id}--`)) throw new Error(`Foreign evidence ID: ${item.id}`);
      local.add(item.id);
      if (item.isMock !== false || !KINDS.includes(item.kind) || item.source?.verification !== "curated") {
        throw new Error(`Invalid curated evidence: ${item.id}`);
      }
      if (SOURCE_KINDS.includes(item.kind)) {
        if (!isHttpsUrl(item.source.url)) throw new Error(`Source URL must be https: ${item.id}`);
        if (sources.has(item.source.id)) throw new Error(`Duplicate source in exhibit: ${item.source.id}`);
        sources.add(item.source.id);
      } else if (!isArtifactPath(item.source.url) && !isHttpsUrl(item.source.url)) {
        throw new Error(`Invalid artifact reference: ${item.id}`);
      }
      if (!insideBoard(item.placement)) throw new Error(`Evidence outside the board: ${item.id}`);
    }
    for (const edge of exhibit.edges ?? []) {
      if (!local.has(edge.from) || !local.has(edge.to) || edge.from === edge.to) throw new Error("Invalid exhibit relationship");
    }
  }
  return exhibits;
}
