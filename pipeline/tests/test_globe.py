"""Tests de los datos del globo: formato compatible con prep.py e index.html."""
import json
import re

import numpy as np

from firespire import globe

MODIS = "latitude,longitude,acq_date,daynight,frp,confidence\n"
VIIRS = MODIS


def load_js(path):
    m = re.fullmatch(r"\(window\.FOCOS=window\.FOCOS\|\|\{\}\)\[(\d{4})\]=(.*);", path.read_text())
    return int(m[1]), json.loads(m[2])


def test_province_order_matches_provincias_js():
    names = globe.province_names()
    lat = np.array([-31.42, -34.60, -33.45])
    lon = np.array([-64.18, -58.38, -70.66])  # Córdoba, CABA, Santiago de Chile
    prov = globe.assign_provinces(lat, lon, names)
    assert names[prov[0]] == "Córdoba"
    assert names[prov[1]] == "Ciudad Autónoma de Buenos Aires"
    assert prov[2] == -1  # lejos de Argentina: sin provincia


def test_build_year_format_and_aggregation(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    # dos focos MODIS en la misma celda/día se suman; VIIRS de dos satélites entra igual
    (src / "modis_2026_Argentina.csv").write_text(
        MODIS + "-31.421,-64.181,2026-09-01,D,10.0,85\n-31.422,-64.182,2026-09-01,D,5.5,90\n"
    )
    (src / "viirs-jpss1_2026_Argentina.csv").write_text(VIIRS + "-31.42,-64.18,2026-09-02,N,3.0,n\n")
    (src / "viirs-jpss2_2026_Argentina.csv").write_text(VIIRS + "-31.42,-64.18,2026-09-02,N,1.0,l\n")
    data = tmp_path / "data"
    data.mkdir()
    (data / "provincias.js").write_text(
        (globe.GLOBE_DATA / "provincias.js").read_text(encoding="utf8"), encoding="utf8"
    )
    (data / "data-2024.js").write_text("x")  # año existente: tiene que quedar en years.js
    globe.run([src], data_dir=data)

    year, obj = load_js(data / "data-2026.js")
    assert year == 2026 and obj["step"] == 0.1 and obj["inst"] == ["modis", "viirs"]
    c = obj["cols"]
    assert set(c) == {"day", "inst", "dn", "conf", "prov", "iy", "ix", "n", "f"}
    assert c["day"] == sorted(c["day"])  # index.html indexa por día
    rows = list(zip(c["day"], c["inst"], c["dn"], c["conf"], c["n"], c["f"], strict=True))
    assert (243, 0, 1, 2, 2, 15.5) in rows  # 1/9 = día 243 del año
    assert (244, 1, 0, 0, 1, 1.0) in rows and (244, 1, 0, 1, 1, 3.0) in rows
    names = globe.province_names(data)
    assert {names[p] for p in c["prov"]} == {"Córdoba"}
    assert (data / "years.js").read_text() == "window.YEARS=[2024, 2026];"
