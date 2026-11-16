"""Preprocesa CSV anuales de NASA FIRMS (MODIS + VIIRS) para el Globo de quemas.

Uso:  python -I prep.py <carpeta_csv> [<carpeta_csv> ...]
Busca archivos modis_YYYY_Argentina.csv y viirs-*_YYYY_Argentina.csv en las carpetas,
asigna cada foco a una provincia (fuentes/provincias_ign.json) y escribe:
  web/public/globe/data/data-YYYY.js   celdas de 0,1° por día/instrumento/día-noche/confianza/provincia
  web/public/globe/data/years.js       lista de años disponibles
  web/public/globe/data/provincias.js  nombres, bbox y contornos simplificados
"""
import sys, os, re, json, glob
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "web", "public", "globe", "data")
os.makedirs(OUT, exist_ok=True)
STEP = 0.1


def dp(pts, tol):
    """Douglas-Peucker iterativo sobre un array (n,2)."""
    n = len(pts)
    if n < 3:
        return pts
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[a + 1:b]
        p, q = pts[a], pts[b]
        d = q - p
        L = np.hypot(*d)
        if L == 0:
            dist = np.hypot(*(seg - p).T)
        else:
            dist = np.abs(d[0] * (seg[:, 1] - p[1]) - d[1] * (seg[:, 0] - p[0])) / L
        i = int(np.argmax(dist))
        if dist[i] > tol:
            m = a + 1 + i
            keep[m] = True
            stack += [(a, m), (m, b)]
    return pts[keep]


def area(r):
    x, y = r[:, 0], r[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def pip(px, py, ring):
    """Ray casting vectorizado: puntos dentro de un anillo."""
    inside = np.zeros(len(px), bool)
    x1, y1 = ring[:-1, 0], ring[:-1, 1]
    x2, y2 = ring[1:, 0], ring[1:, 1]
    for i in range(len(x1)):
        c = (y1[i] > py) != (y2[i] > py)
        if not c.any():
            continue
        xi = x1[i] + (py[c] - y1[i]) * (x2[i] - x1[i]) / (y2[i] - y1[i])
        idx = np.nonzero(c)[0]
        inside[idx[px[c] < xi]] ^= True
    return inside


# ---------- Provincias ----------
gj = json.load(open(os.path.join(HERE, "fuentes", "provincias_ign.json"), encoding="utf8"))
provs = []
for f in gj["features"]:
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    fine, coarse = [], []
    for poly in polys:
        rings_f, rings_c = [], []
        for k, r in enumerate(poly):
            r = np.asarray(r, float)[:, :2]
            if k == 0 and area(r) < 0.002:  # islotes diminutos
                break
            rf, rc = dp(r, 0.008), dp(r, 0.03)
            if len(rf) >= 4:
                rings_f.append(rf)
            if len(rc) >= 4:
                rings_c.append(rc)
        if rings_f:
            fine.append(rings_f)
        if rings_c:
            coarse.append(rings_c)
    allp = np.vstack([r for p in coarse for r in p])
    provs.append({
        "name": f["properties"]["nam"],
        "fine": fine,
        # solo territorio continental + islas cercanas para el bbox (excluye Antártida)
        "coarse": coarse,
    })

# bbox para encuadre: ignorar latitudes antárticas
for p in provs:
    pts = np.vstack([r for poly in p["coarse"] for r in poly])
    pts = pts[pts[:, 1] > -56]
    p["bbox"] = [round(float(v), 3) for v in (pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max())]

order = sorted(range(len(provs)), key=lambda i: provs[i]["name"])
provs = [provs[i] for i in order]
with open(os.path.join(OUT, "provincias.js"), "w", encoding="utf8") as fh:
    fh.write("window.PROVINCIAS=" + json.dumps([
        {"name": p["name"], "bbox": p["bbox"],
         "geo": {"type": "MultiPolygon",
                 "coordinates": [[np.round(r, 3).tolist() for r in poly] for poly in p["coarse"]]}}
        for p in provs], ensure_ascii=False, separators=(",", ":")) + ";")


def assign(lat, lon):
    out = np.full(len(lat), -1, np.int16)
    for pi, p in enumerate(provs):
        for poly in p["fine"]:
            outer = poly[0]
            m = ((lon >= outer[:, 0].min()) & (lon <= outer[:, 0].max()) &
                 (lat >= outer[:, 1].min()) & (lat <= outer[:, 1].max()) & (out < 0))
            if not m.any():
                continue
            idx = np.nonzero(m)[0]
            ins = pip(lon[idx], lat[idx], outer)
            for hole in poly[1:]:
                ins &= ~pip(lon[idx], lat[idx], hole)
            out[idx[ins]] = pi
    # focos sobre el borde/costa que quedaron afuera por la simplificación: provincia más cercana por centroide de celda vecina
    miss = np.nonzero(out < 0)[0]
    if len(miss):
        ok = np.nonzero(out >= 0)[0]
        if len(ok):
            from_pts = np.c_[lat[ok], lon[ok]]
            for j in miss:
                d = np.abs(from_pts - [lat[j], lon[j]]).sum(1)
                k = int(np.argmin(d))
                if d[k] < 0.3:
                    out[j] = out[ok[k]]
    return out


# ---------- Años ----------
files = {}
for folder in sys.argv[1:]:
    for path in glob.glob(os.path.join(folder, "*_Argentina.csv")):
        m = re.match(r"(modis|viirs[-\w]*)_(\d{4})_Argentina\.csv$", os.path.basename(path))
        if m:
            files.setdefault(int(m.group(2)), {})["modis" if m.group(1) == "modis" else "viirs"] = path

years = []
for y in sorted(files):
    parts = []
    for kind, path in files[y].items():
        d = pd.read_csv(path)
        if kind == "modis":
            d["inst"] = 0
            d["conf"] = np.where(d.confidence >= 80, 2, np.where(d.confidence >= 30, 1, 0))
        else:
            d["inst"] = 1
            d["conf"] = d.confidence.map({"l": 0, "n": 1, "h": 2})
        parts.append(d[["latitude", "longitude", "acq_date", "daynight", "frp", "inst", "conf"]])
    df = pd.concat(parts, ignore_index=True)
    df["day"] = (pd.to_datetime(df.acq_date) - pd.Timestamp(f"{y}-01-01")).dt.days
    df["dn"] = (df.daynight == "D").astype(int)
    df["iy"] = np.floor((df.latitude + 90) / STEP).astype(int)
    df["ix"] = np.floor((df.longitude + 180) / STEP).astype(int)
    df["prov"] = assign(df.latitude.values, df.longitude.values)
    g = (df.groupby(["day", "inst", "dn", "conf", "prov", "iy", "ix"])
           .agg(n=("frp", "size"), f=("frp", "sum")).reset_index())
    g["f"] = g.f.round(1)
    cols = {k: g[k].tolist() for k in ["day", "inst", "dn", "conf", "prov", "iy", "ix", "n", "f"]}
    with open(os.path.join(OUT, f"data-{y}.js"), "w") as fh:
        fh.write(f"(window.FOCOS=window.FOCOS||{{}})[{y}]=" +
                 json.dumps({"step": STEP, "inst": sorted(files[y]), "cols": cols}, separators=(",", ":")) + ";")
    sin = int((df.prov < 0).sum())
    print(f"{y}: {len(df)} focos, {len(g)} celdas-día, sin provincia {sin}, instrumentos {sorted(files[y])}")
    years.append(y)

with open(os.path.join(OUT, "years.js"), "w") as fh:
    fh.write("window.YEARS=" + json.dumps(years) + ";")
print("años:", years)
