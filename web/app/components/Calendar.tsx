"use client";

import { useState } from "react";
import type { SeriesPoint } from "@/lib/artifact-types";
import { MONTH_LABELS, RAMP, binIndex, fmtInt, fmtMonth, legendItems, type CalendarRow } from "./calendar-utils";
import styles from "./Calendar.module.css";

interface Props {
  rows: CalendarRow[];
  edges: number[];
  /** Valor ya resuelto por mes para la métrica activa. */
  valueOf: (p: SeriesPoint) => number | null;
  unit: string;
}

function describe(p: SeriesPoint, v: number | null, unit: string): string {
  const val = v !== null ? `${fmtInt(v)} ${unit}` : p.no_data ? "no data (coverage gap)" : "no value (missing k)";
  return [
    fmtMonth(p.month),
    val,
    `MODIS ${fmtInt(p.celldays_modis)} cell-days`,
    `VIIRS ${fmtInt(p.celldays_viirs)} cell-days`,
    `raw hotspots MODIS ${fmtInt(p.hotspots_modis)}, VIIRS ${fmtInt(p.hotspots_viirs)}`,
    ...(p.provisional ? ["provisional (NRT)"] : []),
  ].join("; ");
}

export default function Calendar({ rows, edges, valueOf, unit }: Props) {
  const [active, setActive] = useState("");
  const legend = legendItems(edges);

  return (
    <div>
      <div className={styles.scroller}>
        <div className={styles.grid} role="group" aria-label="Fire activity by year and month">
          <span />
          {MONTH_LABELS.map((m) => (
            <span key={m} className={styles.colHead}>
              {m}
            </span>
          ))}
          {rows.map((row) => (
            <YearRow key={row.year} row={row} edges={edges} valueOf={valueOf} unit={unit} onActive={setActive} />
          ))}
        </div>
      </div>
      <p className={styles.readout} aria-live="polite">
        {active || "Hover, tap or focus a month to see its details."}
      </p>
      <div className={styles.legend} aria-label="Legend">
        {legend.map((l) => (
          <span key={l.color} className={styles.legendItem}>
            <i style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className={styles.legendItem}>
          <i className={styles.nullSw} />
          no data / no value
        </span>
        <span className={styles.legendItem}>
          <i className={styles.hatchSw} />
          provisional (NRT)
        </span>
      </div>
    </div>
  );
}

function YearRow({
  row,
  edges,
  valueOf,
  unit,
  onActive,
}: {
  row: CalendarRow;
  edges: number[];
  valueOf: (p: SeriesPoint) => number | null;
  unit: string;
  onActive: (s: string) => void;
}) {
  return (
    <>
      <span className={styles.rowHead}>{row.year}</span>
      {row.cells.map((p, i) => {
        if (!p) return <span key={i} className={styles.blank} aria-hidden="true" />;
        const v = valueOf(p);
        const text = describe(p, v, unit);
        const cls = [styles.cell, v === null ? styles.nullCell : "", p.provisional ? styles.hatch : ""].join(" ");
        return (
          <button
            key={i}
            type="button"
            className={cls}
            style={v === null ? undefined : { background: RAMP[binIndex(v, edges)] }}
            aria-label={text}
            title={text.replaceAll("; ", "\n")}
            onMouseEnter={() => onActive(text)}
            onFocus={() => onActive(text)}
            onClick={() => onActive(text)}
          />
        );
      })}
    </>
  );
}
