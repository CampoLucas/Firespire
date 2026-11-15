"""Validación: holdout temporal y caída de S-NPP (contrato: docs/contratos.md, Método)."""
from __future__ import annotations

from firespire import calibrate, config

HOLDOUT_TEST_MONTHS = 12
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
    """k con todos los meses SP salvo los últimos 12, aplicado a esos 12.

    Simplificación: un único k para todos los regímenes (no uno por régimen).
    """
    sp = [m for m in mo.sp_months() if mo.modis.get(m, 0) > 0 and mo.viirs.get(m, 0) > 0]
    if len(sp) < 2 * HOLDOUT_TEST_MONTHS:
        return {
            "status": "skipped",
            "reason": f"Fewer than {2 * HOLDOUT_TEST_MONTHS} standard-product months with both "
            f"MODIS and VIIRS data ({len(sp)} found); a single k is used across regimes.",
        }
    train, test = sp[:-HOLDOUT_TEST_MONTHS], sp[-HOLDOUT_TEST_MONTHS:]
    k, _, _ = calibrate.direct_k(mo, train)
    if k is None:
        return {"status": "skipped", "reason": "No VIIRS cell-days in the training months."}
    series = [_point(m, mo.modis[m], mo.viirs[m], k * mo.viirs[m]) for m in test]
    mape, bias = _metrics(series)
    return {
        "status": "ok",
        "reason": "A single k across all VIIRS regimes is used for the holdout.",
        "train": {"from": train[0], "to": train[-1]},
        "test": {"from": test[0], "to": test[-1]},
        "k_train": k,
        "mape_monthly": mape,
        "bias_total": bias,
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
        [m for m in by_regime[base.id] if m in sp_set and mo.viirs.get(m, 0) > 0] if base else []
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
