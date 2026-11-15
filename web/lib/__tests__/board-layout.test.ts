import { describe, expect, it } from "vitest";
import { layoutEvidence } from "../../public/globe/museum/board-layout.mjs";
import { mapArtifact } from "../../public/globe/museum/curated.mjs";
import { readFileSync } from "node:fs";

const museum = JSON.parse(readFileSync(new URL("../../public/artifacts/v2-full/museum.json", import.meta.url), "utf8"));

describe("responsive documentary board layout", () => {
  it("keeps desktop placements and source records unchanged", () => {
    const exhibit = mapArtifact(museum)[0];
    const before = JSON.stringify(exhibit);
    const result = layoutEvidence(exhibit.items, false);
    expect(result.items).toEqual(exhibit.items);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1000);
    expect(JSON.stringify(exhibit)).toBe(before);
  });

  it.each(mapArtifact(museum).map((exhibit) => [exhibit.id, exhibit]))("fits every record in the compact board for %s", (_id, exhibit) => {
    const before = JSON.stringify(exhibit);
    const result = layoutEvidence(exhibit.items, true);
    expect(result.items.map((item) => item.id)).toEqual(exhibit.items.map((item) => item.id));
    expect(result.items.map((item) => item.source)).toEqual(exhibit.items.map((item) => item.source));
    expect(result.items.map((item) => item.blocks)).toEqual(exhibit.items.map((item) => item.blocks));
    expect(result.items.every(({ placement: p }) => p.x - p.width / 2 >= 0 && p.x + p.width / 2 <= result.width && p.y - p.height / 2 >= 0 && p.y + p.height / 2 <= result.height)).toBe(true);
    expect(JSON.stringify(exhibit)).toBe(before);
  });

  it("supports an empty compact board without invented evidence", () => {
    const result = layoutEvidence([], true);
    expect(result.items).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
