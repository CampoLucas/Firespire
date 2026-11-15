import { BOARD } from "./catalog.mjs";

/** Returns presentation-only placements without changing documentary records. */
export function layoutEvidence(items, compact) {
  if (!compact) return { ...BOARD, items };
  const width = 800;
  const arranged = items.map((item, index) => ({
    ...item,
    placement: index === 0
      ? { x: 400, y: 190, width: 720, height: 320, rotation: -1 }
      : {
        x: (index - 1) % 2 === 0 ? 210 : 590,
        y: 600 + Math.floor((index - 1) / 2) * 450,
        width: 340, height: 400, rotation: index % 2 ? -1.4 : 1.4,
      },
  }));
  return { width, height: Math.max(390, 390 + Math.ceil(Math.max(0, items.length - 1) / 2) * 450), items: arranged };
}
