// Lógica pura de la API (validación de parámetros y armado del CSV), sin dependencias de Next.
import type { ArtifactSet, Month, Source } from "./artifact-types";
import { kForMonth, monthAt, monthIndex } from "./harmonize";

export const CSV_HEADER =
  "h3_cell,month,celldays_modis,celldays_viirs,celldays_harmonized,hotspots_modis,hotspots_viirs,provisional";
/** Tope del cuerpo de export.csv (Vercel limita las respuestas a 4,5 MB). */
export const CSV_MAX_BYTES = 4 * 1024 * 1024;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const SOURCES: Source[] = ["harmonized", "modis", "viirs"];

export interface RangeParams {
  /** Índice de provincia; null = todo el país. */
  province: number | null;
  /** Nombre canónico de la provincia; null = todo el país. */
  provinceName: string | null;
  from: Month;
  to: Month;
}
export type Parsed<T> = ({ ok: true } & T) | { ok: false; error: string };

function parseRange(params: URLSearchParams, a: ArtifactSet): Parsed<RangeParams> {
  const { meta, cells } = a;
  let province: number | null = null;
  let provinceName: string | null = null;
  const pName = params.get("province");
  if (pName !== null && pName.trim() !== "") {
    const idx = cells.provinces.findIndex((p) => p.toLowerCase() === pName.trim().toLowerCase());
    if (idx < 0) return { ok: false, error: `Unknown province: ${pName}` };
    province = idx;
    provinceName = cells.provinces[idx];
  }
  const last = monthAt(meta, meta.n_months - 1);
  const read = (key: "from" | "to", dflt: Month): Parsed<{ value: Month }> => {
    const v = params.get(key);
    if (v === null || v === "") return { ok: true, value: dflt };
    if (!MONTH_RE.test(v)) return { ok: false, error: `Invalid '${key}': expected YYYY-MM` };
    if (monthIndex(meta, v) < 0) {
      return { ok: false, error: `'${key}' is outside the published range ${meta.first_month} to ${last}` };
    }
    return { ok: true, value: v };
  };
  const f = read("from", meta.first_month);
  if (!f.ok) return f;
  const t = read("to", last);
  if (!t.ok) return t;
  if (f.value > t.value) return { ok: false, error: "'from' must not be after 'to'" };
  return { ok: true, province, provinceName, from: f.value, to: t.value };
}

/** Valida los parámetros de /api/v1/series. */
export function parseSeriesParams(
  params: URLSearchParams,
  a: ArtifactSet,
): Parsed<RangeParams & { source: Source }> {
  const s = params.get("source");
  let source: Source = "harmonized";
  if (s !== null && s !== "") {
    if (!SOURCES.includes(s as Source)) {
      return { ok: false, error: `Invalid 'source': expected one of ${SOURCES.join(", ")}` };
    }
    source = s as Source;
  }
  const r = parseRange(params, a);
  return r.ok ? { ...r, source } : r;
}

/** Valida los parámetros de /api/v1/export.csv. */
export function parseExportParams(params: URLSearchParams, a: ArtifactSet): Parsed<RangeParams> {
  return parseRange(params, a);
}

/** Nombre de archivo sugerido para la descarga. */
export function exportFilename(r: RangeParams): string {
  const slug = (r.provinceName ?? "argentina")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `firespire-${slug || "argentina"}-${r.from}_${r.to}.csv`;
}

/**
 * Arma el CSV celda-mes. Devuelve null si el cuerpo supera `maxBytes`
 * (corta apenas se pasa, sin terminar de construirlo).
 */
export function buildCsv(a: ArtifactSet, r: RangeParams, maxBytes: number = CSV_MAX_BYTES): string | null {
  const { meta, cells, calibration, monthly } = a;
  const nM = monthly.nMonths;
  const from = monthIndex(meta, r.from);
  const to = monthIndex(meta, r.to);
  const len = to - from + 1;
  const months: Month[] = [];
  const ks: (number | null)[] = [];
  const useModis: boolean[] = [];
  for (let j = 0; j < len; j++) {
    const m = monthAt(meta, from + j);
    months.push(m);
    ks.push(kForMonth(calibration, m));
    useModis.push(m < calibration.harmonized_start);
  }
  const firstProv = meta.first_provisional_month;

  const lines: string[] = [CSV_HEADER];
  let bytes = CSV_HEADER.length + 1;
  for (let c = 0; c < monthly.nCells; c++) {
    if (r.province !== null && cells.prov[c] !== r.province) continue;
    const base = c * nM + from;
    const h3 = cells.h3[c];
    for (let j = 0; j < len; j++) {
      const cm = monthly.celldaysModis[base + j];
      const cv = monthly.celldaysViirs[base + j];
      const hm = monthly.hotspotsModis[base + j];
      const hv = monthly.hotspotsViirs[base + j];
      if (cm === 0 && cv === 0 && hm === 0 && hv === 0) continue;
      const k = ks[j];
      let harm = "";
      if (useModis[j]) harm = String(cm);
      else if (k !== null) harm = String(Math.round(k * cv * 1000) / 1000);
      const prov = firstProv != null && months[j] >= firstProv;
      const line = `${h3},${months[j]},${cm},${cv},${harm},${hm},${hv},${prov}`;
      bytes += line.length + 1; // todo ASCII
      if (bytes > maxBytes) return null;
      lines.push(line);
    }
  }
  return lines.join("\n") + "\n";
}
