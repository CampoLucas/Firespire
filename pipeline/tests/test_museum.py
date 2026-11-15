"""Tests de museum (candidatos C1 y cruce C4) con datos sintéticos, sin red."""
import json
from datetime import date, datetime

import duckdb
import h3
import pytest

from firespire import museum

CD = (
    "CREATE TABLE cell_days (h3 VARCHAR, date DATE, family VARCHAR, satellite VARCHAR, "
    "product VARCHAR, n INTEGER)"
)
DET = (
    "CREATE TABLE detections_filtered (family VARCHAR, satellite VARCHAR, lat DOUBLE, "
    "lon DOUBLE, acq_date DATE, frp DOUBLE)"
)
SAT = {"MODIS": "Terra", "VIIRS": "N20"}
KM_DEG = 6371.0 * 3.141592653589793 / 180  # km por grado de latitud

CORDOBA = "Cordoba"
BA = "Buenos Aires"
C0 = h3.latlng_to_cell(-31.4, -64.2, 5)  # en Cordoba
C1 = h3.grid_ring(C0, 1)[0]
B0 = h3.latlng_to_cell(-34.6, -58.4, 5)  # en Buenos Aires


def box(w, s, e, n):
    return [[w, s], [e, s], [e, n], [w, n], [w, s]]


GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature", "properties": {"name": CORDOBA},
         "geometry": {"type": "Polygon", "coordinates": [box(-66, -33, -63, -30)]}},
        {"type": "Feature", "properties": {"name": BA},
         "geometry": {"type": "Polygon", "coordinates": [box(-60, -36, -57, -33)]}},
    ],
}


def make_cal(ks=(2.0, 2.5, 3.0, 3.5)):
    return {"regimes": [{"id": f"V{i + 1}", "k": k, "k_by_month": [None] * 12}
                        for i, k in enumerate(ks)]}


def new_con():
    con = duckdb.connect(":memory:")
    con.execute(CD)
    con.execute(DET)
    return con


def add(con, cell, d, fam, product="SP", lat=None, lon=None, frp=10.0):
    """Una celda-día y una detección cruda en esa celda (centro de celda salvo lat/lon)."""
    if lat is None:
        lat, lon = h3.cell_to_latlng(cell)
    con.execute("INSERT INTO cell_days VALUES (?, ?, ?, ?, ?, 1)", [cell, d, fam, SAT[fam], product])
    con.execute("INSERT INTO detections_filtered VALUES (?, ?, ?, ?, ?, ?)",
                [fam, SAT[fam], lat, lon, d, frp])


def fire(con, cells, year, month, first_day, n_days, fam, product="SP"):
    for c in cells:
        for i in range(n_days):
            add(con, c, date(year, month, first_day + i), fam, product)


def build_fixture():
    con = new_con()
    # Pre-2012 (solo MODIS): ene-2005 en Cordoba, 4 celda-días; otros eneros: 1
    fire(con, [C0], 2005, 1, 1, 4, "MODIS")
    fire(con, [C0], 2006, 1, 1, 1, "MODIS")
    fire(con, [C0], 2007, 1, 1, 1, "MODIS")
    # Ambos sensores, k V1 = 2: sep-2013 8+8 -> 16; sep-2014 y 2015: 3+3 -> 6
    for cells, y, n in (([C0, C1], 2013, 4), ([C0], 2014, 3), ([C0], 2015, 3)):
        fire(con, cells, y, 9, 1, n, "MODIS")
        fire(con, cells, y, 9, 1, n, "VIIRS")
    # Reciente, oct-2026 en Buenos Aires (V3, k 3): 2+2 -> 6, provisorio; octs previos: 1+1 -> 2
    fire(con, [B0], 2026, 10, 1, 2, "MODIS", "NRT")
    fire(con, [B0], 2026, 10, 1, 2, "VIIRS", "NRT")
    for y in (2014, 2015):
        fire(con, [B0], y, 10, 1, 1, "MODIS")
        fire(con, [B0], y, 10, 1, 1, "VIIRS")
    # Mar-2010 en Cordoba, grande pero sin ningun otro marzo con datos: sin mediana
    fire(con, [C0, C1], 2010, 3, 1, 5, "MODIS")
    return con


@pytest.fixture
def geojson(tmp_path):
    p = tmp_path / "prov.geojson"
    p.write_text(json.dumps(GEOJSON), encoding="utf-8")
    return p


