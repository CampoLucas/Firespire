import duckdb
import h3

from firespire import celldays, config

COLS = """family VARCHAR, satellite VARCHAR, lat DOUBLE, lon DOUBLE, acq_date DATE,
    acq_time VARCHAR, confidence_raw VARCHAR, confidence_class TINYINT, type TINYINT,
    frp DOUBLE, daynight VARCHAR, product VARCHAR"""


def make(rows):
    """rows: (family, satellite, lat, lon, date, product)."""
    con = duckdb.connect()
    con.execute(f"CREATE TABLE detections_filtered ({COLS})")
    for family, sat, lat, lon, d, prod in rows:
        con.execute(
            "INSERT INTO detections_filtered VALUES (?, ?, ?, ?, ?, '0000', '85', 2, 0, 1, 'D', ?)",
            [family, sat, lat, lon, d, prod],
        )
    return con


def test_assign_cells():
    con = make([
        ("MODIS", "Terra", -30.0, -60.0, "2023-01-01", "SP"),
        ("VIIRS", "N20", -30.0, -60.0, "2023-01-01", "SP"),
        ("VIIRS", "N20", -35.5, -64.2, "2023-01-02", "SP"),
    ])
    celldays.assign_cells(con)
    rows = con.execute("SELECT lat, lon, h3 FROM det_cells").fetchall()
    assert len(rows) == 3
    for lat, lon, cell in rows:
        assert cell == h3.latlng_to_cell(lat, lon, config.H3_RES)


def test_build_groups_by_satellite_and_excludes_masked():
    con = make([
        ("VIIRS", "N20", -30.0, -60.0, "2023-01-01", "SP"),
        ("VIIRS", "N20", -30.0, -60.0, "2023-01-01", "SP"),
        ("VIIRS", "SNPP", -30.0, -60.0, "2023-01-01", "SP"),  # otro satélite, misma celda/día
        ("VIIRS", "N20", -30.0, -60.0, "2023-01-01", "NRT"),  # otro producto
        ("MODIS", "Terra", -30.0, -60.0, "2023-01-01", "SP"),
        ("MODIS", "Terra", -40.0, -65.0, "2023-01-01", "SP"),  # celda enmascarada
    ])
    celldays.assign_cells(con)
    masked = h3.latlng_to_cell(-40.0, -65.0, config.H3_RES)
    con.execute("CREATE TABLE masked_cells (h3 VARCHAR)")
    con.execute("INSERT INTO masked_cells VALUES (?)", [masked])
    celldays.build(con)
    rows = con.execute(
        "SELECT family, satellite, product, n FROM cell_days ORDER BY family, satellite, product"
    ).fetchall()
    assert rows == [
        ("MODIS", "Terra", "SP", 1),
        ("VIIRS", "N20", "NRT", 1),
        ("VIIRS", "N20", "SP", 2),
        ("VIIRS", "SNPP", "SP", 1),
    ]
    assert con.execute("SELECT count(*) FROM cell_days WHERE h3 = ?", [masked]).fetchone()[0] == 0
