import duckdb

from firespire import filters

COLS = """family VARCHAR, satellite VARCHAR, lat DOUBLE, lon DOUBLE, acq_date DATE,
    acq_time VARCHAR, confidence_raw VARCHAR, confidence_class TINYINT, type TINYINT,
    frp DOUBLE, daynight VARCHAR, product VARCHAR"""


def make(rows):
    """rows: (family, confidence_raw, type, tag) -> tag viaja en `satellite`."""
    con = duckdb.connect()
    con.execute(f"CREATE TABLE detections ({COLS})")
    for family, conf, typ, tag in rows:
        con.execute(
            "INSERT INTO detections VALUES (?, ?, 0, 0, '2023-01-01', '0000', ?, 0, ?, 1, 'D', 'SP')",
            [family, tag, conf, typ],
        )
    return con


def kept(con):
    filters.apply(con)
    return {r[0] for r in con.execute("SELECT satellite FROM detections_filtered").fetchall()}


def test_modis_rules():
    con = make([
        ("MODIS", "85", 0, "ok_hi"),
        ("MODIS", "30", 0, "ok_edge"),
        ("MODIS", "29", 0, "low"),
        ("MODIS", "85", 2, "static"),
        ("MODIS", "85", None, "no_type"),
    ])
    assert kept(con) == {"ok_hi", "ok_edge"}


def test_viirs_rules():
    con = make([
        ("VIIRS", "h", 0, "ok_h"),
        ("VIIRS", "n", 0, "ok_n"),
        ("VIIRS", "l", 0, "low"),
        ("VIIRS", "n", 3, "sea"),
        ("VIIRS", "n", None, "ok_no_type"),
        ("VIIRS", "l", None, "low_no_type"),
    ])
    assert kept(con) == {"ok_h", "ok_n", "ok_no_type"}
