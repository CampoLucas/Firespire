"""Tests de export.write con DuckDB en memoria y un geojson de provincias de fixture."""
import json
from datetime import date

import duckdb
import h3
import numpy as np

from firespire import calibrate, export, validate

CREATE = (
    "CREATE TABLE cell_days (h3 VARCHAR, date DATE, family VARCHAR, satellite VARCHAR, "
    "product VARCHAR, n INTEGER)"
)

BA = h3.latlng_to_cell(-34.6, -58.4, 5)
CBA = h3.latlng_to_cell(-31.4, -64.2, 5)
SEA = h3.latlng_to_cell(0.0, -30.0, 5)  # fuera de toda provincia de fixture


def box(w, s, e, n):
    return [[w, s], [e, s], [e, n], [w, n], [w, s]]


GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {  # a proposito en orden no alfabetico
            "type": "Feature",
            "properties": {"name": "Cordoba"},
            "geometry": {"type": "MultiPolygon", "coordinates": [[box(-66, -33, -63, -30)]]},
        },
        {
            "type": "Feature",
            "properties": {"name": "Buenos Aires"},
            "geometry": {"type": "Polygon", "coordinates": [box(-60, -36, -57, -33)]},
        },
    ],
}

NO_PROV_WARNING = "Province boundaries file not found; no cell was assigned to a province."


def fixture_con(with_masked=True):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    rows = [
        # BA: 2019-01 MODIS dos dias, focos 70000 + 5 + 3 (tope uint16)
        (BA, date(2019, 1, 1), "MODIS", "Terra", "SP", 70000),
        (BA, date(2019, 1, 2), "MODIS", "Aqua", "SP", 5),
        (BA, date(2019, 1, 2), "MODIS", "Terra", "SP", 3),  # mismo dia: una sola celda-dia
        (BA, date(2019, 1, 2), "VIIRS", "SNPP", "SP", 7),
        # CBA: VIIRS en 2019-03 (febrero queda vacio, rango contiguo)
        (CBA, date(2019, 3, 10), "VIIRS", "SNPP", "SP", 4),
        (CBA, date(2019, 3, 11), "VIIRS", "N20", "SP", 6),
        (SEA, date(2019, 3, 1), "MODIS", "Terra", "SP", 1),
    ]
    con.executemany("INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, ?)", rows)
    if with_masked:
        con.execute("CREATE TABLE masked_cells (h3 VARCHAR)")
        con.execute("INSERT INTO masked_cells VALUES ('x'), ('y')")
    return con


def run(tmp_path, con, geo=True, version="vt"):
    gp = tmp_path / "prov.geojson"
    if geo:
        gp.write_text(json.dumps(GEOJSON), encoding="utf-8")
    out = tmp_path / "out"
    cal, val = calibrate.compute(con), validate.compute(con)
    vdir = export.write(con, cal, val, out, version, geojson_path=gp)
    return out, vdir


def load(vdir, name):
    return json.loads((vdir / name).read_text(encoding="utf-8"))


def block(vdir, meta, name):
    b = next(b for b in meta["monthly"]["blocks"] if b["name"] == name)
    dtype = np.uint8 if b["dtype"] == "uint8" else np.dtype("<u2")
    raw = (vdir / "monthly.bin").read_bytes()
    arr = np.frombuffer(raw, dtype=dtype, count=b["length"], offset=b["offset"])
    return arr.reshape(meta["n_cells"], meta["n_months"])


def test_file_set_and_latest(tmp_path):
    out, vdir = run(tmp_path, fixture_con())
    assert vdir == out / "vt"
    assert sorted(p.name for p in vdir.iterdir()) == [
        "calibration.json", "cells.json", "meta.json", "monthly.bin", "validation.json",
    ]
    assert json.loads((out / "latest.json").read_text()) == {"version": "vt"}
    assert " " not in (out / "latest.json").read_text()  # JSON compacto


def test_meta_and_monthly_roundtrip(tmp_path):
    _, vdir = run(tmp_path, fixture_con())
    meta, cells = load(vdir, "meta.json"), load(vdir, "cells.json")
    assert meta["schema"] == 1 and meta["version"] == "vt" and meta["h3_res"] == 5
    assert meta["first_month"] == "2019-01" and meta["n_months"] == 3
    assert meta["first_provisional_month"] is None
    assert meta["n_cells"] == 3 == len(cells["h3"])
    assert cells["h3"] == sorted(cells["h3"])
    assert meta["filters"]["mask"]["masked_cells"] == 2
    assert meta["satellites"] == {"MODIS": ["Aqua", "Terra"], "VIIRS": ["N20", "SNPP"]}
    assert meta["generated_at"][-6] in "+-"  # offset explicito
    # febrero no tiene filas de ninguna familia: hueco de cobertura
    assert meta["months_without_data"] == {"MODIS": ["2019-02"], "VIIRS": ["2019-02"]}
    assert any("No MODIS data for 1 of 3 months (2019-02)" in w for w in meta["warnings"])
    assert export._ranges(["2025-01", "2025-02", "2025-03", "2025-07"]) == (
        "2025-01 to 2025-03, 2025-07"
    )
    assert (vdir / "monthly.bin").stat().st_size == 3 * 3 * 6
    names = [b["name"] for b in meta["monthly"]["blocks"]]
    assert names == ["celldays_modis", "celldays_viirs", "hotspots_modis", "hotspots_viirs"]
    assert [b["offset"] for b in meta["monthly"]["blocks"]] == [0, 9, 18, 36]
    assert all(b["length"] == 9 for b in meta["monthly"]["blocks"])

    ba, cba = cells["h3"].index(BA), cells["h3"].index(CBA)
    cdm = block(vdir, meta, "celldays_modis")
    cdv = block(vdir, meta, "celldays_viirs")
    hsm = block(vdir, meta, "hotspots_modis")
    hsv = block(vdir, meta, "hotspots_viirs")
    assert cdm[ba].tolist() == [2, 0, 0]  # Terra+Aqua el mismo dia cuenta una vez
    assert hsm[ba, 0] == 65535  # 70000 + 5 + 3 con tope
    assert cdv[ba].tolist() == [1, 0, 0] and hsv[ba, 0] == 7
    assert cdv[cba].tolist() == [0, 0, 2] and hsv[cba, 2] == 10
    assert cdm[cba].sum() == 0


