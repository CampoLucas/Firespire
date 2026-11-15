"""Etapa 1: lee los CSV de FIRMS y crea la tabla `detections` (ver docs/contratos.md)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import duckdb

from . import config

_MODIS_RE = re.compile(r"^modis_(\d{4})_(.+)\.csv$")
_VIIRS_RE = re.compile(r"^viirs-(\w+)_(\d{4})_(.+)\.csv$")


@dataclass(frozen=True)
class SourceFile:
    path: Path
    family: str  # MODIS | VIIRS
    year: int
    country: str
    satellite: str | None  # solo VIIRS (sale del nombre de archivo); MODIS usa la columna


def discover(folders: list[Path]) -> list[SourceFile]:
    """Busca CSV con nombre FIRMS en las carpetas. Ignora los demás; clave VIIRS desconocida es error."""
    found: list[SourceFile] = []
    for folder in folders:
        for path in sorted(Path(folder).glob("*.csv")):
            if m := _MODIS_RE.match(path.name):
                found.append(SourceFile(path, config.MODIS, int(m[1]), m[2], None))
            elif m := _VIIRS_RE.match(path.name):
                sat = config.VIIRS_FILE_SATELLITE.get(m[1])
                if sat is None:
                    raise ValueError(
                        f"Clave VIIRS desconocida '{m[1]}' en {path.name}; "
                        f"esperadas: {sorted(config.VIIRS_FILE_SATELLITE)}"
                    )
                found.append(SourceFile(path, config.VIIRS, int(m[2]), m[3], sat))
    return found


_COLUMNS = """family VARCHAR, satellite VARCHAR, lat DOUBLE, lon DOUBLE, acq_date DATE,
    acq_time VARCHAR, confidence_raw VARCHAR, confidence_class TINYINT, type TINYINT,
    frp DOUBLE, daynight VARCHAR, product VARCHAR"""


def ingest(con: duckdb.DuckDBPyConnection, folders: list[Path]) -> None:
    """Crea `detections` con todos los CSV descubiertos en `folders`."""
    files = discover(folders)
    con.execute("DROP TABLE IF EXISTS detections")
    con.execute(f"CREATE TABLE detections ({_COLUMNS})")

    con.execute("CREATE OR REPLACE TEMP TABLE _sat_alias (raw VARCHAR, sat VARCHAR)")
    for raw, sat in config.SATELLITE_ALIASES.items():
        con.execute("INSERT INTO _sat_alias VALUES (?, ?)", [raw, sat])

    src = "read_csv(?, all_varchar=true, header=true)"
    for f in files:
        cols = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {src}", [str(f.path)]).fetchall()}
        type_expr = "TRY_CAST(r.type AS TINYINT)" if "type" in cols else "NULL::TINYINT"
        if f.family == config.MODIS:
            _check_modis_satellites(con, f)
            sat_expr = "a.sat"
            join = "JOIN _sat_alias a ON a.raw = trim(r.satellite)"
            klass = (
                "CASE WHEN TRY_CAST(r.confidence AS INTEGER) >= 80 THEN 2 "
                "WHEN TRY_CAST(r.confidence AS INTEGER) >= 30 THEN 1 ELSE 0 END"
            )
            params = [str(f.path)]
        else:
            sat_expr = "?"
            join = ""
            klass = "CASE r.confidence WHEN 'h' THEN 2 WHEN 'n' THEN 1 WHEN 'l' THEN 0 END"
            params = [f.satellite, str(f.path)]
        con.execute(
            f"""INSERT INTO detections
            SELECT '{f.family}', {sat_expr}, TRY_CAST(r.latitude AS DOUBLE),
                TRY_CAST(r.longitude AS DOUBLE), TRY_CAST(r.acq_date AS DATE),
                lpad(r.acq_time, 4, '0'), r.confidence, ({klass})::TINYINT, {type_expr},
                TRY_CAST(r.frp AS DOUBLE), r.daynight,
                CASE WHEN r.version LIKE '%NRT' THEN 'NRT' ELSE 'SP' END
            FROM {src} r {join}""",
            params,
        )
    con.execute("DROP TABLE _sat_alias")


def _check_modis_satellites(con: duckdb.DuckDBPyConnection, f: SourceFile) -> None:
    """Error si el CSV MODIS trae un valor de `satellite` fuera de SATELLITE_ALIASES."""
    vals = {
        r[0]
        for r in con.execute(
            "SELECT DISTINCT trim(satellite) FROM read_csv(?, all_varchar=true)", [str(f.path)]
        ).fetchall()
    }
    unknown = sorted(str(v) for v in vals - set(config.SATELLITE_ALIASES))
    if unknown:
        raise ValueError(f"Satélite MODIS desconocido {unknown} en {f.path.name}")
