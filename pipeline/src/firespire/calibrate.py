"""Calibración MODIS/VIIRS: k por régimen VIIRS y mes calendario (contrato: docs/contratos.md, Método).

Los helpers `load_monthly` y `month_range` los reutilizan validate.py y export.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from firespire import config


def _next_month(m: str) -> str:
    y, mo = int(m[:4]), int(m[5:7])
    return f"{y + 1}-01" if mo == 12 else f"{y}-{mo + 1:02d}"


def month_range(first: str, last: str) -> list[str]:
    """Meses 'YYYY-MM' contiguos de first a last, inclusive."""
    out = [first]
    while out[-1] < last:
        out.append(_next_month(out[-1]))
    return out


@dataclass
class Monthly:
    """Agregados mensuales de cell_days (todas las celdas sumadas)."""

    months: list[str] = field(default_factory=list)
    modis: dict[str, int] = field(default_factory=dict)  # celda-días MODIS
    viirs: dict[str, int] = field(default_factory=dict)  # celda-días VIIRS
    viirs_no_snpp: dict[str, int] = field(default_factory=dict)  # VIIRS sin filas SNPP
    provisional: set[str] = field(default_factory=set)  # meses con alguna fila NRT
    satellites: dict[str, dict[str, set[str]]] = field(default_factory=dict)  # mes -> familia -> sats

    @property
    def first_provisional(self) -> str | None:
        return min(self.provisional) if self.provisional else None

    def sp_months(self) -> list[str]:
        """Meses de calibración: anteriores al primer mes provisorio."""
        fp = self.first_provisional
        return [m for m in self.months if fp is None or m < fp]

    def has_snpp(self, months: list[str] | None = None) -> bool:
        ms = self.months if months is None else months
        return any("SNPP" in self.satellites.get(m, {}).get(config.VIIRS, set()) for m in ms)


def load_monthly(con) -> Monthly:
    """Lee cell_days y agrega por mes UTC. Una celda-día cuenta una vez por familia."""
    mo = Monthly()
    rng = con.execute("SELECT min(date), max(date) FROM cell_days").fetchone()
    if rng is None or rng[0] is None:
        return mo
    mo.months = month_range(rng[0].strftime("%Y-%m"), rng[1].strftime("%Y-%m"))
    q = (
        "SELECT strftime(date, '%Y-%m'), count(*) FROM "
        "(SELECT DISTINCT h3, date FROM cell_days WHERE {w}) GROUP BY 1"
    )
    for m, n in con.execute(q.format(w=f"family = '{config.MODIS}'")).fetchall():
        mo.modis[m] = n
    for m, n in con.execute(q.format(w=f"family = '{config.VIIRS}'")).fetchall():
        mo.viirs[m] = n
    w = f"family = '{config.VIIRS}' AND satellite <> 'SNPP'"
    for m, n in con.execute(q.format(w=w)).fetchall():
        mo.viirs_no_snpp[m] = n
    mo.provisional = {
        r[0]
        for r in con.execute(
            "SELECT DISTINCT strftime(date, '%Y-%m') FROM cell_days WHERE product = 'NRT'"
        ).fetchall()
    }
    for m, fam, sat in con.execute(
        "SELECT DISTINCT strftime(date, '%Y-%m'), family, satellite FROM cell_days"
    ).fetchall():
        mo.satellites.setdefault(m, {}).setdefault(fam, set()).add(sat)
    return mo


def regime_months(mo: Monthly) -> dict[str, list[str]]:
    """Meses del rango de datos por id de régimen."""
    out: dict[str, list[str]] = {r.id: [] for r in config.REGIMES}
    for m in mo.months:
        r = config.regime_for_month(m)
        if r is not None:
            out[r.id].append(m)
    return out


def direct_k(mo: Monthly, months: list[str]) -> tuple[float | None, int, int]:
    """k = suma MODIS / suma VIIRS sobre `months`. Devuelve (k, sum MODIS, sum VIIRS)."""
    cm = sum(mo.modis.get(m, 0) for m in months)
    cv = sum(mo.viirs.get(m, 0) for m in months)
    return (cm / cv if cv > 0 else None), cm, cv


def drop_snpp_k(mo: Monthly, months: list[str]) -> tuple[float | None, int, int]:
    """k con las filas SNPP quitadas del VIIRS de `months`; None si no hay SNPP o datos."""
    if not mo.has_snpp(months):
        return None, 0, 0
    cm = sum(mo.modis.get(m, 0) for m in months)
    cv = sum(mo.viirs_no_snpp.get(m, 0) for m in months)
    return (cm / cv if cv > 0 and cm > 0 else None), cm, cv


def seasonal_k(
    mo: Monthly, months: list[str], viirs: dict[str, int] | None = None
) -> tuple[list[float | None], list[int]]:
    """k por mes calendario (índice 0 = enero) sobre `months`: (k_by_month, k_by_month_n).

    Para cada mes calendario c: si hay al menos CALIBRATION_MIN_MONTHS_PER_CALENDAR_MONTH meses
    de `months` con ese mes del año y las sumas de VIIRS y MODIS son > 0, k = Σ MODIS / Σ VIIRS;
    si no, null (n = 0) y quien lo use cae al k del régimen. `viirs` permite usar otra serie
    (p. ej. VIIRS sin SNPP). Con CALIBRATION_K_BY_CALENDAR_MONTH False todo queda null.
    """
    ks: list[float | None] = [None] * 12
    ns = [0] * 12
    if not config.CALIBRATION_K_BY_CALENDAR_MONTH:
        return ks, ns
    v = mo.viirs if viirs is None else viirs
    for c in range(12):
        ms = [m for m in months if int(m[5:7]) == c + 1]
        if len(ms) < config.CALIBRATION_MIN_MONTHS_PER_CALENDAR_MONTH:
            continue
        cm = sum(mo.modis.get(m, 0) for m in ms)
        cv = sum(v.get(m, 0) for m in ms)
        if cm > 0 and cv > 0:
            ks[c] = cm / cv
            ns[c] = len(ms)
    return ks, ns


def k_for(regime_entry: dict, month: str) -> float | None:
    """k a aplicar a `month` ('YYYY-MM'): el de su mes calendario si existe; si no, el del régimen."""
    by_month = regime_entry.get("k_by_month")
    if by_month:
        k_m = by_month[int(month[5:7]) - 1]
        if k_m is not None:
            return k_m
    return regime_entry.get("k")


def _paired_sp(mo: Monthly, months: list[str], sp_set: set[str]) -> list[str]:
    """Meses SP del régimen con celda-días de MODIS y de VIIRS (un solo lado sesgaría k)."""
    return [
        m for m in months if m in sp_set and mo.modis.get(m, 0) > 0 and mo.viirs.get(m, 0) > 0
    ]


def _split_complete(
    mo: Monthly, paired: list[str], expected: tuple[str, ...]
) -> tuple[list[str], list[str]]:
    """(completos, incompletos): completo = VIIRS observó todos los satélites esperados."""
    need = set(expected)
    complete = [m for m in paired if need <= mo.satellites.get(m, {}).get(config.VIIRS, set())]
    done = set(complete)
    return complete, [m for m in paired if m not in done]


def _regime_plan(mo: Monthly) -> list[dict]:
    """Por régimen: meses emparejados, completos/incompletos y los usados para k directo."""
    by_regime = regime_months(mo)
    sp_set = set(mo.sp_months())
    plan = []
    for r in config.REGIMES:
        paired = _paired_sp(mo, by_regime[r.id], sp_set)
        complete, incomplete = _split_complete(mo, paired, r.satellites)
        if not config.CALIBRATION_REQUIRE_ALL_SATELLITES:
            used, method = paired, "direct"
        elif complete:
            used, method = complete, "direct"
        elif incomplete:
            used, method = incomplete, "direct_incomplete"
        else:
            used, method = [], "none"
        plan.append(
            {"months": by_regime[r.id], "complete": complete, "incomplete": incomplete,
             "used": used, "method": method}
        )
    return plan


def calibration_months(mo: Monthly) -> list[str]:
    """Meses (ordenados, sin repetir) que alimentan algún k directo o directo incompleto."""
    return sorted({m for p in _regime_plan(mo) for m in p["used"]})


def regime_calibration_months(mo: Monthly) -> dict[str, list[str]]:
    """Meses que alimentan el k directo de cada régimen (id -> meses ordenados)."""
    return {r.id: sorted(p["used"]) for r, p in zip(config.REGIMES, _regime_plan(mo))}


def compute(con) -> dict:
    """Contenido de calibration.json."""
    mo = load_monthly(con)
    plan = _regime_plan(mo)
    regimes: list[dict] = []
    for i, r in enumerate(config.REGIMES):
        p = plan[i]
        months, used = p["months"], p["used"]
        observed = sorted(
            {s for m in months for s in mo.satellites.get(m, {}).get(config.VIIRS, set())}
        )
        observed_sp = sorted(
            {s for m in used for s in mo.satellites.get(m, {}).get(config.VIIRS, set())}
        )
        k: float | None = None
        method = "none"
        cm = sum(mo.modis.get(m, 0) for m in used)
        cv = sum(mo.viirs.get(m, 0) for m in used)
        n_used = len(used)
        k_by_month: list[float | None] = [None] * 12
        k_by_month_n = [0] * 12
        if used:
            k, cm, cv = direct_k(mo, used)
            method = p["method"] if k is not None else "none"
            if k is not None:
                k_by_month, k_by_month_n = seasonal_k(mo, used)
        elif i > 0 and "SNPP" not in r.satellites:
            # Sin meses SP propios: se estima desde el régimen anterior sin SNPP.
            prev = config.REGIMES[i - 1]
            prev_p = plan[i - 1]
            prev_sp = prev_p["complete"] or prev_p["incomplete"]
            if "SNPP" in prev.satellites and prev_sp:
                # celldays_* reportan los usados para estimar k (los del régimen anterior).
                k, cm, cv = drop_snpp_k(mo, prev_sp)
                method = "drop_snpp" if k is not None else "none"
                if k is not None:
                    k_by_month, k_by_month_n = seasonal_k(mo, prev_sp, mo.viirs_no_snpp)
        regimes.append(
            {
                "id": r.id,
                "start": r.start.isoformat(),
                "first_month": months[0] if months else None,
                "last_month": months[-1] if months else None,
                "satellites_expected": list(r.satellites),
                "satellites_observed": observed,
                "k": k,
                "k_by_month": k_by_month,
                "k_by_month_n": k_by_month_n,
                "method": method,
                "sp_months": n_used,
                "sp_months_incomplete": sorted(p["incomplete"]),
                "satellites_observed_sp": observed_sp,
                "celldays_modis": cm,
                "celldays_viirs": cv,
            }
        )
    return {
        "scale": "MODIS",
        "harmonized_start": config.HARMONIZED_START,
        "k_granularity": "regime_month" if config.CALIBRATION_K_BY_CALENDAR_MONTH else "regime",
        "regimes": regimes,
    }
