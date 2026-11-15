"""Datos del globo (web/public/globe/data/data-YYYY.js) a partir de CSV de FIRMS.

Mismo formato que prep.py (columnas day, inst, dn, conf, prov, iy, ix, n, f en celdas de 0,1°),
pero asigna provincias con pipeline/resources/provincias.geojson, así que no necesita
fuentes/provincias_ign.json. Uso: `firespire globe ../fuentes/nrt`.

Como prep.py, no filtra `type` ni confianza: el globo filtra confianza en el navegador.
A diferencia de prep.py, suma todos los satélites VIIRS del año (prep.py se quedaba con uno).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from . import config
from .ingest import discover

GLOBE_DATA = config.REPO_ROOT / "web" / "public" / "globe" / "data"
STEP = 0.1
NEAREST_MAX_DEG = 0.3  # igual que prep.py: focos de borde/costa a la provincia más cercana


def province_names(data_dir: Path = GLOBE_DATA) -> list[str]:
    """Orden de provincias de provincias.js: el índice `prov` del globo se refiere a esta lista."""
    text = (data_dir / "provincias.js").read_text(encoding="utf8").strip()
    text = text.removeprefix("window.PROVINCIAS=").removesuffix(";")
    return [p["name"] for p in json.loads(text)]


def assign_provinces(lat: np.ndarray, lon: np.ndarray, names: list[str],
                     geojson: Path = config.PROVINCES_GEOJSON) -> np.ndarray:
    import shapely
    from shapely.geometry import shape
    from shapely.validation import make_valid

    feats = {f["properties"]["name"]: make_valid(shape(f["geometry"]))
             for f in json.loads(geojson.read_text(encoding="utf8"))["features"]}
    missing = set(names) - set(feats)
    if missing:
        raise ValueError(f"Provincias de provincias.js sin geometría en {geojson.name}: {missing}")
    geoms = [feats[n] for n in names]
    tree = shapely.STRtree(geoms)
    pts = shapely.points(lon, lat)
    out = np.full(len(pts), -1, np.int16)
    pi, gi = tree.query(pts, predicate="within")
    out[pi] = gi  # si cae en dos (bordes), queda la última; es indistinto a esta escala
    miss = np.nonzero(out < 0)[0]
    if len(miss):
        (inp, gi), dist = tree.query_nearest(pts[miss], return_distance=True, all_matches=False)
        ok = dist <= NEAREST_MAX_DEG
        out[miss[inp[ok]]] = gi[ok]
    return out


def _read(path: Path, family: str) -> pd.DataFrame:
    d = pd.read_csv(path, dtype={"confidence": str})
    if family == config.MODIS:
        c = pd.to_numeric(d.confidence, errors="coerce")
        d["inst"], d["conf"] = 0, np.where(c >= 80, 2, np.where(c >= 30, 1, 0))
    else:
        d["inst"], d["conf"] = 1, d.confidence.map({"l": 0, "n": 1, "h": 2}).fillna(0)
    return d[["latitude", "longitude", "acq_date", "daynight", "frp", "inst", "conf"]]


def build_year(paths: list[tuple[Path, str]], year: int, names: list[str]) -> tuple[dict, dict]:
    df = pd.concat([_read(p, fam) for p, fam in paths], ignore_index=True)
    df["day"] = (pd.to_datetime(df.acq_date) - pd.Timestamp(f"{year}-01-01")).dt.days
    df["dn"] = (df.daynight == "D").astype(int)
    df["iy"] = np.floor((df.latitude + 90) / STEP).astype(int)
    df["ix"] = np.floor((df.longitude + 180) / STEP).astype(int)
    df["prov"] = assign_provinces(df.latitude.to_numpy(float), df.longitude.to_numpy(float), names)
    df["conf"] = df.conf.astype(int)
    g = (df.groupby(["day", "inst", "dn", "conf", "prov", "iy", "ix"])
           .agg(n=("frp", "size"), f=("frp", "sum")).reset_index())
    g["f"] = g.f.round(1)
    cols = {k: g[k].tolist() for k in ["day", "inst", "dn", "conf", "prov", "iy", "ix", "n", "f"]}
    inst = sorted({"modis" if fam == config.MODIS else "viirs" for _, fam in paths})
    stats = {"focos": len(df), "celdas_dia": len(g), "sin_provincia": int((df.prov < 0).sum()),
             "desde": str(df.acq_date.min()), "hasta": str(df.acq_date.max())}
    return {"step": STEP, "inst": inst, "cols": cols}, stats


def write_years_js(data_dir: Path) -> list[int]:
    """years.js con todos los data-YYYY.js presentes (no solo los recién generados)."""
    years = sorted(int(m[1]) for p in data_dir.glob("data-*.js")
                   if (m := re.fullmatch(r"data-(\d{4})\.js", p.name)))
    (data_dir / "years.js").write_text("window.YEARS=" + json.dumps(years) + ";", encoding="utf8")
    return years


def run(folders: list[Path], data_dir: Path = GLOBE_DATA, only: list[int] | None = None) -> None:
    names = province_names(data_dir)
    by_year: dict[int, list[tuple[Path, str]]] = {}
    for f in discover(folders):
        by_year.setdefault(f.year, []).append((f.path, f.family))
    for year in sorted(by_year):
        if only and year not in only:
            continue
        obj, st = build_year(by_year[year], year, names)
        js = f"(window.FOCOS=window.FOCOS||{{}})[{year}]=" + json.dumps(obj, separators=(",", ":")) + ";"
        (data_dir / f"data-{year}.js").write_text(js, encoding="utf8")
        print(f"{year}: {st['focos']} focos ({st['desde']} a {st['hasta']}), "
              f"{st['celdas_dia']} celdas-día, sin provincia {st['sin_provincia']}, inst {obj['inst']}")
    print("años en years.js:", write_years_js(data_dir))