def test_uint16_below_limit_and_no_masked_table(tmp_path):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    con.execute(
        f"INSERT INTO cell_days VALUES ('{BA}', DATE '2019-01-01', 'VIIRS', 'N20', 'SP', 300)"
    )
    _, vdir = run(tmp_path, con)
    meta = load(vdir, "meta.json")
    assert block(vdir, meta, "hotspots_viirs")[0, 0] == 300
    assert meta["filters"]["mask"]["masked_cells"] == 0  # sin tabla masked_cells
    assert any("No MODIS data" in w for w in meta["warnings"])


def test_provinces_assigned(tmp_path):
    _, vdir = run(tmp_path, fixture_con())
    cells = load(vdir, "cells.json")
    assert cells["provinces"] == ["Buenos Aires", "Cordoba"]
    prov = dict(zip(cells["h3"], cells["prov"], strict=True))
    assert prov[BA] == 0 and prov[CBA] == 1 and prov[SEA] == -1
    assert NO_PROV_WARNING not in load(vdir, "meta.json")["warnings"]


def test_missing_geojson_warns(tmp_path):
    _, vdir = run(tmp_path, fixture_con(), geo=False)
    cells, meta = load(vdir, "cells.json"), load(vdir, "meta.json")
    assert cells["provinces"] == [] and set(cells["prov"]) == {-1}
    assert NO_PROV_WARNING in meta["warnings"]


def test_coverage_warnings_and_provisional(tmp_path):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    con.executemany(
        "INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, ?)",
        [
            (BA, date(2019, 1, 1), "MODIS", "Terra", "SP", 1),
            (BA, date(2019, 1, 1), "VIIRS", "N20", "SP", 1),
            (BA, date(2019, 2, 1), "VIIRS", "N20", "NRT", 1),
        ],
    )
    _, vdir = run(tmp_path, con)
    meta = load(vdir, "meta.json")
    assert meta["first_provisional_month"] == "2019-02"
    assert any("Regime V2 expects satellite SNPP" in w for w in meta["warnings"])
    assert not any("no k estimate" in w for w in meta["warnings"])  # V2 tiene k directo


def test_regime_without_k_warns(tmp_path):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    con.execute(
        f"INSERT INTO cell_days VALUES ('{BA}', DATE '2019-01-01', 'MODIS', 'Terra', 'SP', 1)"
    )
    _, vdir = run(tmp_path, con)
    meta = load(vdir, "meta.json")
    assert any("Regime V2" in w and "no k estimate" in w for w in meta["warnings"])
    assert any("No VIIRS data at all" in w for w in meta["warnings"])
    assert load(vdir, "calibration.json")["regimes"][1]["k"] is None
    raw = (vdir / "calibration.json").read_text()
    assert "NaN" not in raw and "null" in raw


def test_direct_incomplete_and_skipped_months_warn(tmp_path):
    con = duckdb.connect(":memory:")
    con.execute(CREATE)
    # V2 (espera SNPP + N20): 2019-01 solo N20 (incompleto); no hay meses completos.
    con.executemany(
        "INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, ?)",
        [
            (BA, date(2019, 1, 1), "MODIS", "Terra", "SP", 1),
            (BA, date(2019, 1, 1), "VIIRS", "N20", "SP", 1),
        ],
    )
    _, vdir = run(tmp_path, con)
    warns = load(vdir, "meta.json")["warnings"]
    assert any("Regime V2" in w and "missing SNPP" in w and "provisional" in w for w in warns)
    # con un mes completo ademas, el incompleto se saltea y se avisa
    con.executemany(
        "INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, ?)",
        [
            (BA, date(2019, 2, 1), "MODIS", "Terra", "SP", 1),
            (BA, date(2019, 2, 1), "VIIRS", "N20", "SP", 1),
            (BA, date(2019, 2, 1), "VIIRS", "SNPP", "SP", 1),
        ],
    )
    _, vdir = run(tmp_path, con, version="v2")
    warns = load(vdir, "meta.json")["warnings"]
    assert any("Regime V2 k skips 1 standard-product" in w for w in warns)
    assert not any("provisional and biased" in w for w in warns)
