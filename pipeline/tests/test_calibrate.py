"""Tests de calibrate.compute con cell_days armada a mano (sin depender de ingest)."""
from datetime import date

import duckdb
import pytest

from firespire import calibrate, config

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
    # V3 espera N21 y el SP no lo trae: k directo pero marcado como incompleto.
    assert v3["method"] == "direct_incomplete"
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


def v3_month_rows(d, modis_cells, viirs, sats):
    """Un mes V3: MODIS en `modis_cells`; VIIRS por satélite en las celdas dadas."""
    rows = [row(c, d, "MODIS", "Terra") for c in modis_cells]
    for sat in sats:
        rows += [row(c, d, "VIIRS", sat) for c in viirs]
    return rows


def test_complete_months_only_and_incomplete_listed():
    rows = v3_month_rows(date(2023, 4, 1), "ABCD", "AB", ["N20"])  # incompleto: 4/2
    rows += v3_month_rows(date(2023, 5, 1), "ABCD", "ABCD", ["SNPP", "N20", "N21"])  # 4/4
    cal = calibrate.compute(make_con(rows))
    v3 = regime(cal, "V3")
    assert v3["method"] == "direct"
    assert v3["k"] == pytest.approx(1.0)
    assert v3["sp_months"] == 1
    assert v3["sp_months_incomplete"] == ["2023-04"]
    assert v3["satellites_observed_sp"] == ["N20", "N21", "SNPP"]
    assert v3["celldays_modis"] == 4 and v3["celldays_viirs"] == 4
    assert v3["satellites_observed"] == ["N20", "N21", "SNPP"]


def test_only_incomplete_months_fall_back():
    rows = v3_month_rows(date(2023, 4, 1), "ABCD", "AB", ["N20"])
    rows += v3_month_rows(date(2023, 5, 1), "ABCD", "ABCD", ["N20"])
    v3 = regime(calibrate.compute(make_con(rows)), "V3")
    assert v3["method"] == "direct_incomplete"
    assert v3["k"] == pytest.approx(8 / 6)
    assert v3["sp_months"] == 2
    assert v3["sp_months_incomplete"] == ["2023-04", "2023-05"]
    assert v3["satellites_observed_sp"] == ["N20"]


def test_require_all_satellites_false_uses_all_paired(monkeypatch):
    monkeypatch.setattr(config, "CALIBRATION_REQUIRE_ALL_SATELLITES", False)
    rows = v3_month_rows(date(2023, 4, 1), "ABCD", "AB", ["N20"])
    rows += v3_month_rows(date(2023, 5, 1), "ABCD", "ABCD", ["SNPP", "N20", "N21"])
    v3 = regime(calibrate.compute(make_con(rows)), "V3")
    assert v3["method"] == "direct"
    assert v3["sp_months"] == 2
    assert v3["k"] == pytest.approx(8 / 6)
    assert v3["sp_months_incomplete"] == ["2023-04"]


def test_unpaired_and_empty_months_not_counted():
    rows = v3_month_rows(date(2023, 4, 1), "ABCD", "ABCD", ["SNPP", "N20", "N21"])  # par
    rows += [row("A", date(2023, 5, 1), "MODIS", "Terra")]  # solo MODIS
    rows += [row("A", date(2023, 6, 1), "VIIRS", "N20")]  # solo VIIRS
    # 2023-07 y 2023-08 sin datos; 2023-09 vuelve a tener un par completo
    rows += v3_month_rows(date(2023, 9, 1), "AB", "AB", ["SNPP", "N20", "N21"])
    v3 = regime(calibrate.compute(make_con(rows)), "V3")
    assert v3["sp_months"] == 2
    assert v3["sp_months_incomplete"] == []
    assert v3["k"] == pytest.approx(1.0)
    assert v3["celldays_modis"] == 6


def test_calibration_months_helper():
    rows = v3_month_rows(date(2023, 4, 1), "ABCD", "AB", ["N20"])  # incompleto
    rows += v3_month_rows(date(2023, 5, 1), "ABCD", "ABCD", ["SNPP", "N20", "N21"])
    rows += [row("A", date(2023, 6, 1), "MODIS", "Terra")]
    rows += v3_month_rows(date(2019, 1, 1), "AB", "AB", ["SNPP", "N20"])  # V2 completo
    mo = calibrate.load_monthly(make_con(rows))
    assert calibrate.calibration_months(mo) == ["2019-01", "2023-05"]


# --- k por régimen y mes calendario (D-06) ---


