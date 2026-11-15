import { describe, expect, it } from "vitest";
import { exhibits } from "../../public/globe/museum/catalog.mjs";
import { validateCatalog } from "../../public/globe/museum/validate.mjs";
import { initial, reduce, Stage } from "../../public/globe/museum/state.mjs";
import { cameraMatrix, focusPose, interpolatePose, overviewPose, travelSpec } from "../../public/globe/museum/board-camera.mjs";

describe("museum lifecycle", () => {
  it("claims entry once and ignores stale animation callbacks after exit", () => {
    const approach = reduce(initial(), { type: "select" });
    expect(reduce(approach, { type: "select" })).toBe(approach);
    const entering = reduce(approach, { type: "start", session: approach.session });
    expect(entering.stage).toBe(Stage.entering);
    expect(reduce(entering, { type: "start", session: approach.session })).toBe(entering);
    expect(reduce(entering, { type: "arrived", motion: approach.motion })).toBe(entering);
    const returning = reduce(entering, { type: "exit" });
    expect(reduce(returning, { type: "board", motion: entering.motion })).toBe(returning);
    const idle = reduce(returning, { type: "restored", motion: returning.motion });
    const second = reduce(idle, { type: "select" });
    expect(reduce(second, { type: "start", session: approach.session })).toBe(second);
    expect(reduce(second, { type: "arrived", motion: second.motion }).stage).toBe(Stage.intro);
  });

  it("accepts any current evidence, retargets travel and rejects foreign records", () => {
    const board = reduce(reduce(reduce(initial(), { type: "select" }), { type: "start" }), { type: "board" });
    const ids = exhibits[0].items.map(({ id }) => id);
    expect(reduce(board, { type: "focus", id: exhibits[1].items[0].id }, ids)).toBe(board);
    const moving = reduce(board, { type: "focus", id: ids[3] }, ids);
    const back = reduce(moving, { type: "focus", id: null }, ids);
    expect(back.stage).toBe(Stage.travel);
    expect(reduce(back, { type: "settle", motion: moving.motion })).toBe(back);
    expect(reduce(back, { type: "settle", motion: back.motion }).stage).toBe(Stage.board);
  });
});

describe("museum catalog and spatial camera", () => {
  it("has two coherent fictional exhibits and rejects cross-exhibit strings", () => {
    expect(validateCatalog(exhibits)).toHaveLength(2);
    const invalid = structuredClone(exhibits);
    invalid[0].edges[0].to = invalid[1].items[0].id;
    expect(() => validateCatalog(invalid)).toThrow("Invalid exhibit relationship");
  });

  it("projects the selected paper to the viewing center without changing its board coordinates", () => {
    for (const [width, height] of [[1440, 650], [390, 590], [844, 255], [768, 825]]) {
      const placement = exhibits[0].items[1].placement;
      const pose = focusPose(placement, width, height);
      const [a, b, c, d, x, y] = cameraMatrix(pose, width, height);
      expect(a * placement.x + c * placement.y + x).toBeCloseTo(width / 2);
      expect(b * placement.x + d * placement.y + y).toBeCloseTo(height / 2);
      const overview = overviewPose(width, height);
      expect(overview.scale * 1600).toBeLessThan(width);
      expect(overview.scale * 1000).toBeLessThan(height);
    }
  });

  it("travels between fixed placements and pulls back on long moves", () => {
    const from = focusPose(exhibits[0].items[0].placement, 1440, 650);
    const to = focusPose(exhibits[0].items[3].placement, 1440, 650);
    const { retreat } = travelSpec(from, to, overviewPose(1440, 650).scale);
    const mid = interpolatePose(from, to, .5, retreat);
    expect(retreat).toBeGreaterThan(0);
    expect(mid.x).toBeCloseTo((from.x + to.x) / 2);
    expect(mid.scale).toBeLessThan(Math.min(from.scale, to.scale));
    expect(interpolatePose(from, to, 1, retreat).scale).toBeCloseTo(to.scale);
  });
});
