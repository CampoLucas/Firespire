import { BOARD } from "./catalog.mjs";

/** @param {import("./contracts").MockExhibit[]} exhibits */
export function validateCatalog(exhibits) {
  const used = new Set();
  function claim(id) {
    if (!id || used.has(id)) throw new Error(`Duplicate or empty museum ID: ${id}`);
    used.add(id);
  }
  for (const exhibit of exhibits) {
    claim(exhibit.id);
    if (!exhibit.isMock || !Number.isFinite(exhibit.lat) || Math.abs(exhibit.lat) > 90 ||
      !Number.isFinite(exhibit.lng) || Math.abs(exhibit.lng) > 180 ||
      !Number.isFinite(exhibit.altitude) || exhibit.altitude <= 0) throw new Error("Invalid fictional waypoint");
    const local = new Set();
    for (const item of exhibit.items) {
      claim(item.id);
      claim(item.source.id);
      local.add(item.id);
      if (!item.isMock || !item.source.isMock || item.source.url !== null ||
          !["article", "report", "photo", "satellite"].includes(item.kind) ||
          (item.image && !/^[\w-]+\.webp$/.test(item.image))) {
        throw new Error(`Invalid fictional evidence: ${item.id}`);
      }
      const { x, y, width, height, rotation } = item.placement;
      const r = rotation * Math.PI / 180;
      const dx = (width * Math.abs(Math.cos(r)) + height * Math.abs(Math.sin(r))) / 2;
      const dy = (width * Math.abs(Math.sin(r)) + height * Math.abs(Math.cos(r))) / 2;
      if (![x, y, width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0 ||
          x - dx < 0 || x + dx > BOARD.width || y - dy < 0 || y + dy > BOARD.height) {
        throw new Error(`Evidence outside the board: ${item.id}`);
      }
    }
    for (const edge of exhibit.edges) {
      if (!edge.isMock || !local.has(edge.from) || !local.has(edge.to) || edge.from === edge.to ||
          !edge.basis || !edge.via.every(Number.isFinite)) throw new Error("Invalid exhibit relationship");
    }
  }
  return exhibits;
}
