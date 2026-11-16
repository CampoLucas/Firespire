from datetime import date, timedelta

import duckdb

from firespire import config, mask


def make(n_days, hot_days, family_alt=False, gap=0):
    """Celda 'hot' con detección en `hot_days` días; celdas de fondo distintas cada día con datos.

    `gap` agrega días sin ningún dato en el medio (huecos de cobertura).
    """
    con = duckdb.connect()
    con.execute("CREATE TABLE det_cells (acq_date DATE, family VARCHAR, h3 VARCHAR)")
    d0 = date(2023, 1, 1)
    days = [d0 + timedelta(i if i < n_days // 2 else i + gap) for i in range(n_days)]
    for i in range(hot_days):
        fam = "MODIS" if family_alt and i % 2 else "VIIRS"  # cualquier familia cuenta
        con.execute("INSERT INTO det_cells VALUES (?, ?, 'hot')", [days[i], fam])
    for i, d in enumerate(days):
        con.execute("INSERT INTO det_cells VALUES (?, 'VIIRS', ?)", [d, f"bg{i}"])
    return con


def masked(con):
    mask.build(con)
    return {r[0] for r in con.execute("SELECT h3 FROM masked_cells").fetchall()}


def test_masks_persistent_cell():
    n = config.MASK_MIN_DAYS
    con = make(n, int(n * config.MASK_FRACTION) + 1)  # más de la fracción
    assert masked(con) == {"hot"}


def test_fraction_is_strict():
    n = 100
    con = make(n, int(n * config.MASK_FRACTION))  # exactamente la fracción: no se enmascara
    assert masked(con) == set()


def test_any_family_counts():
    n = config.MASK_MIN_DAYS
    con = make(n, int(n * config.MASK_FRACTION) + 2, family_alt=True)
    assert masked(con) == {"hot"}


def test_short_range_masks_nothing():
    n = config.MASK_MIN_DAYS - 1
    con = make(n, n)  # detecta todos los días, pero hay pocos días con datos
    assert masked(con) == set()


def test_coverage_gap_does_not_dilute():
    # 100 días con datos y un hueco de 500 días sin CSV: 'hot' está en 60 de los 100
    con = make(100, 60, gap=500)
    assert masked(con) == {"hot"}
