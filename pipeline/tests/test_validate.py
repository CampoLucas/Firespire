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


def test_holdout_uses_only_calibration_months():
    rows = []
    # 30 meses V2 (2019-01..2021-06): los de 2019 solo con N20 (incompletos, V2 espera SNPP+N20),
    # los demás con SNPP+N20 (completos). Solo los completos entran al holdout.
    for y, m in months(2019, 30):
        sats = ["N20"] if y == 2019 else ["SNPP", "N20"]
        for sat in sats:
            add_month(rows, y, m, 20 if sat == sats[0] else 0, 10, sat=sat)
    h = validate.compute(make_con(rows))["holdout"]
    # 18 meses completos < 24: el holdout se saltea y cuenta solo los de calibración
    assert h["status"] == "skipped"
    assert "(18 found)" in h["reason"]


def test_holdout_k_per_regime_single_regime():
    # 30 meses V2: k de test = k de los 18 meses de entrenamiento, no de otro conjunto.
    rows = []
    for y, m in months(2019, 18):
        add_month(rows, y, m, 20, 10)  # k = 2
    for i in range(12):
        add_month(rows, 2020 + (6 + i) // 12, (6 + i) % 12 + 1, 30, 10)  # test: k real 3
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "ok"
    assert h["k_train"] == pytest.approx(2.0)
    assert h["k_train_by_regime"] == {"V2": pytest.approx(2.0)}
    assert h["train_months_by_regime"] == {"V2": 18}
    assert h["train"] == {"from": "2019-01", "to": "2020-06"}
    assert h["test"] == {"from": "2020-07", "to": "2021-06"}
    assert h["bias_total"] == pytest.approx(-1 / 3)


def test_holdout_two_regimes_constant_ratio_has_zero_error():
    # V2 con k=4 (18 meses antes del test + 6 en el test) y V3 con k=1 (6 en el test + 18 antes).
    rows = []
    # V2: 2019-01..2021-06 (30 meses) con k=4: MODIS 40 / VIIRS 10 (SNPP 5 + N20 5).
    for y, m in months(2019, 30):
        add_month(rows, y, m, 40, 5, sat="SNPP")
        add_month(rows, y, m, 0, 5, sat="N20", viirs_start=5)
    # V3: 2023-03..2025-02 (24 meses) con k=1: MODIS 30 / VIIRS 30 (3 satélites x 10).
    for i in range(24):
        y, m = 2023 + (2 + i) // 12, (2 + i) % 12 + 1
        add_month(rows, y, m, 30, 10, sat="SNPP")
        add_month(rows, y, m, 0, 10, sat="N20", viirs_start=10)
        add_month(rows, y, m, 0, 10, sat="N21", viirs_start=20)
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "ok"
    # Solo V3 cae en los últimos 12; un k único mezclado con V2 (k=4) daría otra cosa.
    assert h["k_train"] == pytest.approx(1.0)
    assert h["k_train_by_regime"] == {"V3": pytest.approx(1.0)}
    assert h["train_months_by_regime"] == {"V3": 12}
    assert h["mape_monthly"] == pytest.approx(0.0)
    assert h["bias_total"] == pytest.approx(0.0)


def test_holdout_mixed_regimes_each_with_own_k():
    rows = []
    # V2: 2021-01..2022-12 (24 meses) k=4. V3: 2023-03..2023-12 (10 meses) k=1.
    for y, m in months(2021, 24):
        add_month(rows, y, m, 40, 5, sat="SNPP")
        add_month(rows, y, m, 0, 5, sat="N20", viirs_start=5)
    for i in range(10):
        add_month(rows, 2023, 3 + i, 30, 10, sat="SNPP")
        add_month(rows, 2023, 3 + i, 0, 10, sat="N20", viirs_start=10)
        add_month(rows, 2023, 3 + i, 0, 10, sat="N21", viirs_start=20)
    # Calibración = 34 meses; test = últimos 12 = 2 de V2 (2022-11, 2022-12) + 10 de V3.
    # V3 se queda con 0 meses de entrenamiento (< 12): se excluye y V2 se prueba sola.
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "ok"
    assert "V3" in h["reason"]
    assert "excluded" in h["reason"]
    assert h["test"] == {"from": "2022-11", "to": "2022-12"}
    assert h["k_train_by_regime"] == {"V2": pytest.approx(4.0)}
    assert h["train_months_by_regime"] == {"V2": 22}
    assert h["mape_monthly"] == pytest.approx(0.0)
    assert len(h["series"]) == 2


def test_holdout_skipped_when_no_regime_trainable():
    rows = []
    # 12 meses de V2 + 12 de V3: el test (últimos 12) es todo V3 y V3 no tiene meses de entrenamiento.
    for y, m in months(2022, 12):  # V2 2022-01..2022-12
        add_month(rows, y, m, 40, 5, sat="SNPP")
        add_month(rows, y, m, 0, 5, sat="N20", viirs_start=5)
    for i in range(12):  # V3 2023-03..2024-02
        y, m = 2023 + (2 + i) // 12, (2 + i) % 12 + 1
        add_month(rows, y, m, 30, 10, sat="SNPP")
        add_month(rows, y, m, 0, 10, sat="N20", viirs_start=10)
        add_month(rows, y, m, 0, 10, sat="N21", viirs_start=20)
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "skipped"
    assert "V3" in h["reason"]


def test_holdout_seasonal_k_beats_single_k():
    # V2, 36 meses (2019-01..2021-12) con cociente estacional: k = 1 + mes calendario / 6.
    # Test = últimos 12 (2021); entrenamiento = 2019-2020 (2 meses por mes calendario).
    rows = []
    for y, m in months(2019, 36):
        add_month(rows, y, m, 10 * (6 + m), 60, sat="SNPP")  # MODIS 10*(6+m) / VIIRS 60
    h = validate.compute(make_con(rows))["holdout"]
    assert h["status"] == "ok"
    assert h["k_granularity"] == "regime_month"
    assert h["mape_monthly"] == pytest.approx(0.0, abs=1e-9)
    assert h["bias_total"] == pytest.approx(0.0, abs=1e-9)
    assert h["mape_monthly_single_k"] > 0.1
    assert abs(h["bias_total_single_k"]) < 0.05  # el sesgo total casi se cancela; el error es mensual
    ks = h["k_train_by_regime_month"]["V2"]
    assert len(ks) == 12
    assert ks[0] == pytest.approx(7 / 6)
    assert ks[11] == pytest.approx(18 / 6)
    assert h["series"][0]["harmonized"] == pytest.approx(h["series"][0]["modis"])


def test_holdout_single_k_when_flag_off(monkeypatch):
    from firespire import config

    monkeypatch.setattr(config, "CALIBRATION_K_BY_CALENDAR_MONTH", False)
    rows = []
    for y, m in months(2019, 36):
        add_month(rows, y, m, 10 * (6 + m), 60, sat="SNPP")
    h = validate.compute(make_con(rows))["holdout"]
    assert h["k_granularity"] == "regime"
    assert h["k_train_by_regime_month"] == {"V2": [None] * 12}
    assert h["mape_monthly"] == pytest.approx(h["mape_monthly_single_k"])


def test_holdout_falls_back_to_regime_k_for_sparse_calendar_months():
    # 18 meses de entrenamiento: jul-dic tienen 1 solo mes -> null -> k del régimen en el test.
    rows = []
    for y, m in months(2019, 18):
        add_month(rows, y, m, 20, 10)
    for i in range(12):
        add_month(rows, 2020 + (6 + i) // 12, (6 + i) % 12 + 1, 30, 10)
    h = validate.compute(make_con(rows))["holdout"]
    ks = h["k_train_by_regime_month"]["V2"]
    assert ks[:6] == [pytest.approx(2.0)] * 6
    assert ks[6:] == [None] * 6
    assert h["mape_monthly"] == pytest.approx(h["mape_monthly_single_k"])