# --- candidatos ---------------------------------------------------------------------
@pytest.fixture
def small_thresholds(monkeypatch):
    """La fixture es chica: se bajan los mínimos de tamaño y de años de línea base."""
    monkeypatch.setattr(museum.config, "MUSEUM_MIN_MONTH_CELLDAYS", 1)
    monkeypatch.setattr(museum.config, "MUSEUM_MIN_BASELINE_YEARS", 2)


def mo_for(months, fam="MODIS"):
    return museum.calibrate.Monthly(months=months, satellites={m: {fam: {SAT[fam]}} for m in months})


def test_components_split_by_adjacency():
    far = h3.grid_ring(C0, 4)[0]
    comps = museum._components({C0, C1, far})
    assert sorted(len(c) for c in comps) == [1, 2]


def test_peak_window_is_rolling_and_clipped_to_month():
    daily = {date(2020, 6, d): 1.0 for d in range(1, 31)}
    daily.update({date(2020, 6, d): 5.0 for d in range(14, 21)})  # ráfaga del 14 al 20
    assert museum._peak_window(daily, "2020-06") == (date(2020, 6, 14), date(2020, 6, 20))
    end = {date(2020, 6, d): 9.0 for d in (29, 30)}  # ráfaga pegada al fin de mes
    start, stop = museum._peak_window(end, "2020-06")
    assert start == date(2020, 6, 24) and stop == date(2020, 6, 30)
    assert museum._peak_window({}, "2020-06") is None


def test_episode_keeps_biggest_component_of_peak_window():
    big = [C0, C1, h3.grid_ring(C0, 1)[2]]  # conectadas
    far = h3.grid_ring(C0, 5)[0]
    d = [date(2010, 6, 10), date(2010, 6, 11)]
    nodes = {(c, x) for c in big for x in d} | {(far, d[0])}
    fams = {n: {"MODIS"} for n in nodes}
    # fuera de la ventana pico: un día suelto lejano del mes no cambia nada
    nodes.add((far, date(2010, 6, 28)))
    fams[(far, date(2010, 6, 28))] = {"MODIS"}
    ep = museum._find_episode(make_cal(), mo_for(["2010-06"]), "2010-06", nodes, fams)
    assert {h for h, _ in ep} == set(big) and len(ep) == 6


def test_episode_dates_are_first_and_last_in_window():
    nodes = {(C0, date(2010, 6, day)) for day in (3, 5, 20)}
    fams = {n: {"MODIS"} for n in nodes}
    ep = museum._find_episode(make_cal(), mo_for(["2010-06"]), "2010-06", nodes, fams)
    # la ventana de 7 días con más celda-días contiene los días 3 y 5 (empata con otras; gana la primera)
    assert sorted(d for _, d in ep) == [date(2010, 6, 3), date(2010, 6, 5)]


def test_candidates_episode_anomaly_order_and_fields(geojson, small_thresholds):
    con = build_fixture()
    cal = make_cal()
    out = museum.candidates(con, cal, top=3, geojson_path=geojson)
    assert len(out) == 3
    assert [c["anomaly"] for c in out] == sorted((c["anomaly"] for c in out), reverse=True)
    assert museum.candidates(con, cal, top=3, geojson_path=geojson) == out  # determinista
    first = out[0]  # ene-2005: 4 / mediana 1
    assert (first["province"], first["start"], first["end"]) == (CORDOBA, "2005-01-01", "2005-01-04")
    assert first["anomaly"] == 4.0 and first["episode_days"] == 4
    sep = next(c for c in out if c["month"] == "2013-09")
    assert (sep["start"], sep["end"]) == ("2013-09-01", "2013-09-04")
    assert sep["harmonized_celldays"] == 16.0
    assert sep["celldays_modis"] == sep["celldays_viirs"] == 8
    assert sep["regime"] == "V1" and sep["provisional"] is False
    assert sep["median"] == 6.0 and sep["anomaly"] == pytest.approx(16 / 6, abs=0.01)
    assert len(sep["footprint_h3"]) == 2
    recent = next(c for c in out if c["start"].startswith("2026"))
    assert recent["provisional"] is True and recent["regime"] == "V3"
    assert recent["harmonized_celldays"] == 6.0


def test_candidates_skips_province_month_without_median(geojson, small_thresholds):
    out = museum.candidates(build_fixture(), make_cal(), top=15, geojson_path=geojson)
    assert all(c["month"] != "2010-03" for c in out)


