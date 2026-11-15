import type { ArtifactSet, HoldoutValidation } from "@/lib/artifact-types";
import { fmtMonth, fmtPct } from "./calendar-utils";
import styles from "./History.module.css";

function holdoutText(h: HoldoutValidation | undefined): string {
  if (!h) return "not available";
  if (h.status === "skipped") return `skipped: ${h.reason ?? "no reason given"}`;
  const parts: string[] = [];
  if (h.mape_monthly !== undefined) parts.push(`monthly MAPE ${fmtPct(h.mape_monthly)}`);
  if (h.bias_total !== undefined) parts.push(`total bias ${fmtPct(h.bias_total)}`);
  if (h.test) parts.push(`test ${fmtMonth(h.test.from)} to ${fmtMonth(h.test.to)}`);
  if (h.mape_monthly_single_k != null) {
    const bias = h.bias_total_single_k != null ? `, bias ${fmtPct(h.bias_total_single_k)}` : "";
    parts.push(`(single k per regime: MAPE ${fmtPct(h.mape_monthly_single_k)}${bias})`);
  }
  return parts.length ? parts.join(", ") : "ok";
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Rango "min–max" de los k mensuales no nulos; null si el régimen no los trae. */
function monthlyRange(kByMonth: (number | null)[] | undefined): string | null {
  const vals = (kByMonth ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return null;
  return `${Math.min(...vals).toFixed(3)}–${Math.max(...vals).toFixed(3)}`;
}

export default function MethodBox({ artifacts }: { artifacts: ArtifactSet }) {
  const { calibration, validation } = artifacts;
  const seasonal = calibration.regimes.filter((r) => monthlyRange(r.k_by_month) !== null);
  return (
    <section className={styles.panel} aria-labelledby="method-h">
      <h2 id="method-h">Method</h2>
      <p>
        MODIS and VIIRS do not see fires with the same sensitivity, and VIIRS satellites change over time. To keep one
        consistent history, a VIIRS cell-day count is multiplied by a factor k so it matches the MODIS scale. k is
        estimated per constellation regime from months where both sensors observed Argentina. It is also estimated per
        calendar month, because VIIRS detects relatively more of the small low-season fires. Before{" "}
        {fmtMonth(calibration.harmonized_start)} the harmonized series is MODIS as measured; from then on it is k ×
        VIIRS.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>Constellation regimes and calibration</caption>
          <thead>
            <tr>
              <th scope="col">Regime</th>
              <th scope="col">Start</th>
              <th scope="col">Satellites expected</th>
              <th scope="col">Observed</th>
              <th scope="col">k (regime, pooled)</th>
              {seasonal.length > 0 && <th scope="col">k by calendar month (min–max)</th>}
              <th scope="col">Method</th>
            </tr>
          </thead>
          <tbody>
            {calibration.regimes.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.id}</th>
                <td>{r.start}</td>
                <td>{r.satellites_expected.join(", ") || "none"}</td>
                <td>{r.satellites_observed.join(", ") || "none"}</td>
                <td>{r.k === null ? "n/a" : r.k.toFixed(3)}</td>
                {seasonal.length > 0 && <td>{monthlyRange(r.k_by_month) ?? "n/a"}</td>}
                <td>{r.method === "direct_incomplete" ? "direct_incomplete (provisional)" : r.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {seasonal.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              k by regime and calendar month; a dash means the regime k is used
            </caption>
            <thead>
              <tr>
                <th scope="col">Regime</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} scope="col">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasonal.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.id}</th>
                  {MONTH_LABELS.map((m, i) => {
                    const v = r.k_by_month?.[i];
                    return <td key={m}>{typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {seasonal.length > 0 && (
        <p className={styles.hint}>A dash means that month has no estimate of its own, so the regime k is used.</p>
      )}
      <h3>Validation</h3>
      <ul className={styles.plain}>
        <li>
          <strong>Holdout (last 12 standard months):</strong> {holdoutText(validation.holdout)}
        </li>
        <li>
          <strong>S-NPP drop (from 2025-01):</strong> {holdoutText(validation.snpp_drop)}
        </li>
      </ul>
    </section>
  );
}
