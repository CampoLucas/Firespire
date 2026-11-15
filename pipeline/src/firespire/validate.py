"""Validación: holdout temporal y caída de S-NPP (contrato: docs/contratos.md, Método)."""
from __future__ import annotations

from firespire import calibrate, config

HOLDOUT_TEST_MONTHS = 12
HOLDOUT_MIN_TRAIN_MONTHS = 12
SNPP_DROP_FROM = "2025-01"


def _point(m: str, modis: int, viirs: int, harmonized: float) -> dict:
    return {"month": m, "modis": modis, "viirs": viirs, "harmonized": harmonized}


def _metrics(series: list[dict]) -> tuple[float | None, float | None]:
    """(mape_monthly como fracción, bias_total) de armonizado vs MODIS."""
    errs = [abs(p["harmonized"] - p["modis"]) / p["modis"] for p in series if p["modis"] > 0]
    mape = sum(errs) / len(errs) if errs else None
    sm = sum(p["modis"] for p in series)
    bias = (sum(p["harmonized"] for p in series) - sm) / sm if sm > 0 else None
    return mape, bias


def holdout(mo: calibrate.Monthly) -> dict:
    """k por régimen VIIRS (y mes calendario) sin los meses de test, aplicado a los últimos 12.

    Valida el método que se usa de verdad: por mes de test se usa el k de ese mes calendario
    estimado con los meses de entrenamiento del régimen (si hay el mínimo; si no, el k del
    régimen). `mape_monthly_single_k` / `bias_total_single_k` repiten el test con el k único por
    régimen (comportamiento anterior). Los regímenes con menos de
    HOLDOUT_MIN_TRAIN_MONTHS meses de entrenamiento restantes quedan fuera del test.
    """
    cal = sorted(
        m for m in calibrate.calibration_months(mo)
        if mo.modis.get(m, 0) > 0 and mo.viirs.get(m, 0) > 0
    )
    if len(cal) < 2 * HOLDOUT_TEST_MONTHS:
        return {
            "status": "skipped",
            "reason": f"Fewer than {2 * HOLDOUT_TEST_MONTHS} calibration months with both "
            f"MODIS and VIIRS data ({len(cal)} found).",
        }
    test_all = cal[-HOLDOUT_TEST_MONTHS:]
    test_set = set(test_all)
    used_by_regime = calibrate.regime_calibration_months(mo)
    test_regimes = {r.id for m in test_all if (r := config.regime_for_month(m))}
    k_by_regime: dict[str, float] = {}
    train_by_regime: dict[str, list[str]] = {}
    seasonal_by_regime: dict[str, list[float | None]] = {}
    excluded: list[str] = []
    for r in config.REGIMES:
        if r.id not in test_regimes:
            continue
        train_r = [m for m in used_by_regime[r.id] if m not in test_set]
        k_r, _, _ = calibrate.direct_k(mo, train_r) if train_r else (None, 0, 0)
        if len(train_r) < HOLDOUT_MIN_TRAIN_MONTHS or k_r is None:
            excluded.append(r.id)
            continue
        k_by_regime[r.id] = k_r
        seasonal_by_regime[r.id] = calibrate.seasonal_k(mo, train_r)[0]
        train_by_regime[r.id] = train_r
    test = [m for m in test_all if (r := config.regime_for_month(m)) and r.id in k_by_regime]
    if not test:
        return {
            "status": "skipped",
            "reason": f"Fewer than {HOLDOUT_MIN_TRAIN_MONTHS} training months outside the test "
            f"period for regime(s) {', '.join(excluded)}.",
        }
    series = []
    single = []
    for m in test:
        rid = config.regime_for_month(m).id
        entry = {"k": k_by_regime[rid], "k_by_month": seasonal_by_regime[rid]}
        k_m = calibrate.k_for(entry, m)
        series.append(_point(m, mo.modis[m], mo.viirs[m], k_m * mo.viirs[m]))
        single.append(_point(m, mo.modis[m], mo.viirs[m], k_by_regime[rid] * mo.viirs[m]))
    mape, bias = _metrics(series)
    mape_single, bias_single = _metrics(single)
    seasonal = config.CALIBRATION_K_BY_CALENDAR_MONTH
    reason = (
        "k is estimated per VIIRS regime and calendar month without the test months and "
        "applied to them (regime k where a calendar month has too few training months)."
        if seasonal
        else "k is estimated per VIIRS regime without the test months and applied to them."
    )
    if excluded:
        reason += (
            f" Regime(s) {', '.join(excluded)} excluded: fewer than "
            f"{HOLDOUT_MIN_TRAIN_MONTHS} training months."
        )
    train_all = sorted({m for ms in train_by_regime.values() for m in ms})
    return {
        "status": "ok",
        "reason": reason,
        "train": {"from": train_all[0], "to": train_all[-1]},
        "test": {"from": test[0], "to": test[-1]},
        # Compatibilidad: k del régimen del último mes de test.
        "k_train": k_by_regime[config.regime_for_month(test[-1]).id],
        "k_train_by_regime": k_by_regime,
        "train_months_by_regime": {rid: len(ms) for rid, ms in train_by_regime.items()},
        "mape_monthly": mape,
        "bias_total": bias,
        "k_granularity": "regime_month" if seasonal else "regime",
        "mape_monthly_single_k": mape_single,
        "bias_total_single_k": bias_single,
        "k_train_by_regime_month": seasonal_by_regime,
        "series": series,
    }