def test_min_month_size_filter():
    def it(v):
        return {"province": "A", "month": "2013-09", "value": v, "modis": 1, "viirs": 1,
                "median": 10.0, "anomaly": 2.0, "years": 6}

    kept = museum._pool([it(149.0), it(150.0)], top=15)
    assert [i["value"] for i in kept] == [150.0]


def test_min_baseline_years_filter():
    def series(n_other):
        s = {("A", f"{2000 + y}-09"): (10.0, 1, 0) for y in range(n_other)}
        s[("A", "2013-09")] = (30.0, 1, 0)
        return s

    assert not [i for i in museum._anomalies(series(4)) if i["month"] == "2013-09"]
    got = [i for i in museum._anomalies(series(5)) if i["month"] == "2013-09"]
    assert len(got) == 1 and got[0]["anomaly"] == 3.0 and got[0]["years"] == 5


def test_shortlist_orders_by_anomaly_then_size():
    def c(prov, start, anom, size):
        return {"province": prov, "start": start, "anomaly": anom, "province_month_celldays": size,
                "harmonized_celldays": 1, "diversity": []}

    items = [c("A", "2013-09-01", 2.0, 100), c("B", "2013-09-01", 3.0, 10),
             c("C", "2013-09-01", 2.0, 500)]
    assert [x["province"] for x in museum.shortlist(items, 3)] == ["B", "C", "A"]


def test_shortlist_province_cap_and_rules():
    def c(prov, start, h, tags):
        return {"province": prov, "start": start, "anomaly": float(h),
                "province_month_celldays": h, "harmonized_celldays": h, "diversity": tags}

    items = [c("A", f"2013-0{i}-01", 100 - i, [museum.TAG_BOTH]) for i in range(1, 6)]
    items.append(c("B", "2005-01-01", 1, [museum.TAG_PRE]))
    items.append(c("C", "2026-10-01", 1, [museum.TAG_RECENT]))
    out = museum.shortlist(items, top=5)
    assert sum(x["province"] == "A" for x in out) <= 2
    assert {"B", "C"} <= {x["province"] for x in out}
    assert museum.diversity_report(out) == {
        museum.TAG_PRE: True, museum.TAG_BOTH: True, museum.TAG_RECENT: True}


# --- cruce --------------------------------------------------------------------------
def event(**kw):
    ev = {"id": "ev-test", "title": "Test", "province": CORDOBA, "lat": -31.4, "lon": -64.2,
          "radius_km": 25, "start": "2010-06-10", "end": "2010-06-12"}
    ev.update(kw)
    return ev


def match_of(con, ev, cal=None):
    return museum.cross_match(con, cal or make_cal(), [ev])[ev["id"]]


def test_distance_filter_24_9_in_25_1_out():
    con = new_con()
    d = date(2010, 6, 11)
    add(con, C0, d, "MODIS", lat=-31.4 + 24.9 / KM_DEG, lon=-64.2)
    add(con, C1, d, "MODIS", lat=-31.4 + 25.1 / KM_DEG, lon=-64.2)
    m = match_of(con, event())
    assert m["detections"]["MODIS"] == 1


def test_window_padding():
    con = new_con()
    for day in (6, 7, 9, 15, 16):  # ventana 7 al 15 (3 días de margen)
        add(con, C0, date(2010, 6, day), "MODIS")
    m = match_of(con, event())
    assert m["window"] == {"start": "2010-06-07", "end": "2010-06-15"}
    assert m["detections"]["MODIS"] == 3
    assert m["first_detection"] == "2010-06-07" and m["last_detection"] == "2010-06-15"
    assert len(m["daily"]) == 9


def test_month_precision_uses_whole_month():
    con = new_con()
    add(con, C0, date(2010, 6, 1), "MODIS")
    add(con, C0, date(2010, 6, 30), "MODIS")
    m = match_of(con, event(start="2010-06-10", end="2010-06-12", date_precision="month"))
    assert m["window"] == {"start": "2010-05-29", "end": "2010-07-03"}
    assert m["detections"]["MODIS"] == 2


@pytest.mark.parametrize(("n_days", "verdict"), [(0, "none"), (1, "weak"), (4, "weak"),
                                                (5, "overlap"), (7, "overlap")])
