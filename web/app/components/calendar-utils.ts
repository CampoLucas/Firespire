// Helpers puros del calendario: formato, binning y matriz año x mes.
import type { Calibration, Month, SeriesPoint, Source } from "@/lib/artifact-types";

export const RAMP = ["#fff7dc", "#fde68a", "#f8b13a", "#f07a1f", "#d8431a", "#9c2a10", "#5a1a0e"];
export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Metric = "celldays" | "hotspots";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pf = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export const fmtInt = (n: number) => nf.format(n);
export const fmtNum = (n: number) => nf1.format(n);
export const fmtPct = (n: number) => pf.format(n);

export function fmtMonth(m: Month): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTH_LABELS[mo - 1]} ${y}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${df.format(d)} UTC`;
}

/** Valor a pintar según la métrica. Hotspots armonizados = crudos (MODIS antes de harmonized_start, VIIRS después). */
export function pointValue(p: SeriesPoint, metric: Metric, source: Source, calibration: Calibration): number | null {
  if (metric === "celldays") return p.value;
  if (source === "modis") return p.hotspots_modis;
  if (source === "viirs") return p.hotspots_viirs;
  return p.month < calibration.harmonized_start ? p.hotspots_modis : p.hotspots_viirs;
}

/** Umbrales por cuantiles de los valores positivos (hasta 6, para 7 clases). Estrictamente crecientes. */
export function binEdges(values: (number | null)[]): number[] {
  const pos = values.filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
  if (pos.length === 0) return [];
  const edges: number[] = [];
  for (let i = 1; i < RAMP.length; i++) {
    const q = pos[Math.min(pos.length - 1, Math.floor((i / RAMP.length) * pos.length))];
    if (edges.length === 0 || q > edges[edges.length - 1]) edges.push(q);
  }
  return edges;
}

/** Clase 0..edges.length: cantidad de umbrales alcanzados por v. */
export function binIndex(v: number, edges: number[]): number {
  let i = 0;
  while (i < edges.length && v >= edges[i]) i++;
  return i;
}

export interface LegendItem {
  color: string;
  label: string;
}

export function legendItems(edges: number[]): LegendItem[] {
  if (edges.length === 0) return [];
  const items: LegendItem[] = [{ color: RAMP[0], label: `< ${fmtNum(edges[0])}` }];
  for (let i = 0; i < edges.length; i++) {
    const lo = fmtNum(edges[i]);
    items.push({
      color: RAMP[i + 1],
      label: i + 1 < edges.length ? `${lo} to < ${fmtNum(edges[i + 1])}` : `≥ ${lo}`,
    });
  }
  return items;
}

export interface CalendarRow {
  year: number;
  /** 12 posiciones; undefined = fuera del rango publicado. */
  cells: (SeriesPoint | undefined)[];
}

/** Filas por año (más nuevo arriba) con los puntos ubicados por mes. */
export function buildMatrix(points: SeriesPoint[]): CalendarRow[] {
  const byYear = new Map<number, (SeriesPoint | undefined)[]>();
  for (const p of points) {
    const [y, m] = p.month.split("-").map(Number);
    let row = byYear.get(y);
    if (!row) {
      row = Array<SeriesPoint | undefined>(12).fill(undefined);
      byYear.set(y, row);
    }
    row[m - 1] = p;
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, cells]) => ({ year, cells }));
}
