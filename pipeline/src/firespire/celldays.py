"""Etapas 3 y 5: asignación de celdas H3 (`det_cells`) y agregado `cell_days`."""
from __future__ import annotations

import duckdb
import h3
import pandas as pd

from . import config


def assign_cells(con: duckdb.DuckDBPyConnection) -> None:
    """Crea `det_cells` = `detections_filtered` + `h3`. H3 se calcula solo por (lat, lon) distintos."""
    pairs = con.execute(
        "SELECT DISTINCT lat, lon FROM detections_filtered WHERE lat IS NOT NULL AND lon IS NOT NULL"
    ).fetchall()
    df = pd.DataFrame(
        {
            "lat": pd.Series([p[0] for p in pairs], dtype="float64"),
            "lon": pd.Series([p[1] for p in pairs], dtype="float64"),
            "h3": pd.Series([h3.latlng_to_cell(lat, lon, config.H3_RES) for lat, lon in pairs], dtype="object"),
        }
    )
    con.register("_latlon_df", df)
    con.execute("CREATE OR REPLACE TEMP TABLE _latlon_h3 AS SELECT lat, lon, h3::VARCHAR AS h3 FROM _latlon_df")
    con.unregister("_latlon_df")
    con.execute("DROP TABLE IF EXISTS det_cells")
    con.execute(
        """CREATE TABLE det_cells AS
        SELECT d.*, c.h3 FROM detections_filtered d
        JOIN _latlon_h3 c ON c.lat = d.lat AND c.lon = d.lon"""
    )
    con.execute("DROP TABLE _latlon_h3")


def build(con: duckdb.DuckDBPyConnection) -> None:
    """Crea `cell_days`: celda x día x satélite x producto, sin celdas enmascaradas."""
    if config.MASK_RES == config.H3_RES:
        masked = "SELECT h3 FROM masked_cells"
    else:  # masked_cells está en MASK_RES: se compara contra el padre de cada celda
        cells = [r[0] for r in con.execute("SELECT DISTINCT h3 FROM det_cells").fetchall()]
        parents = [h3.cell_to_parent(c, config.MASK_RES) for c in cells]
        df = pd.DataFrame({"h3": pd.Series(cells, dtype="object"), "parent": pd.Series(parents, dtype="object")})
        con.register("_parent_df", df)
        con.execute("CREATE OR REPLACE TEMP TABLE _cell_parent AS SELECT h3::VARCHAR AS h3, parent::VARCHAR AS parent FROM _parent_df")
        con.unregister("_parent_df")
        masked = "SELECT p.h3 FROM _cell_parent p JOIN masked_cells m ON m.h3 = p.parent"
    con.execute("DROP TABLE IF EXISTS cell_days")
    con.execute(
        f"""CREATE TABLE cell_days AS
        SELECT h3, acq_date AS date, family, satellite, product, count(*)::INTEGER AS n
        FROM det_cells
        WHERE h3 NOT IN ({masked})
        GROUP BY h3, acq_date, family, satellite, product"""
    )
    con.execute("DROP TABLE IF EXISTS _cell_parent")
