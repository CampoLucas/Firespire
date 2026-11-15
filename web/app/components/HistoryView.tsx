"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArtifactSet, Source } from "@/lib/artifact-types";
import { loadArtifactsFromUrl } from "@/lib/artifacts";
import { monthlySeries } from "@/lib/harmonize";
import Calendar from "./Calendar";
import MethodBox from "./MethodBox";
import Logo from "./Logo";
import {
  binEdges,
  buildMatrix,
  fmtDateTime,
  fmtInt,
  fmtMonth,
  pointValue,
  type Metric,
} from "./calendar-utils";
import styles from "./History.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; artifacts: ArtifactSet };

const SOURCES: { id: Source; label: string }[] = [
  { id: "harmonized", label: "Harmonized" },
  { id: "modis", label: "MODIS raw" },
  { id: "viirs", label: "VIIRS raw" },
];

export default function HistoryView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadArtifactsFromUrl()
      .then((artifacts) => {
        if (!cancelled) setState({ status: "ready", artifacts });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
          <div>
            <h1>Firespire</h1>
            <p>Satellite fire hotspots in Argentina, on one consistent scale.</p>
          </div>
        </div>
        <a className={styles.globeLink} href="/globe/index.html">
          Open the fire globe
        </a>
      </header>

      {state.status === "loading" && (
        <p className={styles.status} role="status">
          Loading fire history…
        </p>
      )}
      {state.status === "error" && (
        <div className={styles.error} role="alert">
          <strong>The data could not be loaded.</strong> The published artifacts may be missing or still being built.
          <br />
          <span className={styles.detail}>{state.message}</span>
        </div>
      )}
      {state.status === "ready" && <Loaded artifacts={state.artifacts} />}
    </div>
  );
}

function Loaded({ artifacts }: { artifacts: ArtifactSet }) {
  const { meta, cells, calibration } = artifacts;
  const [source, setSource] = useState<Source>("harmonized");
  const [metric, setMetric] = useState<Metric>("celldays");
  const [province, setProvince] = useState(-1); // -1 = todo el país

  const points = useMemo(
    () => monthlySeries(artifacts, { source, province: province < 0 ? null : province }),
    [artifacts, source, province],
  );
  const values = useMemo(
    () => points.map((p) => pointValue(p, metric, source, calibration)),
    [points, metric, source, calibration],
  );
  const edges = useMemo(() => binEdges(values), [values]);
  const rows = useMemo(() => buildMatrix(points), [points]);

  const valueByMonth = useMemo(() => new Map(points.map((p, i) => [p.month, values[i]])), [points, values]);

  let total = 0;
  let peak: { month: string; value: number } | null = null;
  values.forEach((v, i) => {
    if (v === null) return;
    total += v;
    if (!peak || v > peak.value) peak = { month: points[i].month, value: v };
  });
  const peakInfo = peak as { month: string; value: number } | null;

  const unit = metric === "celldays" ? "cell-days" : "raw hotspots";
  const provinceName = province < 0 ? "" : (cells.provinces[province] ?? "");
  const csvHref = `/api/v1/export.csv${provinceName ? `?province=${encodeURIComponent(provinceName)}` : ""}`;
  const regimesWithK = calibration.regimes.filter((r) => r.k !== null);

  return (
    <>
      <section className={styles.controls} aria-label="Filters">
        <div className={styles.field}>
          <span className={styles.label} id="src-l">
            Source
          </span>
          <div className={styles.seg} role="group" aria-labelledby="src-l">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={source === s.id}
                onClick={() => setSource(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {cells.provinces.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="prov">
              Province
            </label>
            <select id="prov" value={province} onChange={(e) => setProvince(Number(e.target.value))}>
              <option value={-1}>All Argentina</option>
              {cells.provinces.map((p, i) => (
                <option key={p} value={i}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.field}>
          <span className={styles.label} id="met-l">
            Metric
          </span>
          <div className={styles.seg} role="group" aria-labelledby="met-l">
            <button type="button" aria-pressed={metric === "celldays"} onClick={() => setMetric("celldays")}>
              Cell-days
            </button>
            <button type="button" aria-pressed={metric === "hotspots"} onClick={() => setMetric("hotspots")}>
              Raw hotspots (unharmonized)
            </button>
          </div>
        </div>
        <a className={styles.download} href={csvHref} download>
          Download CSV
        </a>
      </section>
      <p className={styles.hint}>
        A cell-day is one map cell with at least one detection on a given UTC day, so many detections of the same fire
        count once. Raw hotspots count every detection and depend on each sensor&apos;s resolution
        {source === "harmonized" && metric === "hotspots"
          ? ` (here MODIS before ${fmtMonth(calibration.harmonized_start)}, VIIRS after, without any calibration)`
          : ""}
        .
      </p>

      <section className={styles.kpis} aria-label="Key figures">
        <div className={styles.kpi}>
          <span>Total {unit}</span>
          <strong>{fmtInt(total)}</strong>
          <small>
            {fmtMonth(meta.first_month)} to {points.length ? fmtMonth(points[points.length - 1].month) : "n/a"}
          </small>
        </div>
        <div className={styles.kpi}>
          <span>Peak month</span>
          <strong>{peakInfo ? fmtMonth(peakInfo.month) : "n/a"}</strong>
          <small>{peakInfo ? `${fmtInt(peakInfo.value)} ${unit}` : "no data"}</small>
        </div>
        <div className={styles.kpi}>
          <span>VIIRS-to-MODIS factor k</span>
          <strong>
            {regimesWithK.length ? regimesWithK.map((r) => (r.k as number).toFixed(2)).join(" · ") : "n/a"}
          </strong>
          <small>{regimesWithK.map((r) => r.id).join(" · ") || "no regime has k"}</small>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="cal-h">
        <h2 id="cal-h">
          Fire activity by month ({unit}
          {source === "harmonized" && metric === "celldays" ? ", harmonized" : ""})
        </h2>
        {points.length === 0 ? (
          <p>No data for this selection.</p>
        ) : (
          <Calendar
            rows={rows}
            edges={edges}
            unit={unit}
            valueOf={(p) => valueByMonth.get(p.month) ?? null}
          />
        )}
      </section>

      {meta.warnings.length > 0 && (
        <section className={styles.notice} aria-labelledby="warn-h">
          <h2 id="warn-h">Data coverage notices</h2>
          <ul className={styles.plain}>
            {meta.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <MethodBox artifacts={artifacts} />

      <footer className={styles.footer}>
        Artifact version {meta.version} · generated {fmtDateTime(meta.generated_at)} · Data: NASA FIRMS (MODIS
        Collection 6.1, VIIRS 375 m).
      </footer>
    </>
  );
}