def seasonal_rows(n_years=2):
    """V2 (SNPP+N20) completo, 2019-2020: MODIS = (mes calendario + 1) celdas, VIIRS = 1 celda x2."""
    rows = []
    for y in range(2019, 2019 + n_years):
        for mth in range(1, 13):
            d = date(y, mth, 1)
            rows += [row(f"m{i}", d, "MODIS", "Terra") for i in range(mth + 1)]
            rows += [row("v0", d, "VIIRS", "SNPP"), row("v1", d, "VIIRS", "N20")]
    return rows


def test_seasonal_k_recovers_each_calendar_month_ratio():
    cal = calibrate.compute(make_con(seasonal_rows()))
    assert cal["k_granularity"] == "regime_month"
    v2 = regime(cal, "V2")
    # ratio del mes calendario c (1..12) = (c + 1) / 2
    assert v2["k_by_month"] == [pytest.approx((c + 2) / 2) for c in range(12)]
    assert v2["k_by_month_n"] == [2] * 12
    # el k agrupado no cambia: Σ MODIS / Σ VIIRS
    assert v2["k"] == pytest.approx(sum(c + 2 for c in range(12)) / 24)
    assert v2["k"] != pytest.approx(v2["k_by_month"][0])
    assert calibrate.k_for(v2, "2020-03") == pytest.approx(2.0)


def test_calendar_month_below_minimum_is_null():
    rows = [r for r in seasonal_rows() if not (r[1].year == 2020 and r[1].month == 5)]
    v2 = regime(calibrate.compute(make_con(rows)), "V2")
    assert v2["k_by_month"][4] is None
    assert v2["k_by_month_n"][4] == 0
    assert v2["k_by_month_n"][0] == 2
    # cae al k del régimen
    assert calibrate.k_for(v2, "2020-05") == v2["k"]


def test_feature_flag_off_gives_regime_granularity(monkeypatch):
    monkeypatch.setattr(config, "CALIBRATION_K_BY_CALENDAR_MONTH", False)
    cal = calibrate.compute(make_con(seasonal_rows()))
    assert cal["k_granularity"] == "regime"
    v2 = regime(cal, "V2")
    assert v2["k_by_month"] == [None] * 12
    assert v2["k_by_month_n"] == [0] * 12
    assert v2["k"] is not None
    assert calibrate.k_for(v2, "2020-03") == v2["k"]


def test_method_none_has_all_null():
    v1 = regime(calibrate.compute(make_con(seasonal_rows())), "V1")
    assert v1["method"] == "none"
    assert v1["k_by_month"] == [None] * 12
    assert v1["k_by_month_n"] == [0] * 12


def test_drop_snpp_regime_gets_seasonal_k_from_previous_regime():
    # V3 (2023-03..) con SNPP+N20 (incompleto: espera N21). Dos eneros y dos febreros.
    rows = []
    for y in (2024, 2025):
        for mth, modis_n in ((1, 4), (2, 6)):
            d = date(y, mth, 1)
            rows += [row(f"m{i}", d, "MODIS", "Terra") for i in range(modis_n)]
            rows += [row("A", d, "VIIRS", "SNPP"), row("B", d, "VIIRS", "SNPP")]
            rows += [row("A", d, "VIIRS", "N20"), row("C", d, "VIIRS", "N20")]
    rows += [row("A", date(2026, 12, 1), "VIIRS", "N21", "NRT")]
    cal = calibrate.compute(make_con(rows))
    v4 = regime(cal, "V4")
    assert v4["method"] == "drop_snpp"
    # VIIRS sin SNPP: A y C = 2 celda-días por mes
    assert v4["k_by_month"][0] == pytest.approx(4 / 2)
    assert v4["k_by_month"][1] == pytest.approx(6 / 2)
    assert v4["k_by_month"][2] is None
    assert v4["k_by_month_n"][:3] == [2, 2, 0]
    assert v4["k"] == pytest.approx(5 / 2)


def test_k_for_fallbacks():
    assert calibrate.k_for({"k": 2.0, "k_by_month": [None] * 12}, "2020-03") == 2.0
    assert calibrate.k_for({"k": 2.0}, "2020-03") == 2.0  # artefacto sin k_by_month
    assert calibrate.k_for({"k": None, "k_by_month": [None] * 12}, "2020-03") is None
    by_month = [None] * 12
    by_month[2] = 3.0
    assert calibrate.k_for({"k": 2.0, "k_by_month": by_month}, "2021-03") == 3.0
    assert calibrate.k_for({"k": 2.0, "k_by_month": by_month}, "2021-04") == 2.0
