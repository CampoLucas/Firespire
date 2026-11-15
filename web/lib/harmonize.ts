// Cálculo en el navegador y en las rutas de API. No recalcula k: aplica calibration.json.
// Firmas congeladas (docs/contratos.md); la implementación es del paquete C.
import type { ArtifactSet, Calibration, Meta, Month, SeriesPoint, SeriesQuery } from "./artifact-types";

/** Índice 0-based de `month` respecto de meta.first_month; -1 si queda fuera de rango. */
export function monthIndex(meta: Meta, month: Month): number {
  throw new Error("not implemented");
}

/** Inversa de monthIndex. */
export function monthAt(meta: Meta, index: number): Month {
  throw new Error("not implemented");
}

/** k del régimen al que pertenece `month`; null si no hay régimen o no tiene k. */
export function kForMonth(calibration: Calibration, month: Month): number | null {
  throw new Error("not implemented");
}

/**
 * Serie mensual agregada sobre las celdas de la provincia (o todo el país).
 * harmonized: MODIS antes de calibration.harmonized_start; k × VIIRS desde ahí.
 */
export function monthlySeries(artifacts: ArtifactSet, query: SeriesQuery): SeriesPoint[] {
  throw new Error("not implemented");
}
