"""Calibración MODIS/VIIRS: k por régimen VIIRS (contrato: docs/contratos.md, Método).

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


def compute(con) -> dict:
    """Contenido de calibration.json."""
    mo = load_monthly(con)
    by_regime = regime_months(mo)
    sp_set = set(mo.sp_months())
    regimes: list[dict] = []
    for i, r in enumerate(config.REGIMES):
        months = by_regime[r.id]
        sp = [m for m in months if m in sp_set]
        observed = sorted(
            {s for m in months for s in mo.satellites.get(m, {}).get(config.VIIRS, set())}
        )
        k: float | None = None
        method = "none"
        cm = sum(mo.modis.get(m, 0) for m in sp)
        cv = sum(mo.viirs.get(m, 0) for m in sp)
        if sp:
            k, cm, cv = direct_k(mo, sp)
            method = "direct" if k is not None else "none"
        elif i > 0 and "SNPP" not in r.satellites:
            # Sin meses SP propios: se estima desde el régimen anterior sin SNPP.
            prev = config.REGIMES[i - 1]
            prev_sp = [m for m in by_regime[prev.id] if m in sp_set]
            if "SNPP" in prev.satellites and prev_sp:
                # celldays_* reportan los usados para estimar k (los del régimen anterior).
                k, cm, cv = drop_snpp_k(mo, prev_sp)
                method = "drop_snpp" if k is not None else "none"
        regimes.append(
            {
                "id": r.id,
                "start": r.start.isoformat(),
                "first_month": months[0] if months else None,
                "last_month": months[-1] if months else None,
                "satellites_expected": list(r.satellites),
                "satellites_observed": observed,
                "k": k,
                "method": method,
                "sp_months": len(sp),
                "celldays_modis": cm,
                "celldays_viirs": cv,
            }
        )
    return {"scale": "MODIS", "harmonized_start": config.HARMONIZED_START, "regimes": regimes}
