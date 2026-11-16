"""Etapa 4: máscara de fuentes persistentes. Crea `masked_cells` (columna `h3`, en MASK_RES)."""
from __future__ import annotations

import duckdb
import h3
import pandas as pd

from . import config


def build(con: duckdb.DuckDBPyConnection) -> None:
    """Celdas con detección (cualquier familia) en más de MASK_FRACTION de los días con datos.

    Días con datos = fechas con al menos una detección en det_cells: los huecos de cobertura
    (años sin CSV) no diluyen la fracción. Se evalúa solo con al menos MASK_MIN_DAYS días.
    """
    src = "det_cells"
    if config.MASK_RES != config.H3_RES:
        cells = [r[0] for r in con.execute("SELECT DISTINCT h3 FROM det_cells").fetchall()]
        parents = [h3.cell_to_parent(c, config.MASK_RES) for c in cells]
        df = pd.DataFrame({"h3": pd.Series(cells, dtype="object"), "parent": pd.Series(parents, dtype="object")})
        con.register("_parent_df", df)
        con.execute("CREATE OR REPLACE TEMP TABLE _mask_parent AS SELECT h3::VARCHAR AS h3, parent::VARCHAR AS parent FROM _parent_df")
        con.unregister("_parent_df")
        src = "(SELECT p.parent AS h3, d.acq_date FROM det_cells d JOIN _mask_parent p ON p.h3 = d.h3)"
    con.execute("DROP TABLE IF EXISTS masked_cells")
    con.execute(
        f"""CREATE TABLE masked_cells AS
        WITH rng AS (
            SELECT count(DISTINCT acq_date) AS n_days FROM det_cells
        )
        SELECT h3 FROM {src}, rng
        WHERE rng.n_days >= {config.MASK_MIN_DAYS}
        GROUP BY h3, rng.n_days
        HAVING count(DISTINCT acq_date) > {config.MASK_FRACTION} * rng.n_days"""
    )
    con.execute("DROP TABLE IF EXISTS _mask_parent")
