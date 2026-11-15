// Contrato de artefactos v1 (schema: 1). Lo escribe pipeline/src/firespire/export.py.
// Referencia completa: docs/contratos.md. No cambiar sin actualizar ambos lados.

/** Mes calendario UTC, "YYYY-MM". */
export type Month = string;

export type BlockName =
  | "celldays_modis"
  | "celldays_viirs"
  | "hotspots_modis"
  | "hotspots_viirs";

export interface MonthlyBlock {
  name: BlockName;
  dtype: "uint8" | "uint16le";
  /** Offset en bytes dentro de monthly.bin. */
  offset: number;
  /** Cantidad de elementos (= n_cells * n_months). */
  length: number;
}

export interface Meta {
  schema: 1;
  version: string;
  /** ISO 8601 con offset. */
  generated_at: string;
  h3_res: number;
  first_month: Month;
  n_months: number;
  /** Primer mes con datos NRT; null si todo es estándar (SP). */
  first_provisional_month: Month | null;
  n_cells: number;
  filters: {
    type: number;
    modis_min_confidence: number;
    viirs_drop_confidence: string[];
    mask: { res: number; fraction: number; min_days: number; masked_cells: number };
  };
  /** Satélites con datos en esta corrida. */
  satellites: { MODIS: string[]; VIIRS: string[] };
  /** Avisos legibles (en inglés) sobre cobertura incompleta; la UI los muestra. */
  warnings: string[];
  monthly: {
    file: "monthly.bin";
    /** Índice de un valor dentro de un bloque: cell * n_months + month. */
    layout: "cell-major";
    blocks: MonthlyBlock[];
  };
}

export interface Cells {
  /** Celdas H3 en el orden de monthly.bin. */
  h3: string[];
  /** Índice en `provinces` por celda; -1 si no cae en ninguna. */
  prov: number[];
  provinces: string[];
}

export interface RegimeCalibration {
  id: string;
  /** "YYYY-MM-DD" */
  start: string;
  /** Primer y último mes del régimen dentro del rango publicado; null si no hay meses. */
  first_month: Month | null;
  last_month: Month | null;
  satellites_expected: string[];
  satellites_observed: string[];
  /** Factor a escala MODIS; null si no se pudo estimar. */
  k: number | null;
  /** direct: meses SP propios. drop_snpp: estimado quitando S-NPP del régimen anterior. */
  method: "direct" | "drop_snpp" | "none";
  sp_months: number;
  celldays_modis: number;
  celldays_viirs: number;
}

export interface Calibration {
  scale: "MODIS";
  /** Desde este mes la serie armonizada es k × VIIRS; antes es MODIS. */
  harmonized_start: Month;
  regimes: RegimeCalibration[];
}

export interface ValidationPoint {
  month: Month;
  modis: number;
  viirs: number;
  harmonized: number;
}

export interface HoldoutValidation {
  status: "ok" | "skipped";
  reason?: string;
  train?: { from: Month; to: Month };
  test?: { from: Month; to: Month };
  k_train?: number;
  /** Error absoluto porcentual medio mensual, armonizado vs. MODIS, en el período de test (0–1). */
  mape_monthly?: number;
  /** (Σ armonizado − Σ MODIS) / Σ MODIS en el período de test. */
  bias_total?: number;
  series?: ValidationPoint[];
}

export interface Validation {
  holdout: HoldoutValidation;
  snpp_drop: HoldoutValidation;
}

export interface Latest {
  version: string;
}

/** monthly.bin ya parseado. Índice: cell * nMonths + month. */
export interface MonthlyData {
  nCells: number;
  nMonths: number;
  celldaysModis: Uint8Array;
  celldaysViirs: Uint8Array;
  hotspotsModis: Uint16Array;
  hotspotsViirs: Uint16Array;
}

export interface ArtifactSet {
  meta: Meta;
  cells: Cells;
  calibration: Calibration;
  validation: Validation;
  monthly: MonthlyData;
}

export type Source = "harmonized" | "modis" | "viirs";

export interface SeriesQuery {
  source: Source;
  /** Índice de provincia de cells.provinces; null/undefined = todo el país. */
  province?: number | null;
  /** Rango inclusivo; por defecto todo el rango publicado. */
  from?: Month;
  to?: Month;
}

export interface SeriesPoint {
  month: Month;
  /** Celda-días según `source`; null si falta k para ese mes. */
  value: number | null;
  celldays_modis: number;
  celldays_viirs: number;
  hotspots_modis: number;
  hotspots_viirs: number;
  provisional: boolean;
}