def test_verdict_thresholds(n_days, verdict):
    con = new_con()
    add(con, C1, date(2010, 1, 1), "MODIS")  # el mes 2010-06 necesita datos en el dataset
    add(con, C0, date(2010, 6, 1), "MODIS", lat=-10.0, lon=-50.0)  # fuera del AOI
    for i in range(n_days):
        add(con, C0, date(2010, 6, 8 + i), "MODIS")
    m = match_of(con, event())
    assert m["verdict"] == verdict
    assert m["celldays"]["harmonized"] == (float(n_days) if n_days else 0.0)


def test_harmonized_uses_k_of_event_month_regime():
    con = new_con()
    add(con, C0, date(2019, 5, 10), "VIIRS")  # V2
    add(con, C0, date(2023, 5, 10), "VIIRS")  # V3
    cal = make_cal()
    v2 = match_of(con, event(id="a", start="2019-05-10", end="2019-05-10"), cal)
    v3 = match_of(con, event(id="b", start="2023-05-10", end="2023-05-10"), cal)
    assert (v2["regime"], v2["k"], v2["celldays"]["harmonized"]) == ("V2", 2.5, 2.5)
    assert (v3["regime"], v3["k"], v3["celldays"]["harmonized"]) == ("V3", 3.0, 3.0)
    assert v2["celldays"]["VIIRS"] == 1 and v2["detections"]["by_satellite"] == {"N20": 1}


def test_no_data_month_is_not_zero():
    con = new_con()
    add(con, C0, date(2024, 1, 1), "VIIRS")  # existe el mes 2024-01, pero no 2025-03
    add(con, C0, date(2026, 1, 1), "VIIRS")
    m = match_of(con, event(start="2025-03-10", end="2025-03-12"))
    assert m["no_data_months"] == ["2025-03"]
    assert m["celldays"]["harmonized"] is None
    assert all(d["harmonized"] is None for d in m["daily"])


def test_context_median_and_anomaly():
    con = new_con()
    for y, n in ((2008, 2), (2009, 4), (2010, 12)):  # junio en el AOI
        for i in range(n):
            add(con, C0, date(y, 6, 1 + i), "MODIS")
    m = match_of(con, event())
    ctx = m["context"]
    assert ctx["month"] == "2010-06" and ctx["years"] == 2
    assert ctx["median"] == 3.0 and ctx["value"] == 12.0
    assert ctx["anomaly"] == 300.0


def test_sample_capped_and_stratified(monkeypatch):
    monkeypatch.setattr(museum.config, "MUSEUM_MAX_POINTS", 10)
    con = new_con()
    for day in (10, 11, 12):
        for i in range(30):
            add(con, C0, date(2010, 6, day), "MODIS", lat=-31.4 + i * 1e-4, lon=-64.2)
    m = match_of(con, event())
    assert len(m["sample"]) <= 10
    assert {p["date"] for p in m["sample"]} == {"2010-06-10", "2010-06-11", "2010-06-12"}


def test_event_validation():
    con = new_con()
    with pytest.raises(ValueError):
        museum.cross_match(con, make_cal(), [event(radius_km=61)])
    with pytest.raises(ValueError):
        museum.cross_match(con, make_cal(), [event(start="2010-06-12", end="2010-06-10")])


def test_museum_json_shape(tmp_path):
    con = new_con()
    for i in range(6):
        add(con, C0, date(2010, 6, 8 + i), "MODIS")
    path = museum.build_museum_artifact(con, make_cal(), [event()], tmp_path, "vtest")
    assert path == tmp_path / "vtest" / "museum.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["schema"] == 1 and doc["version"] == "vtest"
    assert datetime.fromisoformat(doc["generated_at"]).utcoffset() is not None
    assert set(doc["params"]) == {"window_pad_days", "min_celldays", "max_points"}
    ev = doc["events"][0]
    assert ev["id"] == "ev-test"
    assert {"verdict", "window", "regime", "k", "provisional", "no_data_months", "detections",
            "celldays", "max_frp", "first_detection", "last_detection", "daily", "context",
            "footprint_h3", "sample"} <= set(ev["match"])
    assert ev["match"]["verdict"] == "overlap"
    assert set(ev["match"]["sample"][0]) == {"lat", "lon", "date", "family", "frp"}
    assert set(ev["match"]["daily"][0]) == {"date", "modis", "viirs", "harmonized"}
    assert set(ev["match"]["context"]) == {"month", "value", "median", "years", "anomaly"}


def test_maybe_build_skips_without_events_file(tmp_path):
    con = new_con()
    assert museum.maybe_build(con, make_cal(), tmp_path, "v", tmp_path / "missing.json") is None
    assert not (tmp_path / "v").exists()
