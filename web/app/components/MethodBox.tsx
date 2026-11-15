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
  return parts.length ? parts.join(", ") : "ok";
}

export default function MethodBox({ artifacts }: { artifacts: ArtifactSet }) {
  const { calibration, validation } = artifacts;
  return (
    <section className={styles.panel} aria-labelledby="method-h">
      <h2 id="method-h">Method</h2>
      <p>
        MODIS and VIIRS do not see fires with the same sensitivity, and VIIRS satellites change over time. To keep one
        consistent history, a VIIRS cell-day count is multiplied by a factor k so it matches the MODIS scale. k is
        estimated per constellation regime from months where both sensors observed Argentina. Before{" "}
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
              <th scope="col">k</th>
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
                <td>{r.method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
