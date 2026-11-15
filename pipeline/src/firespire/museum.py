"""Museo de incendios: candidatos desde los datos (C1) y cruce con FIRMS (C4).

Diseño: docs/arquitechture-decitions/04_DISCOVERY_AND_CAUSE_ENGINE.md; esquema de museum.json en
05_DATA_CONTRACTS_AND_UI_INTEGRATION.md. El método de armonización es el de calibration.json:
MODIS antes de HARMONIZED_START, y desde ahí k(mes) × celda-días VIIRS (calibrate.k_for sobre la
entrada del régimen de ese mes). Un solape con FIRMS nunca es atribución.
"""
from __future__ import annotations

import json
import math
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

import h3

from firespire import calibrate, config

EARTH_KM = 6371.0
TAG_PRE = "modis_only_pre2012"  # episodio anterior a HARMONIZED_START (solo MODIS)
TAG_BOTH = "both_sensors"  # desde HARMONIZED_START con MODIS y VIIRS observando
TAG_RECENT = "recent_2025_2026"
RECENT_YEARS = ("2025", "2026")
MAX_PER_PROVINCE = 2
POOL_PER_PROVINCE = 4  # provincia-mes por provincia que entran al pool de episodios


# --------------------------------------------------------------------------------------
# Helpers compartidos
# --------------------------------------------------------------------------------------
@lru_cache(maxsize=1_000_000)
def _cell(lat: float, lon: float) -> str:
    return h3.latlng_to_cell(lat, lon, config.H3_RES)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _regime_entry(cal: dict, month: str) -> dict | None:
    r = config.regime_for_month(month)
    if r is None:
        return None
    return next((e for e in cal["regimes"] if e["id"] == r.id), None)


def _k(cal: dict, month: str) -> float | None:
    """k de un mes 'YYYY-MM' (el mismo que calibration.json); None antes de HARMONIZED_START."""
    if month < config.HARMONIZED_START:
        return None
    entry = _regime_entry(cal, month)
    return None if entry is None else calibrate.k_for(entry, month)


def _month_value(cal: dict, mo: calibrate.Monthly, month: str, modis: float, viirs: float):
    """Celda-días armonizados de `month` dados los celda-días MODIS y VIIRS.

    None si el mes no tiene datos de la familia que manda (MODIS antes de HARMONIZED_START, VIIRS
    después) o si falta k: eso es "sin datos", no cero.
    """
    sats = mo.satellites.get(month, {})
    if month < config.HARMONIZED_START:
        return float(modis) if sats.get(config.MODIS) else None
    if not sats.get(config.VIIRS):
        return None
    k = _k(cal, month)
    return None if k is None else k * viirs


def _month_bounds(month: str) -> tuple[date, date]:
    """(primer día, primer día del mes siguiente) de 'YYYY-MM'."""
    d0 = date(int(month[:4]), int(month[5:7]), 1)
    d1 = date(d0.year + 1, 1, 1) if d0.month == 12 else date(d0.year, d0.month + 1, 1)
    return d0, d1


class _Provinces:
    """Celda H3 -> provincia (la que contiene el centro), con caché; usa la lógica de export.py."""

    def __init__(self, geojson_path: Path | None = None):
        self.path = geojson_path
        self.cache: dict[str, str | None] = {}

    def get(self, cells) -> dict[str, str | None]:
        from firespire import export

        missing = [c for c in cells if c not in self.cache]
        if missing:
            prov, names, _ = export._assign_provinces(missing, self.path)
            for c, p in zip(missing, prov, strict=True):
                self.cache[c] = names[p] if p >= 0 else None
        return {c: self.cache[c] for c in cells}


# --------------------------------------------------------------------------------------
# C1. Candidatos
# --------------------------------------------------------------------------------------
def _components(cells) -> list[set[str]]:
    """Componentes conexos de celdas H3 (adyacencia `grid_disk(celda, 1)`, solo espacial)."""
    cells = set(cells)
    seen: set[str] = set()
    out = []
    for c in sorted(cells):
        if c in seen:
            continue
        comp, stack = set(), [c]
        seen.add(c)
        while stack:
            x = stack.pop()
            comp.add(x)
            for nb in h3.grid_disk(x, 1):
                if nb in cells and nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
        out.append(comp)
    return out