def snpp_drop(mo: calibrate.Monthly) -> dict:
    """Desde 2025-01: k_drop x VIIRS sin SNPP contra MODIS (y k con SNPP como comparación)."""
    if not mo.has_snpp():
        return {"status": "skipped", "reason": "No S-NPP rows in the data."}
    by_regime = calibrate.regime_months(mo)
    sp_set = set(mo.sp_months())
    regs = config.REGIMES
    base = next(
        (
            regs[i]
            for i in range(len(regs) - 1)
            if "SNPP" in regs[i].satellites and "SNPP" not in regs[i + 1].satellites
        ),
        None,
    )
    base_sp = (
        [
            m for m in by_regime[base.id]
            if m in sp_set and mo.viirs.get(m, 0) > 0
            and "SNPP" in mo.satellites.get(m, {}).get(config.VIIRS, set())
        ]
        if base
        else []
    )
    if not base_sp:
        return {"status": "skipped", "reason": "No standard-product months with S-NPP to train on."}
    k_all, _, _ = calibrate.direct_k(mo, base_sp)
    k_drop, _, _ = calibrate.drop_snpp_k(mo, base_sp)
    if k_all is None or k_drop is None:
        return {"status": "skipped", "reason": "Could not estimate k without S-NPP."}
    test = [
        m
        for m in mo.months
        if m >= SNPP_DROP_FROM and mo.modis.get(m, 0) > 0 and mo.viirs_no_snpp.get(m, 0) > 0
    ]
    if not test:
        return {"status": "skipped", "reason": f"No months from {SNPP_DROP_FROM} with data."}
    series = [
        _point(m, mo.modis[m], mo.viirs.get(m, 0), k_drop * mo.viirs_no_snpp[m]) for m in test
    ]
    mape, bias = _metrics(series)
    old = [_point(m, mo.modis[m], mo.viirs.get(m, 0), k_all * mo.viirs.get(m, 0)) for m in test]
    mape_old, bias_old = _metrics(old)
    return {
        "status": "ok",
        "train": {"from": base_sp[0], "to": base_sp[-1]},
        "test": {"from": test[0], "to": test[-1]},
        "k_train": k_drop,
        "mape_monthly": mape,
        "bias_total": bias,
        "series": series,
        # Extras (la web los ignora): comparación con k del régimen base y todo el VIIRS.
        "k_with_snpp": k_all,
        "mape_monthly_with_snpp_k": mape_old,
        "bias_total_with_snpp_k": bias_old,
    }


def compute(con) -> dict:
    """Contenido de validation.json."""
    mo = calibrate.load_monthly(con)
    return {"holdout": holdout(mo), "snpp_drop": snpp_drop(mo)}
