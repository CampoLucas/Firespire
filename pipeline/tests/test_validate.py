"""Tests de validate.compute con cell_days sintetica."""
from datetime import date

import duckdb
import pytest

from firespire import validate

CREATE = (
    "CREATE TABLE cell_days (h3 VARCHAR, date DATE, family VARCHAR, satellite VARCHAR, "
    "product VARCHAR, n INTEGER)"
)


def add_month(rows, y, m, modis_cells, viirs_cells, sat="N20", product="SP", viirs_start=0):
    d = date(y, m, 1)
    rows += [(f"c{i}", d, "MODIS", "Terra", product, 1) for i in range(modis_cells)]
    rows += [
        (f"c{i}", d, "VIIRS", sat, product, 1)
        for i in range(viirs_start, viirs_start + viirs_cells)
    ]


def make_con(rows):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    con.executemany("INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, ?)", rows)
    return con


def months(start_y, n):
    for i in range(n):
        yield start_y + i // 12, i % 12 + 1


def test_holdout_ok():
    rows = []
    for y, m in months(2019, 30):
        add_month(rows, y, m, 20, 10)
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "ok"
    assert h["train"] == {"from": "2019-01", "to": "2020-06"}
    assert h["test"] == {"from": "2020-07", "to": "2021-06"}
    assert h["k_train"] == pytest.approx(2.0)
    assert h["mape_monthly"] == pytest.approx(0.0)
    assert h["bias_total"] == pytest.approx(0.0)
    assert len(h["series"]) == 12
    assert h["series"][0] == {"month": "2020-07", "modis": 20, "viirs": 10, "harmonized": 20.0}


def test_holdout_bias_and_mape():
    rows = []
    for y, m in months(2019, 24):
        add_month(rows, y, m, 20, 10)  # k de entrenamiento = 2
    rows = [r for r in rows if r[1] < date(2020, 1, 1)]
    for y, m in months(2020, 12):
        add_month(rows, y, m, 10, 10)  # en test, MODIS = 10 -> armonizado 20: error 100 %
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "ok"
    assert h["mape_monthly"] == pytest.approx(1.0)
    assert h["bias_total"] == pytest.approx(1.0)


def test_holdout_skipped_with_few_months():
    rows = []
    for y, m in months(2019, 10):
        add_month(rows, y, m, 20, 10)
    v = validate.compute(make_con(rows))
    assert v["holdout"]["status"] == "skipped"
    assert "Fewer than 24" in v["holdout"]["reason"]
    assert "series" not in v["holdout"]


def test_snpp_drop_skipped_without_snpp():
    rows = []
    for y, m in months(2024, 18):
        add_month(rows, y, m, 20, 10)
    s = validate.compute(make_con(rows))["snpp_drop"]
    assert s["status"] == "skipped"
    assert "S-NPP" in s["reason"]


def test_snpp_drop_ok():
    rows = []
    # Regimen V3 con SNPP (celdas c0-c9) y N20 (c5-c14): VIIRS total 15, sin SNPP 10, MODIS 20.
    add_month(rows, 2024, 1, 20, 10, sat="SNPP")
    add_month(rows, 2024, 1, 0, 10, sat="N20", viirs_start=5)
    # 2025-01 provisorio, sin SNPP: MODIS 20, VIIRS (N20) 10.
    add_month(rows, 2025, 1, 20, 10, sat="N20", product="NRT")
    s = validate.compute(make_con(rows))["snpp_drop"]
    assert s["status"] == "ok"
    assert s["train"] == {"from": "2024-01", "to": "2024-01"}
    assert s["test"] == {"from": "2025-01", "to": "2025-01"}
    assert s["k_train"] == pytest.approx(2.0)  # 20 / 10
    assert s["mape_monthly"] == pytest.approx(0.0)
    assert s["k_with_snpp"] == pytest.approx(20 / 15)
    # con el k viejo (20/15) y todo el VIIRS (10) el armonizado queda en 13.33 vs 20
    assert s["bias_total_with_snpp_k"] == pytest.approx((10 * 20 / 15 - 20) / 20)