def _peak_window(daily: dict[date, float], month: str) -> tuple[date, date] | None:
    """Ventana móvil de MUSEUM_EPISODE_DAYS días, recortada al mes, con más celda-días armonizados.

    `daily` = celda-días armonizados de la provincia por día. Empate: la ventana que empieza antes.
    """
    d0, d1 = _month_bounds(month)
    last = d1 - timedelta(days=1)
    n = config.MUSEUM_EPISODE_DAYS
    n_starts = max(1, (last - d0).days + 1 - n + 1)  # ventanas completas dentro del mes
    best, best_start = 0.0, None
    for i in range(n_starts):
        d = d0 + timedelta(days=i)
        tot = sum(daily.get(d + timedelta(days=j), 0.0) for j in range(n))
        if tot > best:
            best, best_start = tot, d
    if best_start is None:
        return None
    return best_start, min(best_start + timedelta(days=n - 1), last)


def _find_episode(cal, mo, month, prov_nodes: set, node_fams: dict) -> set | None:
    """Episodio de una provincia-mes: celda-días del componente espacial más fuerte de la
    ventana pico. `prov_nodes` = celda-días (h3, fecha) de la provincia en el mes."""
    per_day: dict[date, list[int]] = defaultdict(lambda: [0, 0])
    for n in prov_nodes:
        fams = node_fams[n]
        per_day[n[1]][0] += config.MODIS in fams
        per_day[n[1]][1] += config.VIIRS in fams
    daily = {d: (_month_value(cal, mo, month, m, v) or 0.0) for d, (m, v) in per_day.items()}
    win = _peak_window(daily, month)
    if win is None:
        return None
    in_win = {n for n in prov_nodes if win[0] <= n[1] <= win[1]}
    best, best_key = None, None
    for comp in _components({h for h, _ in in_win}):
        nodes = {n for n in in_win if n[0] in comp}
        m = sum(config.MODIS in node_fams[n] for n in nodes)
        v = sum(config.VIIRS in node_fams[n] for n in nodes)
        key = (_month_value(cal, mo, month, m, v) or 0.0, len(comp), min(comp))
        # mayor armonizado; empate: más celdas; empate: id de celda menor (determinista)
        if best_key is None or key[:2] > best_key[:2] or (key[:2] == best_key[:2] and key[2] < best_key[2]):
            best, best_key = nodes, key
    return best


def _tags(month: str, modis_cd: int, viirs_cd: int) -> list[str]:
    tags = []
    if month < config.HARMONIZED_START:
        tags.append(TAG_PRE)
    elif modis_cd > 0 and viirs_cd > 0:
        tags.append(TAG_BOTH)
    if month[:4] in RECENT_YEARS:
        tags.append(TAG_RECENT)
    return tags


def _order_key(c: dict):
    """Anomalía de la provincia-mes desc (sin anomalía al final), luego celda-días del mes."""
    return (-(c["anomaly"] or 0.0), -c["province_month_celldays"], c["province"], c["start"])


def shortlist(cands: list[dict], top: int) -> list[dict]:
    """Elige `top` candidatos con diversidad y máximo MAX_PER_PROVINCE por provincia.

    Reglas obligatorias (en este orden, las más escasas primero): uno anterior a HARMONIZED_START,
    uno de 2025-2026, uno con ambos sensores. Si una regla no tiene candidato posible queda sin
    cumplir (diversity_report lo informa). Después se completa por puntaje. Orden determinista.
    """
    ordered = sorted(cands, key=_order_key)
    chosen: list[dict] = []
    per_prov: dict[str, int] = defaultdict(int)

    def take(c: dict) -> bool:
        if len(chosen) >= top or per_prov[c["province"]] >= MAX_PER_PROVINCE:
            return False
        chosen.append(c)
        per_prov[c["province"]] += 1
        return True

    for rule in (TAG_PRE, TAG_RECENT, TAG_BOTH):
        if any(rule in c["diversity"] for c in chosen):
            continue
        for c in ordered:
            if rule in c["diversity"] and c not in chosen and take(c):
                break
    for c in ordered:
        if c not in chosen:
            take(c)
    return sorted(chosen, key=_order_key)


