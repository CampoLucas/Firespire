import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../../public/globe/${file}`, import.meta.url), "utf8");

describe("globe presentation integration", () => {
  it("provides the hero and HUD without planning controls or implementation", () => {
    const html = read("index.html");
    expect(html).toContain('id="hero"');
    expect(html).toContain('id="world-nav"');
    expect(html).not.toMatch(/ensurePlanMap|drawPlanAlerts|globo-quemas:prioritarias|id="viewSw"|leaflet/i);
  });

  it("removes developer UI while retaining the museum lifecycle and original camera restoration", () => {
    const museum = read("museum/index.mjs");
    expect(museum).not.toMatch(/createDeveloperOverlay|legacyAnnotations|waypointHelp|overlay\./);
    expect(museum).toContain("adapter.release(s.snapshot)");
    expect(museum).toContain("legacy.unlock(s.original");
    expect(museum).toContain("const INTRO_MS = 5000");
  });

  it("retains the real analysis controls and data integrations", () => {
    const html = read("index.html");
    expect(html).toContain("data/data-${y}.js");
    expect(html).toContain("loadCuratedExhibits()");
    expect(html).toContain("function aggregate(from,to,res)");
    expect(html).toContain("function computeAlerts(ctx)");
    for (const id of ["fConf", "fDn", "fYear", "fTerr", "fMode", "fShape", "fRes", "fScale", "cal", "legend", "kN", "kF", "kA"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("keeps dynamic evidence rendering without explanatory annotations", () => {
    const board = read("museum/board-view.mjs");
    expect(board).not.toMatch(/annotate\(|annotations\.mjs/);
    expect(board).toContain("for (const item of exhibit.items)");
    expect(board).toContain("for (const edge of exhibit.edges)");
    expect(board).toContain('"noopener noreferrer"');
    expect(board).toContain("renderBlocks(body, item.blocks)");
    expect(board).toContain("cameraMatrix(pose");
  });
});
