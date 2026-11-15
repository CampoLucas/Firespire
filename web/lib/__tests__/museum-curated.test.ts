/* eslint-disable @typescript-eslint/no-explicit-any -- los .mjs del museo son JS sin tipos estrictos */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { exhibits as mockExhibits } from "../../public/globe/museum/catalog.mjs";
import { loadCuratedExhibits, mapArtifact, mapEvent } from "../../public/globe/museum/curated.mjs";
import { isHttpsUrl, validateCuratedExhibits } from "../../public/globe/museum/curated-validate.mjs";

const artifacts = join(__dirname, "../../public/artifacts");
const latest = JSON.parse(readFileSync(join(artifacts, "latest.json"), "utf8"));
const museum = JSON.parse(readFileSync(join(artifacts, latest.version, "museum.json"), "utf8"));

const blocksText = (item: { blocks: any[] }) =>
  JSON.stringify(item.blocks.map((b) => b.text ?? b.rows ?? b.label));

describe("museum curated mapping", () => {
  const exhibits: any[] = mapArtifact(museum);

  it("maps every event to an exhibit with one card per source plus computed cards", () => {
    expect(exhibits).toHaveLength(museum.events.length);
    exhibits.forEach((exhibit, i) => {
      const event = museum.events[i];
      const kinds = exhibit.items.map((item: any) => item.kind);
      const sources = event.sources.filter((s: any) => ["article", "report"].includes(s.kind)).slice(0, 3);
      expect(kinds.filter((k: string) => k === "article" || k === "report")).toHaveLength(sources.length);
      for (const kind of ["event", "satellite", "chart", "context", "method"]) expect(kinds).toContain(kind);
      expect(exhibit.isMock).toBe(false);
      expect(exhibit.lng).toBe(event.lon);
      expect(exhibit.approximate).toBe(event.location_basis === "satellite_centroid");
      expect(exhibit.edges).toEqual([]);
    });
    expect(validateCuratedExhibits(exhibits)).toHaveLength(exhibits.length);
  });

  it("source cards carry publisher, quote and an https link", () => {
    const first = exhibits[0].items.find((item: any) => item.kind === "article");
    const source = museum.events[0].sources[0];
    expect(first.link).toBe(true);
    expect(first.source.url).toBe(source.url);
    expect(first.source.name).toBe(source.publisher);
    expect(first.source.date).toBe("Published: date not stated");
    expect(blocksText(first)).toContain("“");
    expect(blocksText(first)).toContain(source.quote.slice(0, 30));
  });

  it("states the regime and k, and 'MODIS only' when k is null", () => {
    const pampa = exhibits[0].items.find((item: any) => item.kind === "satellite");
    expect(museum.events[0].match.k).toBeNull();
    expect(blocksText(pampa)).toContain("MODIS only, before VIIRS");
    const rio = exhibits[2].items.find((item: any) => item.kind === "satellite");
    expect(blocksText(rio)).toContain("V1, k = 0.583");
  });

  it("shows the anomaly as N× the median and 'no comparable history' without a median", () => {
    const ctx = (i: number) => blocksText(exhibits[i].items.find((item: any) => item.kind === "context"));
    expect(ctx(0)).toContain("10× the median");
    expect(ctx(0)).not.toContain("%");
    const event = structuredClone(museum.events[4]);
    expect(event.match.context.median).toBe(0);
    expect(ctx(4)).toContain("no comparable history");
    expect(ctx(4)).not.toContain("the median");
    event.match.context.median = null;
    const mapped: any = mapEvent(event, museum.params, museum.version, museum.generated_at);
    expect(blocksText(mapped.items.find((item: any) => item.kind === "context"))).toContain("no comparable history");
  });

  it("method card names the location basis and the overlap-not-attribution rule", () => {
    const method = (i: number) => blocksText(exhibits[i].items.find((item: any) => item.kind === "method"));
    expect(method(0)).toContain("Location: satellite centroid; the sources name only the region");
    expect(method(4)).toContain("Location: named place, placed by the curator");
    expect(method(0)).toContain("Overlap is not attribution: detections inside this area and period are not proven to belong to this fire.");
    expect(method(0)).toContain(`at least ${museum.params.min_celldays}`);
  });

  it("attributes the cause to its source and keeps the category label", () => {
    const delta: any = exhibits.find((exhibit: any) => exhibit.id === "ev-delta-parana-2008");
    const overview = blocksText(delta.items.find((item: any) => item.kind === "event"));
    expect(overview).toContain("Reported:");
    expect(overview).toContain("according to");
  });

  it("builds a daily chart block with the three series", () => {
    const chart = exhibits[0].items.find((item: any) => item.kind === "chart").blocks[0];
    expect(chart.series.map((s: any) => s.key)).toEqual(["modis", "viirs", "harmonized"]);
    expect(chart.dates).toHaveLength(museum.events[0].match.daily.length);
  });
});

describe("museum curated validator", () => {
  const base = () => structuredClone(mapArtifact(museum)) as any[];

  it("accepts https only", () => {
    expect(isHttpsUrl("https://example.org/a")).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,x", "http://example.org", "//example.org", "", null])
      expect(isHttpsUrl(url)).toBe(false);
    const bad = base();
    bad[0].items.find((item: any) => item.kind === "article").source.url = "javascript:alert(1)";
    expect(() => validateCuratedExhibits(bad)).toThrow("https");
  });

  it("rejects duplicate ids, foreign ids and non-finite coordinates", () => {
    const dup = base();
    dup[1].id = dup[0].id;
    expect(() => validateCuratedExhibits(dup)).toThrow("Duplicate");
    const foreign = base();
    foreign[0].items[1].id = `${foreign[1].id}--source-1`;
    expect(() => validateCuratedExhibits(foreign)).toThrow(/Foreign|Duplicate/);
    const nan = base();
    nan[0].lat = Number.NaN;
    expect(() => validateCuratedExhibits(nan)).toThrow("Invalid curated waypoint");
  });

  it("rejects placements outside the board and all placements stay inside", () => {
    const out = base();
    out[0].items[0].placement.x = 1590;
    expect(() => validateCuratedExhibits(out)).toThrow("outside the board");
    expect(() => validateCuratedExhibits(base())).not.toThrow();
  });
});

describe("museum curated loading", () => {
  const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });

  it("loads curated events from latest.json then museum.json", async () => {
    const calls: string[] = [];
    const fetchImpl: any = async (url: string) => {
      calls.push(url);
      return response(url.endsWith("latest.json") ? latest : museum);
    };
    const loaded: any[] = await loadCuratedExhibits({ fetchImpl });
    expect(calls).toEqual(["/artifacts/latest.json", `/artifacts/${latest.version}/museum.json`]);
    expect(loaded.every((exhibit) => exhibit.isMock === false)).toBe(true);
  });

  it("falls back to the fictional catalog with a single warning when museum.json is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl: any = async (url: string) =>
      url.endsWith("latest.json") ? response(latest) : response({}, false);
    const loaded = await loadCuratedExhibits({ fetchImpl });
    expect(loaded).toBe(mockExhibits);
    expect(loaded.every((exhibit: any) => exhibit.isMock)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("falls back when the network call throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl: any = async () => { throw new Error("offline"); };
    expect(await loadCuratedExhibits({ fetchImpl })).toBe(mockExhibits);
    warn.mockRestore();
  });
});