def diversity_report(items: list[dict]) -> dict[str, bool]:
    return {r: any(r in c["diversity"] for c in items) for r in (TAG_PRE, TAG_BOTH, TAG_RECENT)}


def _province_month_series(con, cal, mo, cell_prov: dict[str, str | None]) -> dict:
    """(provincia, 'YYYY-MM') -> (armonizado, celda-días MODIS, celda-días VIIRS), solo con datos."""
    acc: dict = defaultdict(lambda: {config.MODIS: 0, config.VIIRS: 0})
    for h, m, fam, n in con.execute(
        "SELECT h3, strftime(date, '%Y-%m'), family, count(DISTINCT date) "
        "FROM cell_days GROUP BY 1, 2, 3"
    ).fetchall():
        p = cell_prov.get(h)
        if p:
            acc[(p, m)][fam] += n
    provs = sorted({p for p in cell_prov.values() if p})
    out = {}
    for p in provs:
        for m in mo.months:
            c = acc.get((p, m), {config.MODIS: 0, config.VIIRS: 0})
            v = _month_value(cal, mo, m, c[config.MODIS], c[config.VIIRS])
            if v is not None:
                out[(p, m)] = (v, c[config.MODIS], c[config.VIIRS])
    return out


def _anomalies(series: dict) -> list[dict]:
    """Provincia-mes con mediana de los otros años (mismo mes calendario); sin mediana se omite."""
    by_cal: dict = defaultdict(dict)  # (prov, mes calendario) -> {año: valor}
    for (p, m), (v, _, _) in series.items():
        by_cal[(p, int(m[5:7]))][int(m[:4])] = v
    out = []
    for (p, m), (v, cm, cv) in series.items():
        year = int(m[:4])
        others = [x for y, x in by_cal[(p, int(m[5:7]))].items() if y != year]
        if not others:
            continue
        if len(others) < config.MUSEUM_MIN_BASELINE_YEARS:
            continue
        med = statistics.median(others)
        out.append(
            {"province": p, "month": m, "value": v, "modis": cm, "viirs": cv, "median": med,
             "anomaly": (v / med) if med > 0 else None, "years": len(others)}
        )
    return out


def _pool(items: list[dict], top: int) -> list[dict]:
    """Provincia-mes a los que se les calcula episodio, ordenados por anomalía (ratio vs mediana).

    Solo entran meses con >= MUSEUM_MIN_MONTH_CELLDAYS armonizados y anomalía definida (mediana
    > 0). Se toman los mejores en total, por categoría de diversidad y por provincia.
    """
    elig = sorted(
        (i for i in items
         if i["value"] >= config.MUSEUM_MIN_MONTH_CELLDAYS and i["anomaly"] is not None),
        key=lambda i: (-i["anomaly"], -i["value"], i["province"], i["month"]),
    )
    n_all, n_each = max(top * 4, 40), max(top, 10)
    keep = {(i["province"], i["month"]) for i in elig[:n_all]}
    preds = (
        lambda i: i["month"] < config.HARMONIZED_START,
        lambda i: i["month"][:4] in RECENT_YEARS,
        lambda i: i["month"] >= config.HARMONIZED_START and i["modis"] > 0 and i["viirs"] > 0,
    )
    for pred in preds:
        keep |= {(i["province"], i["month"]) for i in [x for x in elig if pred(x)][:n_each]}
    # Los mejores de cada provincia: con el tope por provincia, el top global puede concentrarse
    # en pocas provincias y dejar la lista corta.
    per_prov: dict[str, int] = defaultdict(int)
    for i in elig:
        if per_prov[i["province"]] < POOL_PER_PROVINCE:
            per_prov[i["province"]] += 1
            keep.add((i["province"], i["month"]))
    return [i for i in elig if (i["province"], i["month"]) in keep]


