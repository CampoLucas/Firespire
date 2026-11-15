"""Descarga NRT reciente de la API de FIRMS (endpoint de área) a CSV con nombres que entiende ingest.

`firespire fetch --days 30` baja los últimos 30 días de cada fuente NRT para Argentina y
escribe `fuentes/nrt/modis_YYYY_Argentina.csv` y `viirs-<clave>_YYYY_Argentina.csv`.
La MAP_KEY se lee de `FIRMS_MAP_KEY` o de `web/.env.local`, y nunca se imprime.
"""
from __future__ import annotations

import io
import os
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from . import config

BASE = "https://firms.modaps.eosdis.nasa.gov"
COUNTRY_NAME = "Argentina"
AREA_BBOX = "-74,-56,-53,-21"  # oeste,sur,este,norte: Argentina continental e islas
DEFAULT_OUT = config.REPO_ROOT / "fuentes" / "nrt"
ENV_FILE = config.REPO_ROOT / "web" / ".env.local"
CHUNK_DAYS = 5  # tope seguro de DAY_RANGE por pedido

# Fuente FIRMS -> prefijo de archivo que reconoce ingest.discover
SOURCES = {
    "MODIS_NRT": "modis",
    "VIIRS_SNPP_NRT": "viirs-snpp",
    "VIIRS_NOAA20_NRT": "viirs-jpss1",
    "VIIRS_NOAA21_NRT": "viirs-jpss2",
}


class FirmsError(RuntimeError):
    pass


def load_key() -> str:
    """MAP_KEY desde el entorno o desde web/.env.local."""
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key and ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "FIRMS_MAP_KEY":
                key = value.strip().strip('"').strip("'")
    if not key:
        raise FirmsError(f"Falta FIRMS_MAP_KEY (variable de entorno o {ENV_FILE})")
    return key


def _get(url: str, key: str, retries: int = 3) -> str:
    """GET con reintentos; los mensajes de error no muestran la clave."""
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                text = r.read().decode("utf8")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == retries - 1:
                raise FirmsError(f"{url.replace(key, '***')}: {e}") from None
            time.sleep(5 * (attempt + 1))
            continue
        head = text.lstrip()[:200].lower()
        if head.startswith("invalid") or "error" in head.split("\n", 1)[0]:
            raise FirmsError(f"{url.replace(key, '***')}: {text.strip()[:200]}")
        return text
    raise AssertionError("inalcanzable")


def key_status(key: str) -> dict:
    import json

    return json.loads(_get(f"{BASE}/mapserver/mapkey_status/?MAP_KEY={key}", key))


def availability(key: str) -> dict[str, tuple[date, date]]:
    """Rango de fechas disponible por fuente (min_date, max_date)."""
    df = pd.read_csv(io.StringIO(_get(f"{BASE}/api/data_availability/csv/{key}/all", key)))
    return {
        row.data_id: (date.fromisoformat(row.min_date), date.fromisoformat(row.max_date))
        for row in df.itertuples()
    }


def chunks(start: date, end: date, size: int = CHUNK_DAYS) -> list[tuple[date, int]]:
    """Parte [start, end] en pedidos (fecha inicial, DAY_RANGE) de hasta `size` días."""
    out = []
    d = start
    while d <= end:
        n = min(size, (end - d).days + 1)
        out.append((d, n))
        d += timedelta(days=n)
    return out


def country_shape(path: Path = config.PROVINCES_GEOJSON, buffer_deg: float = 0.05):
    """Unión de provincias con un margen chico (los contornos están simplificados)."""
    import json

    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    feats = json.loads(path.read_text(encoding="utf8"))["features"]
    return unary_union([make_valid(shape(f["geometry"])) for f in feats]).buffer(buffer_deg)


def clip(df: pd.DataFrame, geom) -> pd.DataFrame:
    """Deja solo los focos dentro de `geom`."""
    import shapely

    pts = shapely.points(df.longitude.astype(float), df.latitude.astype(float))
    return df[shapely.contains(geom, pts)]


def fetch_source(key: str, source: str, start: date, end: date, geom) -> pd.DataFrame:
    # El endpoint de país responde "Invalid API call" (verificado 2026-11-14): se usa el de
    # área con el recuadro de Argentina continental y se recorta con los límites provinciales.
    parts = []
    for d, n in chunks(start, end):
        url = f"{BASE}/api/area/csv/{key}/{source}/{AREA_BBOX}/{n}/{d.isoformat()}"
        df = pd.read_csv(io.StringIO(_get(url, key)), dtype=str)
        kept = clip(df, geom) if len(df) else df
        print(f"  {source} {d} +{n}d: {len(df)} filas en el recuadro, {len(kept)} en Argentina")
        if len(kept):
            parts.append(kept)
    if not parts:
        return pd.DataFrame()
    return pd.concat(parts, ignore_index=True).drop_duplicates()


def output_name(source: str, year: int) -> str:
    return f"{SOURCES[source]}_{year}_{COUNTRY_NAME}.csv"


def window(
    avail: dict[str, tuple[date, date]], sources: list[str], days: int,
    start: date | None, end: date | None,
) -> tuple[date, date]:
    """Ventana común a todas las fuentes, para que los meses sean comparables entre sensores.

    Fin: `end` o la última fecha disponible entre las fuentes. Inicio: `start` o fin - days + 1.
    """
    last = end or max(avail[s][1] for s in sources if s in avail)
    first = start or last - timedelta(days=days - 1)
    if first > last:
        raise FirmsError(f"Ventana vacía: {first} > {last}")
    return first, last


def run(
    days: int, end: date | None, out: Path, sources: list[str], start: date | None = None,
) -> list[Path]:
    key = load_key()
    st = key_status(key)
    print(
        f"map key: {st.get('current_transactions')}/{st.get('transaction_limit')} "
        f"transacciones en {st.get('transaction_interval')}"
    )
    avail = availability(key)
    w_first, w_last = window(avail, sources, days, start, end)
    print(f"ventana común: {w_first} a {w_last}")
    geom = country_shape()
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for source in sources:
        if source not in avail:
            print(f"{source}: sin datos disponibles, se omite")
            continue
        lo, hi = avail[source]
        first, last = max(w_first, lo), min(w_last, hi)
        if first > last:
            print(f"{source}: fuera de rango ({lo} a {hi}), se omite")
            continue
        print(f"{source}: {first} a {last} (disponible {lo} a {hi})")
        df = fetch_source(key, source, first, last, geom)
        if df.empty:
            continue
        years = pd.to_datetime(df["acq_date"]).dt.year
        for y, g in df.groupby(years):
            path = out / output_name(source, int(y))
            g.to_csv(path, index=False)
            written.append(path)
            print(f"  -> {path.name}: {len(g)} filas, {g.acq_date.min()} a {g.acq_date.max()}")
    return written
