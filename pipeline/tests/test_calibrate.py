"""Tests de calibrate.compute con cell_days armada a mano (sin depender de ingest)."""
from datetime import date

import duckdb
import pytest

from firespire import calibrate

CREATE = (
    "CREATE TABLE cell_days (h3 VARCHAR, date DATE, family VARCHAR, satellite VARCHAR, "
    "product VARCHAR, n INTEGER)"
)


def make_con(rows):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    for r in rows:
        con.execute("INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, ?)", list(r))
    return con


def row(h, d, fam, sat, prod="SP", n=1):
    return (h, d, fam, sat, prod, n)


def regime(cal, rid):
    return next(r for r in cal["regimes"] if r["id"] == rid)


def test_direct_k_and_same_day_counts_once():
    d1, d2 = date(2019, 1, 1), date(2019, 1, 2)
    con = make_con(
        [
            row("A", d1, "MODIS", "Terra"),
            row("A", d1, "MODIS", "Aqua"),  # mismo (celda, dia): cuenta una vez
            row("B", d1, "MODIS", "Terra"),
            row("B", d2, "MODIS", "Aqua"),
            row("A", d1, "VIIRS", "SNPP"),
            row("A", d1, "VIIRS", "N20"),  # idem
        ]
    )
    v2 = regime(calibrate.compute(con), "V2")
    assert v2["celldays_modis"] == 3
    assert v2["celldays_viirs"] == 1
    assert v2["k"] == pytest.approx(3.0)
    assert v2["method"] == "direct"
    assert v2["sp_months"] == 1
    assert v2["first_month"] == v2["last_month"] == "2019-01"
    assert v2["satellites_observed"] == ["N20", "SNPP"]
    assert v2["satellites_expected"] == ["SNPP", "N20"]


def test_provisional_months_excluded():
    rows = [
        row("A", date(2019, 1, 1), "MODIS", "Terra"),
        row("B", date(2019, 1, 1), "MODIS", "Terra"),
        row("A", date(2019, 1, 1), "VIIRS", "SNPP"),
        # mes provisorio: no debe contar
        row("A", date(2019, 2, 1), "MODIS", "Terra", "NRT"),
        row("A", date(2019, 2, 1), "VIIRS", "SNPP", "NRT"),
        row("B", date(2019, 2, 1), "VIIRS", "SNPP", "NRT"),
        # mes SP posterior al primero provisorio: tampoco
        row("A", date(2019, 3, 1), "MODIS", "Terra"),
        row("A", date(2019, 3, 1), "VIIRS", "SNPP"),
    ]
    con = make_con(rows)
    v2 = regime(calibrate.compute(con), "V2")
    assert v2["sp_months"] == 1
    assert v2["k"] == pytest.approx(2.0)
    assert v2["last_month"] == "2019-03"
    assert calibrate.load_monthly(con).first_provisional == "2019-02"


def drop_snpp_rows():
    d = date(2024, 1, 1)
    rows = [row(c, d, "MODIS", "Terra") for c in "ABCD"]
    rows += [row("A", d, "VIIRS", "SNPP"), row("B", d, "VIIRS", "SNPP")]
    rows += [row("A", d, "VIIRS", "N20"), row("C", d, "VIIRS", "N20")]
    # V4 (desde 2026-12) solo con filas provisorias
    rows += [row("A", date(2026, 12, 1), "VIIRS", "N21", "NRT")]
    return rows


def test_drop_snpp_estimates_next_regime():
    cal = calibrate.compute(make_con(drop_snpp_rows()))
    v3, v4 = regime(cal, "V3"), regime(cal, "V4")
    assert v3["method"] == "direct"
    assert v3["k"] == pytest.approx(4 / 3)  # VIIRS distinto: A, B, C
    assert v4["method"] == "drop_snpp"
    assert v4["k"] == pytest.approx(2.0)  # sin SNPP: A, C
    assert v4["sp_months"] == 0
    assert v4["first_month"] == "2026-12"


def test_drop_snpp_without_snpp_rows_gives_none():
    d = date(2024, 1, 1)
    rows = [row("A", d, "MODIS", "Terra"), row("A", d, "VIIRS", "N20")]
    rows += [row("A", date(2026, 12, 1), "VIIRS", "N21", "NRT")]
    v4 = regime(calibrate.compute(make_con(rows)), "V4")
    assert v4["k"] is None
    assert v4["method"] == "none"


def test_regime_out_of_range():
    con = make_con(
        [row("A", date(2019, 1, 1), "MODIS", "Terra"), row("A", date(2019, 1, 1), "VIIRS", "SNPP")]
    )
    cal = calibrate.compute(con)
    assert [r["id"] for r in cal["regimes"]] == ["V1", "V2", "V3", "V4"]
    for rid in ("V1", "V3", "V4"):
        r = regime(cal, rid)
        assert r["first_month"] is None and r["last_month"] is None
        assert r["k"] is None and r["method"] == "none"
        assert r["satellites_observed"] == []
    assert cal["scale"] == "MODIS"
    assert cal["harmonized_start"] == "2012-02"


def test_empty_table():
    cal = calibrate.compute(make_con([]))
    assert all(r["k"] is None for r in cal["regimes"])
