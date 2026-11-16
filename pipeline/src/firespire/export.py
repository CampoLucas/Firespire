"""Export de artefactos v1 (contrato: docs/contratos.md y web/lib/artifact-types.ts)."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import h3
import numpy as np
import shapely
from shapely.geometry import shape
from shapely.strtree import STRtree

from firespire import calibrate, config

UINT16_MAX = 65535


def _dump(obj, path: Path) -> None:
    """JSON compacto, UTF-8, sin NaN (allow_nan=False falla si se cuela uno)."""
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def _assign_provinces(
    cells: list[str], geojson_path: Path | None
) -> tuple[list[int], list[str], list[str]]:
    """(prov por celda, nombres de provincias, avisos). Celda -> provincia que contiene su centro."""
    path = config.PROVINCES_GEOJSON if geojson_path is None else geojson_path
    if not path.exists():
        return (
            [-1] * len(cells),
            [],
            ["Province boundaries file not found; no cell was assigned to a province."],
        )
    feats = json.loads(path.read_text(encoding="utf-8"))["features"]
    names = sorted({f["properties"]["name"] for f in feats})
    geoms, gidx = [], []
    for f in feats:
        geoms.append(shape(f["geometry"]))
        gidx.append(names.index(f["properties"]["name"]))
    prov = np.full(len(cells), -1, dtype=np.int64)
    if cells and geoms:
        latlng = [h3.cell_to_latlng(c) for c in cells]  # (lat, lng); GeoJSON es lon/lat
        pts = shapely.points([ll[1] for ll in latlng], [ll[0] for ll in latlng])
        tree = STRtree(geoms)
        pt_i, geom_i = tree.query(pts, predicate="intersects")
        # Ante varias coincidencias (borde), gana el primer polígono del archivo.
        for p, g in sorted(zip(pt_i.tolist(), geom_i.tolist(), strict=True), reverse=True):
            prov[p] = gidx[g]
    return prov.tolist(), names, []


def _ranges(months: list[str]) -> str:
    """'2025-01 to 2026-09, 2027-03' a partir de una lista ordenada de meses."""
    def ordinal(m: str) -> int:
        return int(m[:4]) * 12 + int(m[5:7])

    spans: list[list[str]] = []
    for m in months:
        if spans and ordinal(m) == ordinal(spans[-1][1]) + 1:
            spans[-1][1] = m
        else:
            spans.append([m, m])
    return ", ".join(a if a == b else f"{a} to {b}" for a, b in spans)


def _table_exists(con, name: str) -> bool:
    return (
        con.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]
        ).fetchone()[0]
        > 0
    )


def _coverage_warnings(calibration: dict, satellites: dict[str, list[str]]) -> list[str]:
    out: list[str] = []
    for fam in (config.MODIS, config.VIIRS):
        if not satellites[fam]:
            out.append(f"No {fam} data at all in this run.")
    for r in calibration["regimes"]:
        if r["first_month"] is None:
            continue
        span = f"{r['first_month']} to {r['last_month']}"
        for sat in r["satellites_expected"]:
            if sat not in r["satellites_observed"]:
                out.append(
                    f"Regime {r['id']} expects satellite {sat} but no {sat} data was found "
                    f"between {span}."
                )
        if r["method"] == "direct_incomplete":
            missing = [x for x in r["satellites_expected"] if x not in r["satellites_observed_sp"]]
            out.append(
                f"Regime {r['id']} k comes only from standard-product months missing "
                f"{', '.join(missing)}; it is provisional and biased until a complete archive "
                "is loaded."
            )
        elif r["method"] == "direct" and r["sp_months_incomplete"]:
            out.append(
                f"Regime {r['id']} k skips {len(r['sp_months_incomplete'])} standard-product "
                "months that lack an expected satellite."
            )
        if r["k"] is None:
            out.append(f"Regime {r['id']} ({span}) has no k estimate; VIIRS cannot be harmonized there.")
    return out


def _build_blocks(con, cells: list[str], months: list[str]) -> list[tuple[str, str, np.ndarray]]:
    ci = {c: i for i, c in enumerate(cells)}
    mi = {m: i for i, m in enumerate(months)}
    shape_ = (len(cells), len(months))
    cd = {f: np.zeros(shape_, dtype=np.uint8) for f in (config.MODIS, config.VIIRS)}
    hs = {f: np.zeros(shape_, dtype=np.uint16) for f in (config.MODIS, config.VIIRS)}
    rows = con.execute(
        "SELECT h3, strftime(date, '%Y-%m'), family, count(DISTINCT date), sum(n) "
        "FROM cell_days GROUP BY 1, 2, 3"
    ).fetchall()
    for h, m, fam, ncd, nh in rows:
        i, j = ci[h], mi[m]
        cd[fam][i, j] = ncd
        hs[fam][i, j] = min(int(nh), UINT16_MAX)
    return [
        ("celldays_modis", "uint8", cd[config.MODIS]),
        ("celldays_viirs", "uint8", cd[config.VIIRS]),
        ("hotspots_modis", "uint16le", hs[config.MODIS]),
        ("hotspots_viirs", "uint16le", hs[config.VIIRS]),
    ]


def write(
    con,
    calibration: dict,
    validation: dict,
    out_dir: Path,
    version: str,
    geojson_path: Path | None = None,
) -> Path:
    """Escribe los artefactos en out_dir/<version>/ y out_dir/latest.json; devuelve el dir."""
    mo = calibrate.load_monthly(con)
    if not mo.months:
        raise ValueError("cell_days is empty; nothing to export")
    months = mo.months
    cells = [r[0] for r in con.execute("SELECT DISTINCT h3 FROM cell_days ORDER BY h3").fetchall()]
    n_cells, n_months = len(cells), len(months)

    # monthly.bin: cuatro bloques consecutivos, cell-major, little-endian.
    blocks, chunks, offset = [], [], 0
    for name, dtype, arr in _build_blocks(con, cells, months):
        data = arr.astype("<u2" if dtype == "uint16le" else np.uint8).tobytes()
        blocks.append({"name": name, "dtype": dtype, "offset": offset, "length": arr.size})
        chunks.append(data)
        offset += len(data)

    prov, provinces, prov_warnings = _assign_provinces(cells, geojson_path)
    satellites = {fam: sorted({s for m in months for s in mo.satellites.get(m, {}).get(fam, ())})
                  for fam in (config.MODIS, config.VIIRS)}
    # Meses sin ninguna fila de la familia: hueco de cobertura, no "cero fuego".
    missing = {fam: [m for m in months if not mo.satellites.get(m, {}).get(fam)]
               for fam in (config.MODIS, config.VIIRS)}
    gap_warnings = [
        f"No {fam} data for {len(ms)} of {n_months} months ({_ranges(ms)}); "
        "they are shown as no data, not as zero fire."
        for fam, ms in missing.items() if ms and len(ms) < n_months
    ]
    masked = (
        con.execute("SELECT count(*) FROM masked_cells").fetchone()[0]
        if _table_exists(con, "masked_cells")
        else 0
    )
    meta = {
        "schema": config.SCHEMA_VERSION,
        "version": version,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "h3_res": config.H3_RES,
        "first_month": months[0],
        "n_months": n_months,
        "first_provisional_month": mo.first_provisional,
        "n_cells": n_cells,
        "filters": {
            "type": config.VEGETATION_TYPE,
            "modis_min_confidence": config.MODIS_MIN_CONFIDENCE,
            "viirs_drop_confidence": list(config.VIIRS_DROP_CONFIDENCE),
            "mask": {
                "res": config.MASK_RES,
                "fraction": config.MASK_FRACTION,
                "min_days": config.MASK_MIN_DAYS,
                "masked_cells": masked,
            },
        },
        "satellites": satellites,
        "months_without_data": missing,
        "warnings": prov_warnings + _coverage_warnings(calibration, satellites) + gap_warnings,
        "monthly": {"file": "monthly.bin", "layout": "cell-major", "blocks": blocks},
    }

    vdir = Path(out_dir) / version
    vdir.mkdir(parents=True, exist_ok=True)
    (vdir / "monthly.bin").write_bytes(b"".join(chunks))
    _dump(meta, vdir / "meta.json")
    _dump({"h3": cells, "prov": prov, "provinces": provinces}, vdir / "cells.json")
    _dump(calibration, vdir / "calibration.json")
    _dump(validation, vdir / "validation.json")
    _dump({"version": version}, Path(out_dir) / "latest.json")
    return vdir
