import { describe, expect, it } from "vitest";
import { parseMonthly } from "../artifacts";
import { buildCsv, CSV_HEADER, exportFilename, parseExportParams, parseSeriesParams } from "../csv";
import { kForMonth, monthAt, monthIndex, monthlySeries } from "../harmonize";
import {
  buildFixture,
  CELLDAYS_MODIS,
  CELLDAYS_VIIRS,
  HOTSPOTS_MODIS,
  HOTSPOTS_VIIRS,
} from "./fixture";

const qs = (s: string) => new URLSearchParams(s);

describe("parseMonthly", () => {
  it("round-trips the standard layout", () => {
    const { artifacts, buffer } = buildFixture();
    const m = parseMonthly(buffer, artifacts.meta);
    expect(Array.from(m.celldaysModis)).toEqual(CELLDAYS_MODIS);
    expect(Array.from(m.celldaysViirs)).toEqual(CELLDAYS_VIIRS);
    expect(Array.from(m.hotspotsModis)).toEqual(HOTSPOTS_MODIS);
    expect(Array.from(m.hotspotsViirs)).toEqual(HOTSPOTS_VIIRS);
  });

  it("handles uint16 blocks at an odd byte offset", () => {
    const { artifacts, buffer } = buildFixture({ pad: 1 });
    const hm = artifacts.meta.monthly.blocks.find((b) => b.name === "hotspots_modis")!;
    expect(hm.offset % 2).toBe(1);
    const m = parseMonthly(buffer, artifacts.meta);
    expect(Array.from(m.hotspotsModis)).toEqual(HOTSPOTS_MODIS);
    expect(Array.from(m.hotspotsViirs)).toEqual(HOTSPOTS_VIIRS);
    expect(Array.from(m.celldaysViirs)).toEqual(CELLDAYS_VIIRS);
  });

  it("throws when the buffer is too short", () => {
    const { artifacts, buffer } = buildFixture();
    expect(() => parseMonthly(buffer.slice(0, buffer.byteLength - 2), artifacts.meta)).toThrow(/bytes/);
  });

  it("throws when a block length disagrees with n_cells * n_months", () => {
    const { artifacts, buffer } = buildFixture();
    artifacts.meta.monthly.blocks[0].length = 5;
    expect(() => parseMonthly(buffer, artifacts.meta)).toThrow(/celldays_modis/);
  });

  it("throws when a block is missing or out of bounds", () => {
    const { artifacts, buffer } = buildFixture();
    artifacts.meta.monthly.blocks[3].offset = 1000;
    expect(() => parseMonthly(buffer, artifacts.meta)).toThrow(/exceeds/);
    artifacts.meta.monthly.blocks.pop();
    expect(() => parseMonthly(buffer, artifacts.meta)).toThrow(/missing/);
  });
});

describe("monthIndex / monthAt", () => {
  const { artifacts } = buildFixture();
  const meta = artifacts.meta;
  it("maps across a year boundary", () => {
    expect(monthIndex(meta, "2024-11")).toBe(0);
    expect(monthIndex(meta, "2024-12")).toBe(1);
    expect(monthIndex(meta, "2025-01")).toBe(2);
    expect([0, 1, 2].map((i) => monthAt(meta, i))).toEqual(["2024-11", "2024-12", "2025-01"]);
  });
  it("returns -1 outside the range or for bad input", () => {
    expect(monthIndex(meta, "2024-10")).toBe(-1);
    expect(monthIndex(meta, "2025-02")).toBe(-1);
    expect(monthIndex(meta, "2025-13")).toBe(-1);
    expect(monthIndex(meta, "nope")).toBe(-1);
  });
  it("monthAt goes past the range and across several years", () => {
    expect(monthAt(meta, 14)).toBe("2026-01");
  });
});

describe("kForMonth", () => {
  const { artifacts } = buildFixture();
  const cal = artifacts.calibration;
  it("uses the last regime whose start is <= day 1 of the month", () => {
    expect(kForMonth(cal, "2024-11")).toBe(1);
    expect(kForMonth(cal, "2024-12")).toBe(2); // start == día 1
    expect(kForMonth(cal, "2025-01")).toBe(2);
  });
  it("returns null before the first regime", () => {
    expect(kForMonth(cal, "2019-12")).toBeNull();
  });
  it("returns null when the regime has no k", () => {
    const c = structuredClone(cal);
    c.regimes[1].k = null;
    expect(kForMonth(c, "2025-01")).toBeNull();
    expect(kForMonth(c, "2024-11")).toBe(1);
  });
});