def _month_detections(con, month: str) -> dict:
    """(h3, fecha) -> filas (familia, satélite, lat, lon, frp) de detections_filtered del mes."""
    d0, d1 = _month_bounds(month)
    out: dict = defaultdict(list)
    for fam, sat, lat, lon, d, frp in con.execute(
        "SELECT family, satellite, lat, lon, acq_date, frp FROM detections_filtered "
        "WHERE acq_date >= ? AND acq_date < ? AND lat IS NOT NULL AND lon IS NOT NULL",
        [d0, d1],
    ).fetchall():
        out[(_cell(lat, lon), d)].append((fam, sat, lat, lon, frp))
    return out


def _episode_record(cal, mo, prov: _Provinces, item, nodes, node_fams, dets) -> dict | None:
    month, province = item["month"], item["province"]
    modis_cd = sum(config.MODIS in node_fams[n] for n in nodes)
    viirs_cd = sum(config.VIIRS in node_fams[n] for n in nodes)
    harmonized = _month_value(cal, mo, month, modis_cd, viirs_cd)
    if harmonized is None:
        return None
    days = sorted({d for _, d in nodes})
    daily = []
    for d in days:
        m_cd = sum(config.MODIS in node_fams[n] for n in nodes if n[1] == d)
        v_cd = sum(config.VIIRS in node_fams[n] for n in nodes if n[1] == d)
        daily.append((_month_value(cal, mo, month, m_cd, v_cd) or 0.0, d))
    peak = max(daily, key=lambda x: (x[0], -x[1].toordinal()))[1]
    rows = [r for n in sorted(nodes, key=lambda n: (n[1], n[0])) for r in dets.get(n, [])]
    if rows:
        lats, lons = [r[2] for r in rows], [r[3] for r in rows]
    else:  # sin detecciones crudas (no debería pasar): centros de celda
        pts = [h3.cell_to_latlng(h) for h, _ in nodes]
        lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    frps = [r[4] for r in rows if r[4] is not None]
    dets_by_sat: dict[str, int] = defaultdict(int)
    for r in rows:
        dets_by_sat[r[1]] += 1
    cells = sorted({h for h, _ in nodes})
    ring = {nb for h in cells for nb in h3.grid_disk(h, 1)}
    touched = {province} | {p for p in prov.get(sorted(ring)).values() if p}
    regime = config.regime_for_month(month)
    return {
        "province": province,
        "month": month,
        "start": days[0].isoformat(),
        "end": days[-1].isoformat(),
        "episode_days": (days[-1] - days[0]).days + 1,
        "peak_day": peak.isoformat(),
        "centroid": {"lat": round(sum(lats) / len(lats), 5), "lon": round(sum(lons) / len(lons), 5)},
        "bbox": {"min_lat": min(lats), "min_lon": min(lons), "max_lat": max(lats),
                 "max_lon": max(lons)},
        "provinces": [province] + sorted(touched - {province}),
        "footprint_h3": cells,
        "celldays_modis": modis_cd,
        "celldays_viirs": viirs_cd,
        "detections_modis": sum(r[0] == config.MODIS for r in rows),
        "detections_viirs": sum(r[0] == config.VIIRS for r in rows),
        "detections_by_satellite": dict(sorted(dets_by_sat.items())),
        "harmonized_celldays": round(harmonized, 2),
        "max_frp": max(frps) if frps else None,
        "regime": regime.id if regime else None,
        "provisional": month in mo.provisional,
        "province_month_celldays": round(item["value"], 2),
        "median": round(item["median"], 2),
        "anomaly": None if item["anomaly"] is None else round(item["anomaly"], 2),
        "diversity": _tags(month, modis_cd, viirs_cd),
    }


