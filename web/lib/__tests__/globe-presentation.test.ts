import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../../public/globe/${file}`, import.meta.url), "utf8");

describe("globe presentation integration", () => {
  it("provides the hero and HUD without planning controls or implementation", () => {
    const html = read("index.html");
    expect(html).toContain('id="hero"');
    expect(html).toContain("<title>Museum of Fire</title>");
    expect(html).not.toMatch(/Firespire/);
    expect(html).toContain('id="world-nav"');
    expect(html).not.toMatch(/ensurePlanMap|drawPlanAlerts|globo-quemas:prioritarias|id="viewSw"|leaflet/i);
  });

  it("removes developer UI while retaining the museum lifecycle and original camera restoration", () => {
    const museum = read("museum/index.mjs");
    expect(museum).not.toMatch(/createDeveloperOverlay|legacyAnnotations|waypointHelp|overlay\./);
    expect(museum).toContain("adapter.release(s.snapshot)");
    expect(museum).toContain("legacy.unlock(s.original");
    expect(museum).toContain("const INTRO_MS = 15000");
  });

  it("retains the real analysis controls and data integrations", () => {
    const html = read("index.html");
    expect(html).toContain("data/data-${y}.js");
    expect(html).toContain("loadCuratedExhibits()");
    expect(html).toContain("function aggregate(from,to,res)");
    expect(html).not.toMatch(/computeAlerts|renderAlerts|id="banner"|id="tabs"|ringsData/);
    expect(html).toContain('id="dlCsv"');
    expect(html).toContain("museum-of-fire_");
    for (const id of ["fConf", "fDn", "fYear", "fTerr", "fMode", "fShape", "fRes", "fScale", "cal", "legend", "kN", "kF", "kA"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("loads every asset with root-absolute paths so it works from / and from /globe/index.html", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/(?:src|href)="(?:\.\/|data\/|museum\/|design\/)/);
    expect(html).not.toMatch(/(?:from|import\()\s*["`]\.\//);
    expect(html).not.toContain("s.src=`data/");
    for (const asset of [
      "design/flame.png", "design/fonts.css", "design/icons.css", "controls.css", "museum/museum.css",
      "presentation.css", "data/years.js", "data/provincias.js", "design/earth-texture.js",
      "museum/index.mjs", "museum/curated.mjs", "museum/hud.mjs", "museum/globe-adapter.mjs", "calendar-nav.mjs",
    ]) {
      expect(html).toContain(`/globe/${asset}`);
      expect(existsSync(new URL(`../../public/globe/${asset}`, import.meta.url))).toBe(true);
    }
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('href="/history"');
  });

  it("serves the globe at / through a rewrite and the history page at /history", () => {
    const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
    expect(config).toMatch(/source:\s*"\/",\s*destination:\s*"\/globe\/index\.html"/);
    expect(existsSync(new URL("../../app/history/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../app/page.tsx", import.meta.url))).toBe(false);
    const view = readFileSync(new URL("../../app/components/HistoryView.tsx", import.meta.url), "utf8");
    expect(view).toContain('href="/"');
    expect(view).not.toMatch(/Firespire/);
  });

  it("is mobile-first: no max-width media queries in the globe stylesheets", () => {
    for (const file of ["presentation.css", "controls.css", "museum/museum.css"]) {
      expect(read(file)).not.toMatch(/@media\s*\(max-width/);
    }
  });

  it("keeps dynamic evidence rendering without explanatory annotations", () => {
    const board = read("museum/board-view.mjs");
    expect(board).not.toMatch(/annotate\(|annotations\.mjs/);
    expect(board).toContain("for (const item of exhibit.items)");
    expect(board).toContain("for (const edge of edges)");
    expect(board).toContain('"noopener noreferrer"');
    expect(board).toContain("renderBlocks(body, item.blocks)");
    expect(board).toContain("cameraMatrix(pose");
  });
});