describe("monthlySeries", () => {
  const { artifacts } = buildFixture();

  it("modis, whole country", () => {
    const s = monthlySeries(artifacts, { source: "modis" });
    expect(s.map((p) => p.month)).toEqual(["2024-11", "2024-12", "2025-01"]);
    expect(s.map((p) => p.value)).toEqual([11, 2, 8]);
    expect(s.map((p) => p.hotspots_modis)).toEqual([40010, 20, 530]);
    expect(s[0].hotspots_viirs).toBe(65535 + 100); // sin tope al agregar
  });

  it("viirs, whole country", () => {
    const s = monthlySeries(artifacts, { source: "viirs" });
    expect(s.map((p) => p.value)).toEqual([11, 13, 15]);
  });

  it("harmonized switches from MODIS to k x VIIRS at harmonized_start", () => {
    const s = monthlySeries(artifacts, { source: "harmonized" });
    expect(s[0].value).toBe(11); // MODIS
    expect(s[1].value).toBe(26); // 2 x 13
    expect(s[2].value).toBe(30); // 2 x 15
  });

  it("harmonized value is null where k is null, but not before harmonized_start", () => {
    const a = structuredClone(artifacts);
    a.calibration.regimes[1].k = null;
    const s = monthlySeries(a, { source: "harmonized" });
    expect(s.map((p) => p.value)).toEqual([11, null, null]);
  });

  it("filters by province index", () => {
    const s = monthlySeries(artifacts, { source: "modis", province: 1 });
    expect(s.map((p) => p.value)).toEqual([0, 0, 5]);
    const s0 = monthlySeries(artifacts, { source: "viirs", province: 0 });
    expect(s0.map((p) => p.value)).toEqual([11, 13, 15]);
  });

  it("honours from / to", () => {
    const s = monthlySeries(artifacts, { source: "modis", from: "2024-12", to: "2024-12" });
    expect(s).toHaveLength(1);
    expect(s[0].value).toBe(2);
    const t = monthlySeries(artifacts, { source: "modis", from: "2024-12" });
    expect(t.map((p) => p.month)).toEqual(["2024-12", "2025-01"]);
  });

  it("flags provisional months", () => {
    const s = monthlySeries(artifacts, { source: "modis" });
    expect(s.map((p) => p.provisional)).toEqual([false, false, true]);
    const a = structuredClone(artifacts);
    a.meta.first_provisional_month = null;
    expect(monthlySeries(a, { source: "modis" }).some((p) => p.provisional)).toBe(false);
  });

  it("throws on a range outside the data", () => {
    expect(() => monthlySeries(artifacts, { source: "modis", from: "2020-01" })).toThrow();
  });
});

describe("param parsing", () => {
  const { artifacts } = buildFixture();

  it("applies defaults", () => {
    const r = parseSeriesParams(qs(""), artifacts);
    expect(r).toMatchObject({ ok: true, source: "harmonized", province: null, from: "2024-11", to: "2025-01" });
  });

  it("matches the province name case-insensitively and returns the canonical name", () => {
    const r = parseSeriesParams(qs("province=entre%20r%C3%ADos&source=viirs"), artifacts);
    expect(r).toMatchObject({ ok: true, province: 1, provinceName: "Entre Ríos", source: "viirs" });
  });

  it.each([
    ["source=foo", /source/],
    ["province=Narnia", /Unknown province/],
    ["from=2024-1", /YYYY-MM/],
    ["to=2025-13", /YYYY-MM/],
    ["from=2024-10", /outside/],
    ["to=2025-02", /outside/],
    ["from=2025-01&to=2024-11", /must not be after/],
  ])("rejects %s", (q, re) => {
    const r = parseSeriesParams(qs(q), artifacts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
    expect(parseExportParams(qs(q.replace("source=foo&", "")), artifacts).ok).toBe(q.startsWith("source"));
  });
});

describe("buildCsv", () => {
  const { artifacts } = buildFixture();
  const all = { province: null, provinceName: null, from: "2024-11", to: "2025-01" };

  it("emits the header and skips all-zero rows", () => {
    const lines = buildCsv(artifacts, all)!.trimEnd().split("\n");
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines).toContain("85a,2024-11,1,4,1,10,100,false");
    expect(lines).toContain("85a,2025-01,3,6,12,30,300,true");
    expect(lines.some((l) => l.startsWith("85b,2024-11"))).toBe(false);
    expect(lines.some((l) => l.startsWith("85b,2024-12"))).toBe(false);
    expect(lines).toContain("85b,2025-01,5,0,0,500,0,true"); // k x 0 = 0
    expect(lines).toHaveLength(1 + 7);
  });

  it("leaves celldays_harmonized empty when k is null and rounds to 3 decimals", () => {
    const a = structuredClone(artifacts);
    a.calibration.regimes[1].k = null;
    expect(buildCsv(a, all)).toContain("85a,2024-12,2,5,,20,200,false");
    const b = structuredClone(artifacts);
    b.calibration.regimes[1].k = 1.23456;
    expect(buildCsv(b, all)).toContain("85a,2024-12,2,5,6.173,20,200,false");
  });

  it("filters by province and range", () => {
    const csv = buildCsv(artifacts, { province: 1, provinceName: "Entre Ríos", from: "2024-12", to: "2025-01" })!;
    expect(csv.trimEnd().split("\n")).toEqual([CSV_HEADER, "85b,2025-01,5,0,0,500,0,true"]);
  });

  it("returns null when the body exceeds the limit", () => {
    expect(buildCsv(artifacts, all, 100)).toBeNull();
  });

  it("builds a safe filename", () => {
    expect(exportFilename({ province: 1, provinceName: "Entre Ríos", from: "2024-11", to: "2025-01" })).toBe(
      "firespire-entre-rios-2024-11_2025-01.csv",
    );
    expect(exportFilename({ ...all })).toBe("firespire-argentina-2024-11_2025-01.csv");
  });
});

describe("performance sanity", () => {
  it("aggregates 15,000 cells x 313 months quickly", () => {
    const nCells = 15000;
    const nMonths = 313;
    const { artifacts } = buildFixture();
    const n = nCells * nMonths;
    const a = structuredClone(artifacts);
    a.meta.first_month = "2000-01";
    a.meta.n_months = nMonths;
    a.meta.n_cells = nCells;
    a.calibration.harmonized_start = "2012-01";
    a.cells = { h3: [], prov: Array.from({ length: nCells }, (_, i) => i % 3), provinces: ["A", "B", "C"] };
    a.monthly = {
      nCells,
      nMonths,
      celldaysModis: new Uint8Array(n).fill(1),
      celldaysViirs: new Uint8Array(n).fill(2),
      hotspotsModis: new Uint16Array(n).fill(3),
      hotspotsViirs: new Uint16Array(n).fill(4),
    };
    const t0 = performance.now();
    const s = monthlySeries(a, { source: "modis" });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(s).toHaveLength(nMonths);
    expect(s[0].value).toBe(nCells);
  });
});