def candidates(con, cal: dict, top: int = 15, geojson_path: Path | None = None) -> list[dict]:
    """Episodios candidatos para el museo (C1), con diversidad. Orden determinista."""
    mo = calibrate.load_monthly(con)
    if not mo.months:
        return []
    prov = _Provinces(geojson_path)
    cells = [r[0] for r in con.execute("SELECT DISTINCT h3 FROM cell_days ORDER BY h3").fetchall()]
    cell_prov = prov.get(cells)
    items = _anomalies(_province_month_series(con, cal, mo, cell_prov))
    pool = _pool(items, top)
    by_month: dict[str, list[dict]] = defaultdict(list)
    for i in pool:
        by_month[i["month"]].append(i)
    out: list[dict] = []
    for month in sorted(by_month):
        d0, d1 = _month_bounds(month)
        node_fams: dict = defaultdict(set)
        by_prov: dict[str, set] = defaultdict(set)
        for h, d, fam in con.execute(
            "SELECT DISTINCT h3, date, family FROM cell_days WHERE date >= ? AND date < ?",
            [d0, d1],
        ).fetchall():
            p = cell_prov.get(h)
            if p:
                node_fams[(h, d)].add(fam)
                by_prov[p].add((h, d))
        dets = _month_detections(con, month)
        for item in by_month[month]:
            ep = _find_episode(cal, mo, month, by_prov.get(item["province"], set()), node_fams)
            if not ep:
                continue
            rec = _episode_record(cal, mo, prov, item, ep, node_fams, dets)
            if rec is not None:
                out.append(rec)
    return shortlist(out, top)


