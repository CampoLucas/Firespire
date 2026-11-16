// Cálculo en el navegador y en las rutas de API. No recalcula k: aplica calibration.json.
// Firmas congeladas (docs/contratos.md); la implementación es del paquete C.
import type {
  ArtifactSet,
  Calibration,
  Meta,
  Month,
  RegimeCalibration,
  SeriesPoint,
  SeriesQuery,
} from "./artifact-types";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Número absoluto de mes (año*12 + mes0) o null si el formato es inválido. */
function monthOrdinal(month: Month): number | null {
  const m = MONTH_RE.exec(month);
  return m ? Number(m[1]) * 12 + (Number(m[2]) - 1) : null;
}

/** Índice 0-based de `month` respecto de meta.first_month; -1 si queda fuera de rango. */
export function monthIndex(meta: Meta, month: Month): number {
  const a = monthOrdinal(month);
  const b = monthOrdinal(meta.first_month);
  if (a === null || b === null) return -1;
  const i = a - b;
  return i >= 0 && i < meta.n_months ? i : -1;
}

/** Inversa de monthIndex. */
export function monthAt(meta: Meta, index: number): Month {
  const b = monthOrdinal(meta.first_month);
  if (b === null) throw new Error(`Invalid first_month: ${meta.first_month}`);
  const o = b + index;
  const y = Math.floor(o / 12);
  const m = o - y * 12 + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/**
 * k del régimen al que pertenece `month`; null si no hay régimen o no tiene k.
 * Si el régimen trae k_by_month y el mes calendario tiene un valor finito, se usa ese;
 * si no (artefactos viejos, entrada null), cae al k del régimen.
 */
export function kForMonth(calibration: Calibration, month: Month): number | null {
  const first = `${month}-01`;
  let regime: RegimeCalibration | null = null;
  // Los regímenes vienen ordenados por start; igual se toma el de start máximo <= día 1.
  for (const r of calibration.regimes) {
    if (r.start <= first && (regime === null || r.start >= regime.start)) regime = r;
  }
  if (regime === null) return null;
  const m = MONTH_RE.exec(month);
  const seasonal = m ? regime.k_by_month?.[Number(m[2]) - 1] : undefined;
  return typeof seasonal === "number" && Number.isFinite(seasonal) ? seasonal : regime.k;
}

/**
 * Serie mensual agregada sobre las celdas de la provincia (o todo el país).
 * harmonized: MODIS antes de calibration.harmonized_start; k × VIIRS desde ahí.
 */
export function monthlySeries(artifacts: ArtifactSet, query: SeriesQuery): SeriesPoint[] {
  const { meta, cells, calibration, monthly } = artifacts;
  const nM = monthly.nMonths;
  const from = query.from !== undefined ? monthIndex(meta, query.from) : 0;
  const to = query.to !== undefined ? monthIndex(meta, query.to) : nM - 1;
  if (from < 0 || to < 0) throw new Error("Month out of the published range");
  if (from > to) throw new Error("'from' must not be after 'to'");
  const len = to - from + 1;

  const cm = new Float64Array(len);
  const cv = new Float64Array(len);
  const hm = new Float64Array(len);
  const hv = new Float64Array(len);
  const prov = query.province ?? null;
  for (let c = 0; c < monthly.nCells; c++) {
    if (prov !== null && cells.prov[c] !== prov) continue;
    const base = c * nM + from;
    for (let j = 0; j < len; j++) {
      cm[j] += monthly.celldaysModis[base + j];
      cv[j] += monthly.celldaysViirs[base + j];
      hm[j] += monthly.hotspotsModis[base + j];
      hv[j] += monthly.hotspotsViirs[base + j];
    }
  }

  const points: SeriesPoint[] = new Array(len);
  const firstProv = meta.first_provisional_month;
  const missingModis = new Set(meta.months_without_data?.MODIS ?? []);
  const missingViirs = new Set(meta.months_without_data?.VIIRS ?? []);
  for (let j = 0; j < len; j++) {
    const month = monthAt(meta, from + j);
    // Familia que usa la fuente en este mes: el armonizado es MODIS antes de harmonized_start.
    const useModis =
      query.source === "modis" || (query.source === "harmonized" && month < calibration.harmonized_start);
    const noData = useModis ? missingModis.has(month) : missingViirs.has(month);
    let value: number | null;
    if (noData) value = null;
    else if (useModis) value = cm[j];
    else if (query.source === "viirs") value = cv[j];
    else {
      const k = kForMonth(calibration, month);
      value = k === null ? null : k * cv[j];
    }
    points[j] = {
      month,
      value,
      no_data: noData,
      celldays_modis: cm[j],
      celldays_viirs: cv[j],
      hotspots_modis: hm[j],
      hotspots_viirs: hv[j],
      provisional: firstProv != null && month >= firstProv,
    };
  }
  return points;
}
