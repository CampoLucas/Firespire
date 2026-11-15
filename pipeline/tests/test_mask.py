from datetime import date, timedelta

import duckdb

from firespire import config, mask


def make(n_days, hot_days, family_alt=False):
    """Celda 'hot' con detección en `hot_days` días; celda 'cold' solo el primer y último día."""
    con = duckdb.connect()
    con.execute("CREATE TABLE det_cells (acq_date DATE, family VARCHAR, h3 VARCHAR)")
    d0 = date(2023, 1, 1)
    for i in range(hot_days):
        fam = "MODIS" if family_alt and i % 2 else "VIIRS"  # cualquier familia cuenta
        con.execute("INSERT INTO det_cells VALUES (?, ?, 'hot')", [d0 + timedelta(i), fam])
    for i in (0, n_days - 1):
        con.execute("INSERT INTO det_cells VALUES (?, 'VIIRS', 'cold')", [d0 + timedelta(i)])
    return con


def masked(con):
    mask.build(con)
    return {r[0] for r in con.execute("SELECT h3 FROM masked_cells").fetchall()}


def test_masks_persistent_cell():
    n = config.MASK_MIN_DAYS
    hot = int(n * config.MASK_FRACTION) + 1  # más de la fracción
    con = make(n, hot)
    # el último día lo aporta 'cold', así el rango es exactamente n días
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
    con = make(n, n)  # detecta todos los días, pero el rango es corto
    assert masked(con) == set()