def write_candidates(items: list[dict], path: Path, top: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {"schema": 1, "generated_at": _now(), "top": top, "diversity": diversity_report(items),
           "candidates": items}
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    return path


# --------------------------------------------------------------------------------------
# C4. Cruce con FIRMS
# --------------------------------------------------------------------------------------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_KM * math.asin(min(1.0, math.sqrt(a)))


def _aoi_rows(con, lat, lon, radius_km, where="TRUE", params=()):
    """Filas de detections_filtered a ≤ radius_km de (lat, lon): (fam, sat, lat, lon, fecha, frp)."""
    dlat = radius_km / 110.0
    dlon = radius_km / (110.0 * max(math.cos(math.radians(lat)), 0.01))
    rows = con.execute(
        "SELECT family, satellite, lat, lon, acq_date, frp FROM detections_filtered "
        f"WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND {where}",
        [lat - dlat, lat + dlat, lon - dlon, lon + dlon, *params],
    ).fetchall()
    return [r for r in rows if haversine_km(lat, lon, r[2], r[3]) <= radius_km]


def _masked_cells(con) -> set[str]:
    try:
        return {r[0] for r in con.execute("SELECT h3 FROM masked_cells").fetchall()}
    except Exception:  # noqa: BLE001 - sin máscara (tests o corridas parciales)
        return set()


def _is_masked(masked: set[str], h: str) -> bool:
    if not masked:
        return False
    return (h if config.MASK_RES == config.H3_RES else h3.cell_to_parent(h, config.MASK_RES)) in masked


def _window(ev: dict) -> tuple[date, date, date, date]:
    """(inicio documentado, fin documentado, inicio de ventana, fin de ventana)."""
    s, e = date.fromisoformat(ev["start"]), date.fromisoformat(ev["end"])
    if ev.get("date_precision") == "month":
        s = s.replace(day=1)
        e = _month_bounds(f"{e:%Y-%m}")[1] - timedelta(days=1)
    pad = timedelta(days=config.MUSEUM_WINDOW_PAD_DAYS)
    return s, e, s - pad, e + pad


def _sample(rows: list[tuple], max_points: int) -> list[dict]:
    """Hasta max_points puntos, estratificados por día (cuota proporcional, mínimo 1 por día)."""
    by_day: dict[date, list[tuple]] = defaultdict(list)
    for r in sorted(rows, key=lambda r: (r[4], r[2], r[3], r[0])):
        by_day[r[4]].append(r)
    total = len(rows)
    if total <= max_points:
        picked = [r for d in sorted(by_day) for r in by_day[d]]
    else:
        quota = {d: min(len(v), max(1, max_points * len(v) // total)) for d, v in by_day.items()}
        while sum(quota.values()) > max_points:  # el mínimo 1 pudo pasarse del tope
            d = max(quota, key=lambda x: (quota[x], x))
            quota[d] -= 1
        picked = []
        for d in sorted(by_day):
            v, q = by_day[d], quota[d]
            picked += [v[i * len(v) // q] for i in range(q)] if q else []
    return [
        {"lat": round(r[2], 4), "lon": round(r[3], 4), "date": r[4].isoformat(), "family": r[0],
         "frp": None if r[5] is None else round(r[5], 1)}
        for r in picked
    ]


def _cell_days(rows) -> dict[str, set]:
    out = {config.MODIS: set(), config.VIIRS: set()}
    for fam, _, lat, lon, d, _ in rows:
        out[fam].add((_cell(lat, lon), d))
    return out


def _match(con, cal: dict, mo: calibrate.Monthly, masked: set[str], ev: dict) -> dict:
    lat, lon = float(ev["lat"]), float(ev["lon"])
    radius = float(ev.get("radius_km", config.MUSEUM_AOI_KM))
    s, _, w0, w1 = _window(ev)
    main_month = f"{s:%Y-%m}"
    rows = [
        r for r in _aoi_rows(con, lat, lon, radius, "acq_date BETWEEN ? AND ?", [w0, w1])
        if not _is_masked(masked, _cell(r[2], r[3]))
    ]
    cds = _cell_days(rows)
    days = [w0 + timedelta(days=i) for i in range((w1 - w0).days + 1)]
    cd_by_day = {fam: defaultdict(int) for fam in cds}
    for fam, nodes in cds.items():
        for _, d in nodes:
            cd_by_day[fam][d] += 1
    daily, total, any_value = [], 0.0, False
    for d in days:
        m_cd, v_cd = cd_by_day[config.MODIS][d], cd_by_day[config.VIIRS][d]
        h = _month_value(cal, mo, f"{d:%Y-%m}", m_cd, v_cd)
        if h is not None:
            total += h
            any_value = True
        daily.append({"date": d.isoformat(), "modis": m_cd, "viirs": v_cd,
                      "harmonized": None if h is None else round(h, 3)})
    window_months = sorted({f"{d:%Y-%m}" for d in days})
    frps = [r[5] for r in rows if r[5] is not None]
    dates = [r[4] for r in rows]
    by_sat: dict[str, int] = defaultdict(int)
    for r in rows:
        by_sat[r[1]] += 1
    if total >= config.MUSEUM_MIN_CELLDAYS:
        verdict = "overlap"
    elif total > 0:
        verdict = "weak"
    else:
        verdict = "none"
    regime = config.regime_for_month(main_month)
    return {
        "verdict": verdict,
        "window": {"start": w0.isoformat(), "end": w1.isoformat()},
        "regime": regime.id if regime else None,
        "k": _k(cal, main_month),
        "provisional": any(m in mo.provisional for m in window_months),
        "no_data_months": [m for m in window_months if _month_value(cal, mo, m, 0, 0) is None],
        "detections": {
            "MODIS": sum(r[0] == config.MODIS for r in rows),
            "VIIRS": sum(r[0] == config.VIIRS for r in rows),
            "by_satellite": dict(sorted(by_sat.items())),
        },
        "celldays": {
            "MODIS": len(cds[config.MODIS]),
            "VIIRS": len(cds[config.VIIRS]),
            "harmonized": round(total, 3) if any_value else None,
        },
        "max_frp": max(frps) if frps else None,
        "first_detection": min(dates).isoformat() if dates else None,
        "last_detection": max(dates).isoformat() if dates else None,
        "daily": daily,
        "context": _context(con, cal, mo, masked, lat, lon, radius, main_month),
        "footprint_h3": sorted({_cell(r[2], r[3]) for r in rows}),
        "sample": _sample(rows, config.MUSEUM_MAX_POINTS),
    }


def _context(con, cal, mo, masked, lat, lon, radius, main_month: str) -> dict:
    """Celda-días armonizados del AOI en el mismo mes calendario de los otros años."""
    cal_month = int(main_month[5:7])
    rows = [
        r for r in _aoi_rows(con, lat, lon, radius, "month(acq_date) = ?", [cal_month])
        if not _is_masked(masked, _cell(r[2], r[3]))
    ]
    per_year: dict[int, dict[str, set]] = defaultdict(lambda: {config.MODIS: set(), config.VIIRS: set()})
    for fam, _, la, lo, d, _ in rows:
        per_year[d.year][fam].add((_cell(la, lo), d))
    values: dict[int, float] = {}
    for y in sorted({int(m[:4]) for m in mo.months if int(m[5:7]) == cal_month}):
        c = per_year.get(y)
        m_cd = len(c[config.MODIS]) if c else 0
        v_cd = len(c[config.VIIRS]) if c else 0
        v = _month_value(cal, mo, f"{y}-{cal_month:02d}", m_cd, v_cd)
        if v is not None:
            values[y] = v
    own_year = int(main_month[:4])
    others = [v for y, v in values.items() if y != own_year]
    own = values.get(own_year)
    med = statistics.median(others) if others else None
    anomaly = None
    if own is not None and med:
        anomaly = round((own - med) / med * 100, 1)
    return {
        "month": main_month,
        "value": None if own is None else round(own, 3),
        "median": None if med is None else round(med, 3),
        "years": len(others),
        "anomaly": anomaly,
    }


def validate_events(events: list[dict]) -> None:
    """Validación mínima de lo que usa el cruce (la validación completa vive en el paso de curaduría)."""
    seen: set[str] = set()
    for ev in events:
        for key in ("id", "lat", "lon", "start", "end"):
            if key not in ev:
                raise ValueError(f"event without '{key}': {ev.get('id', ev)}")
        if ev["id"] in seen:
            raise ValueError(f"duplicate event id: {ev['id']}")
        seen.add(ev["id"])
        if date.fromisoformat(ev["end"]) < date.fromisoformat(ev["start"]):
            raise ValueError(f"event {ev['id']}: end before start")
        r = float(ev.get("radius_km", config.MUSEUM_AOI_KM))
        if not 0 < r <= config.MUSEUM_AOI_MAX_KM:
            raise ValueError(f"event {ev['id']}: radius_km {r} out of range")


def cross_match(con, cal: dict, events: list[dict]) -> dict:
    """Cruza eventos curados con FIRMS: {id evento -> match} (estructura MuseumEvent.match)."""
    validate_events(events)
    mo = calibrate.load_monthly(con)
    masked = _masked_cells(con)
    return {ev["id"]: _match(con, cal, mo, masked, ev) for ev in events}


def load_events(path: Path) -> list[dict]:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("schema") != 1:
        raise ValueError(f"{path}: unsupported events schema {doc.get('schema')!r}")
    return doc["events"]


def build_museum_artifact(con, cal: dict, events: list[dict], out_dir: Path, version: str) -> Path:
    """Escribe out_dir/<version>/museum.json y devuelve su ruta."""
    from firespire import export

    matches = cross_match(con, cal, events)
    doc = {
        "schema": 1,
        "version": version,
        "generated_at": _now(),
        "params": {
            "window_pad_days": config.MUSEUM_WINDOW_PAD_DAYS,
            "min_celldays": config.MUSEUM_MIN_CELLDAYS,
            "max_points": config.MUSEUM_MAX_POINTS,
        },
        "events": [{**ev, "match": matches[ev["id"]]} for ev in events],
    }
    vdir = Path(out_dir) / version
    vdir.mkdir(parents=True, exist_ok=True)
    path = vdir / "museum.json"
    export._dump(doc, path)
    return path


def maybe_build(con, cal: dict, out_dir: Path, version: str, events_path: Path | None = None):
    """Llamado por `build`: genera museum.json solo si existe el archivo de eventos curados."""
    path = config.MUSEUM_EVENTS if events_path is None else events_path
    if not path.exists():
        return None
    return build_museum_artifact(con, cal, load_events(path), out_dir, version)
