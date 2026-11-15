// Constructor de fixtures: un ArtifactSet mínimo y su monthly.bin equivalente según el contrato.
import type { ArtifactSet, Meta } from "../artifact-types";

export const N_CELLS = 3;
export const N_MONTHS = 3; // 2024-11, 2024-12, 2025-01 (cruza el año)

// Índice cell * N_MONTHS + month
export const CELLDAYS_MODIS = [1, 2, 3, 0, 0, 5, 10, 0, 0];
export const CELLDAYS_VIIRS = [4, 5, 6, 0, 0, 0, 7, 8, 9];
export const HOTSPOTS_MODIS = [10, 20, 30, 0, 0, 500, 40000, 0, 0];
export const HOTSPOTS_VIIRS = [100, 200, 300, 0, 0, 0, 65535, 70, 80];

export function buildFixture(opts: { pad?: number } = {}): { artifacts: ArtifactSet; buffer: ArrayBuffer } {
  const pad = opts.pad ?? 0;
  const n = N_CELLS * N_MONTHS;
  const total = pad + n * 6;
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const offs = { cm: pad, cv: pad + n, hm: pad + 2 * n, hv: pad + 4 * n };
  for (let i = 0; i < n; i++) {
    bytes[offs.cm + i] = CELLDAYS_MODIS[i];
    bytes[offs.cv + i] = CELLDAYS_VIIRS[i];
    view.setUint16(offs.hm + 2 * i, HOTSPOTS_MODIS[i], true);
    view.setUint16(offs.hv + 2 * i, HOTSPOTS_VIIRS[i], true);
  }
  const meta: Meta = {
    schema: 1,
    version: "vtest",
    generated_at: "2025-02-01T00:00:00-03:00",
    h3_res: 5,
    first_month: "2024-11",
    n_months: N_MONTHS,
    first_provisional_month: "2025-01",
    n_cells: N_CELLS,
    filters: {
      type: 0,
      modis_min_confidence: 30,
      viirs_drop_confidence: ["l"],
      mask: { res: 4, fraction: 0.5, min_days: 30, masked_cells: 0 },
    },
    satellites: { MODIS: ["Terra", "Aqua"], VIIRS: ["N20"] },
    warnings: [],
    monthly: {
      file: "monthly.bin",
      layout: "cell-major",
      blocks: [
        { name: "celldays_modis", dtype: "uint8", offset: offs.cm, length: n },
        { name: "celldays_viirs", dtype: "uint8", offset: offs.cv, length: n },
        { name: "hotspots_modis", dtype: "uint16le", offset: offs.hm, length: n },
        { name: "hotspots_viirs", dtype: "uint16le", offset: offs.hv, length: n },
      ],
    },
  };
  const artifacts: ArtifactSet = {
    meta,
    cells: { h3: ["85a", "85b", "85c"], prov: [0, 1, 0], provinces: ["Salta", "Entre Ríos"] },
    calibration: {
      scale: "MODIS",
      harmonized_start: "2024-12",
      regimes: [
        regime("r0", "2020-01-01", 1),
        regime("r1", "2024-12-01", 2),
      ],
    },
    validation: { holdout: { status: "skipped", reason: "test" }, snpp_drop: { status: "skipped" } },
    monthly: {
      nCells: N_CELLS,
      nMonths: N_MONTHS,
      celldaysModis: Uint8Array.from(CELLDAYS_MODIS),
      celldaysViirs: Uint8Array.from(CELLDAYS_VIIRS),
      hotspotsModis: Uint16Array.from(HOTSPOTS_MODIS),
      hotspotsViirs: Uint16Array.from(HOTSPOTS_VIIRS),
    },
  };
  return { artifacts, buffer };
}

function regime(id: string, start: string, k: number | null) {
  return {
    id,
    start,
    first_month: null,
    last_month: null,
    satellites_expected: [],
    satellites_observed: [],
    k,
    method: "direct" as const,
    sp_months: 0,
    celldays_modis: 0,
    celldays_viirs: 0,
  };
}
