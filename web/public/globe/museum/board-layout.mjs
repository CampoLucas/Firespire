import { BOARD } from "./catalog.mjs";

/** Returns presentation-only placements without changing documentary records. */
export function layoutEvidence(items, compact) {
  if (!compact) {
    const slots = {
      event: [250, 215, 400, 320, -2], satellite: [650, 785, 380, 300, 6],
      chart: [1190, 790, 390, 280, -1], context: [990, 490, 300, 210, 2], method: [230, 715, 330, 300, -7],
    };
    const sources = [[780, 200, 380, 270, 3], [1290, 350, 340, 330, -5], [550, 470, 300, 230, -3]];
    let source = 0;
    return { ...BOARD, items: items.map((item) => {
      const slot = slots[item.kind] ?? sources[source++ % sources.length];
      const [x, y, width, height, rotation] = slot;
      return { ...item, placement: { x, y, width, height, rotation } };
    }) };
  }
  const width = 800;
  const arranged = items.map((item, index) => ({
    ...item,
    placement: index === 0
      ? { x: 400, y: 160, width: 720, height: 260, rotation: -1 }
      : {
        x: (index - 1) % 2 === 0 ? 210 : 590,
        y: 470 + Math.floor((index - 1) / 2) * 320,
        width: 340, height: 280, rotation: index % 2 ? -1.4 : 1.4,
      },
  }));
  return { width, height: Math.max(330, 330 + Math.ceil(Math.max(0, items.length - 1) / 2) * 320), items: arranged };
}
