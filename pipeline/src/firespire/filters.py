"""Etapa 2: filtros de calidad. Crea `detections_filtered` (mismas columnas que `detections`)."""
from __future__ import annotations

import duckdb

from . import config


def apply(con: duckdb.DuckDBPyConnection) -> None:
    drop = ", ".join(f"'{c}'" for c in config.VIIRS_DROP_CONFIDENCE)
    con.execute("DROP TABLE IF EXISTS detections_filtered")
    con.execute(
        f"""CREATE TABLE detections_filtered AS
        SELECT * FROM detections
        WHERE CASE family
            -- los CSV NRT de la API no traen `type`: se acepta NULL en ambas familias
            WHEN '{config.MODIS}' THEN (type IS NULL OR type = {config.VEGETATION_TYPE})
                AND TRY_CAST(confidence_raw AS INTEGER) >= {config.MODIS_MIN_CONFIDENCE}
            WHEN '{config.VIIRS}' THEN confidence_raw NOT IN ({drop})
                AND (type IS NULL OR type = {config.VEGETATION_TYPE})
            ELSE false END"""
    )
